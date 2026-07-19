import "server-only";

import { loadLatestSafeEnglishNmPrices } from "@/lib/card-market-history";
import { db } from "@/lib/db";
import {
  calculateExpansionChaseSeedScore,
  DEFAULT_EXPANSION_CHASE_CANDIDATE_LIMIT,
  getExpansionChaseFreshness,
  getExpansionChaseReadiness,
  getExpansionChaseVerdict,
  rankExpansionChaseSignals,
  selectExpansionChaseCandidates,
  type ExpansionChaseFreshness,
  type ExpansionChaseReadiness,
  type ExpansionChaseVerdict,
} from "@/lib/expansion-chase-radar-core";
import { enrichSignalsWithMarketIntelligence } from "@/lib/external-market-intelligence";
import {
  getPressureTierForScore,
  type ExternalCardSignal,
  type ExternalPriceScenario,
} from "@/lib/external-signal-radar";
import {
  ALL_GAMES,
  ONE_PIECE_GAME,
  POKEMON_GAME,
  normalizeTradingCardGame,
  type TradingCardGame,
  type TradingCardGameFilter,
} from "@/lib/games";

const NON_STALE_FRESHNESS = new Set<ExpansionChaseFreshness>(["fresh", "aging"]);

export interface ExpansionChaseRadarOptions {
  gameFilter?: TradingCardGameFilter;
  episodeId?: string | null;
  now?: Date;
  candidateLimit?: number;
}

export interface ExpansionChaseRadarEpisode {
  id: string;
  game: TradingCardGame;
  name: string;
  code: string | null;
  releaseDate: string | null;
  localCardCount: number;
  knownCardCount: number;
}

export interface ExpansionChaseRadarCard {
  setRank: number;
  cardId: string;
  name: string;
  imageUrl: string | null;
  cardNumber: string | null;
  rarity: string | null;
  currentPrice: number;
  currency: "EUR";
  priceAsOf: string;
  changeVs7dPct: number | null;
  changeVs30dPct: number | null;
  freshness: ExpansionChaseFreshness;
  opportunityScore: number;
  scenarioConfidence: ExternalPriceScenario["confidence"] | null;
  scenario: ExternalPriceScenario | null;
  verdict: ExpansionChaseVerdict;
}

export interface ExpansionChaseRadarData {
  generatedAt: string;
  episode: ExpansionChaseRadarEpisode;
  readiness: ExpansionChaseReadiness;
  freshness: ExpansionChaseFreshness;
  priceCoveragePct: number;
  currentPriceCoveragePct: number;
  pricedCardCount: number;
  currentPricedCardCount: number;
  priceAsOf: string | null;
  releaseAgeDays: number | null;
  cards: ExpansionChaseRadarCard[];
}

const EPISODE_SELECT = {
  id: true,
  game: true,
  name: true,
  code: true,
  release_date: true,
  card_count: true,
  source_actual_card_count: true,
  _count: { select: { cards: true } },
} as const;

function gameWhere(gameFilter: TradingCardGameFilter) {
  return gameFilter === ALL_GAMES
    ? { in: [POKEMON_GAME, ONE_PIECE_GAME] }
    : gameFilter;
}

async function findRadarEpisode(
  gameFilter: TradingCardGameFilter,
  episodeId: string | null | undefined,
  now: Date
) {
  if (episodeId) {
    return db.episode.findFirst({
      where: {
        id: episodeId,
        game: gameWhere(gameFilter),
      },
      select: EPISODE_SELECT,
    });
  }

  // Empty launch shells (for example a newly announced set whose cards have
  // not arrived yet) must not hide the newest set that Radar can truly assess.
  return db.episode.findFirst({
    where: {
      game: gameWhere(gameFilter),
      release_date: { not: null, lte: now.toISOString().slice(0, 10) },
      cards: {
        some: {
          prices: {
            some: { cm_en_lowest_nm: { gt: 0, not: 9001 } },
          },
        },
      },
    },
    orderBy: [{ release_date: "desc" }, { id: "desc" }],
    select: EPISODE_SELECT,
  });
}

function newestDate(values: Array<Date | null>): Date | null {
  let newest: Date | null = null;
  for (const value of values) {
    if (value && (!newest || value.getTime() > newest.getTime())) newest = value;
  }
  return newest;
}

function changePercent(current: number, baseline: number | null | undefined): number | null {
  if (baseline == null || !Number.isFinite(baseline) || baseline <= 0) return null;
  return Number((((current - baseline) / baseline) * 100).toFixed(1));
}

/**
 * Loads a set-scoped, market-timed chase ranking. It intentionally does not
 * require a persisted/global Signal Radar observation: new set cards are
 * analysed as structural seeds and enriched together in one market batch.
 */
export async function getExpansionChaseRadarData(
  options: ExpansionChaseRadarOptions = {}
): Promise<ExpansionChaseRadarData | null> {
  const gameFilter = options.gameFilter ?? POKEMON_GAME;
  const now = options.now ?? new Date();
  const episode = await findRadarEpisode(gameFilter, options.episodeId, now);
  if (!episode) return null;

  const cards = await db.card.findMany({
    where: { episode_id: episode.id },
    orderBy: [{ card_number: "asc" }, { id: "asc" }],
    select: {
      id: true,
      game: true,
      episode_id: true,
      name: true,
      image_url: true,
      card_number: true,
      printed_card_number: true,
      rarity: true,
      cardmarket_id: true,
      cardmarket_url: true,
    },
  });
  const latestPrices = await loadLatestSafeEnglishNmPrices(
    cards.map((card) => ({
      id: card.id,
      game: card.game,
      episodeId: card.episode_id,
      name: card.name,
      cardNumber: card.card_number,
      printedCardNumber: card.printed_card_number,
      cardmarketId: card.cardmarket_id,
      cardmarketUrl: card.cardmarket_url,
    }))
  );
  const candidateInputs = cards.map((card) => {
    const latestPrice = latestPrices.get(card.id) ?? null;
    return {
      id: card.id,
      name: card.name,
      imageUrl: card.image_url,
      cardNumber: card.card_number,
      printedCardNumber: card.printed_card_number,
      rarity: card.rarity,
      currentPrice: latestPrice?.value ?? null,
      priceFetchedAt: latestPrice?.fetchedAt ?? null,
    };
  });
  const pricedCards = candidateInputs.filter((card) => card.currentPrice != null);
  const currentPricedCards = pricedCards.filter((card) =>
    NON_STALE_FRESHNESS.has(getExpansionChaseFreshness(card.priceFetchedAt, now))
  );
  const latestPriceAt = newestDate(pricedCards.map((card) => {
    if (!card.priceFetchedAt) return null;
    const date = card.priceFetchedAt instanceof Date
      ? card.priceFetchedAt
      : new Date(card.priceFetchedAt);
    return Number.isFinite(date.getTime()) ? date : null;
  }));
  const readiness = getExpansionChaseReadiness({
    localCardCount: cards.length,
    pricedCardCount: pricedCards.length,
    currentPricedCardCount: currentPricedCards.length,
    releaseDate: episode.release_date,
    latestPriceAt,
    now,
  });
  const selectedCandidates = selectExpansionChaseCandidates(
    candidateInputs,
    options.candidateLimit ?? DEFAULT_EXPANSION_CHASE_CANDIDATE_LIMIT
  );
  const candidatesById = new Map(selectedCandidates.map((card) => [card.id, card]));
  const game = normalizeTradingCardGame(episode.game);
  const seeds: ExternalCardSignal[] = selectedCandidates.map((card) => {
    const externalScore = calculateExpansionChaseSeedScore(card);
    const pressure = getPressureTierForScore(externalScore);
    return {
      rank: 0,
      cardId: card.id,
      sourceMode: "structural",
      manualResearch: true,
      game,
      name: card.name,
      imageUrl: card.imageUrl,
      cardNumber: card.printedCardNumber ?? card.cardNumber,
      episodeName: episode.name,
      episodeCode: episode.code,
      rarity: card.rarity,
      currentPrice: card.currentPrice,
      currency: "EUR",
      externalScore,
      competitiveScore: -1,
      confidence: "Emerging",
      horizon: "30-90 day watch",
      pressureLabel: pressure.label,
      pressureExplanation: "Set-scoped scarcity, value and market-timing analysis",
      reasons: [
        `${card.rarity ?? "Higher-rarity card"} selected as a set chase candidate`,
        "Market, sealed, rarity, artist and grading context are analysed together",
      ],
      evidence: [],
      maxDeckSharePercent: 0,
      maxInclusionPercent: 0,
      archetypeCount: 0,
    };
  });
  const enriched = seeds.length
    ? await enrichSignalsWithMarketIntelligence(seeds, now)
    : [];
  const ranked = rankExpansionChaseSignals(enriched);
  const rankedCards = ranked.flatMap((signal, index): ExpansionChaseRadarCard[] => {
    const candidate = candidatesById.get(signal.cardId);
    if (!candidate || candidate.currentPrice == null || !candidate.priceFetchedAt) return [];
    const priceAsOf =
      candidate.priceFetchedAt instanceof Date
        ? candidate.priceFetchedAt
        : new Date(candidate.priceFetchedAt);
    if (!Number.isFinite(priceAsOf.getTime())) return [];
    const freshness = getExpansionChaseFreshness(priceAsOf, now);
    const latestPrice = latestPrices.get(signal.cardId);
    const changeVs7dPct = changePercent(
      candidate.currentPrice,
      latestPrice?.row.cm_en_avg_7d
    );
    const changeVs30dPct = changePercent(
      candidate.currentPrice,
      latestPrice?.row.cm_en_avg_30d
    );
    const scenario = signal.marketIntelligence?.rawScenario ?? null;
    const opportunityScore =
      signal.marketIntelligence?.rawOpportunityScore ?? signal.externalScore;
    return [{
      setRank: index + 1,
      cardId: signal.cardId,
      name: signal.name,
      imageUrl: signal.imageUrl,
      cardNumber: signal.cardNumber,
      rarity: signal.rarity,
      currentPrice: candidate.currentPrice,
      currency: "EUR",
      priceAsOf: priceAsOf.toISOString(),
      changeVs7dPct,
      changeVs30dPct,
      freshness,
      opportunityScore,
      scenarioConfidence: scenario?.confidence ?? null,
      scenario,
      verdict: getExpansionChaseVerdict({
        scenario,
        opportunityScore,
        freshness,
        observedChange7dPct: changeVs7dPct,
      }),
    }];
  });

  return {
    generatedAt: now.toISOString(),
    episode: {
      id: episode.id,
      game,
      name: episode.name,
      code: episode.code,
      releaseDate: episode.release_date,
      localCardCount: cards.length,
      knownCardCount: Math.max(
        cards.length,
        episode.card_count ?? 0,
        episode.source_actual_card_count ?? 0
      ),
    },
    readiness: readiness.readiness,
    freshness: readiness.freshness,
    priceCoveragePct: readiness.priceCoveragePct,
    currentPriceCoveragePct: readiness.currentPriceCoveragePct,
    pricedCardCount: pricedCards.length,
    currentPricedCardCount: currentPricedCards.length,
    priceAsOf: latestPriceAt?.toISOString() ?? null,
    releaseAgeDays: readiness.releaseAgeDays,
    cards: rankedCards,
  };
}
