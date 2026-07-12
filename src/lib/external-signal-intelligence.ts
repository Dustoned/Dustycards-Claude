import "server-only";

import { db } from "@/lib/db";
import { getExternalEntityKey } from "@/lib/external-event-candidates";
import {
  enrichSignalsWithMarketIntelligence,
  loadCollectorDemandScores,
} from "@/lib/external-market-intelligence";
import { getExternalForecastSummaries } from "@/lib/external-signal-forecast-store";
import type {
  ExternalCardSignal,
  ExternalEvidenceLevel,
  ExternalSignalCatalyst,
  ExternalSignalRadarData,
} from "@/lib/external-signal-radar";
import { getPressureTierForScore } from "@/lib/external-signal-radar";
import type { TradingCardGame } from "@/lib/games";
import { KNOWN_RARITY_ORDER, normalizeRarityLabel } from "@/lib/rarity";
import { createSwrCache } from "@/lib/server-swr-cache";

const SQLITE_SAFE_CARD_CHUNK_SIZE = 50;
const MAX_CATALYSTS_PER_CARD = 3;
const MAX_EVENT_ONLY_SIGNALS = 30;
const MAX_EVENT_VARIANTS_PER_ENTITY = 3;
const MIN_EVENT_ONLY_SCORE = 40;
const MAX_STRUCTURAL_SIGNALS = 45;
const structuralSignalCache = createSwrCache<ExternalCardSignal[]>(6 * 60 * 60_000, 24 * 60 * 60_000);

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function isCatalystKind(value: string): value is ExternalSignalCatalyst["kind"] {
  return [
    "support",
    "product",
    "reveal",
    "localization",
    "reprint",
    "ban",
    "rotation",
    "hype",
  ].includes(value);
}

function isCatalystDirection(
  value: string
): value is ExternalSignalCatalyst["direction"] {
  return ["positive", "negative", "neutral"].includes(value);
}

function isSourceKind(value: string): value is ExternalSignalCatalyst["sourceKind"] {
  return ["official", "community", "social"].includes(value);
}

function evidenceLevel(
  sourceKind: ExternalSignalCatalyst["sourceKind"],
  text: string
): ExternalEvidenceLevel {
  if (sourceKind === "official") return "Confirmed";
  if (sourceKind === "social") return "Rumour";
  return /\b(?:leak|leaked|booklet|scan|photo)\b/i.test(text)
    ? "Credible leak"
    : "Strong evidence";
}

function catalystContext(kind: ExternalSignalCatalyst["kind"], text: string): string | null {
  const region = /\b(?:japan|japanese|jp)\b/i.test(text)
    ? "Japanese"
    : /\b(?:english|international|global)\b/i.test(text)
      ? "English / global"
      : null;
  const stage = /\b(?:leak|leaked|booklet)\b/i.test(text)
    ? "leak"
    : kind === "reveal"
      ? "reveal"
      : kind === "localization"
        ? "set mapping"
        : kind === "product"
          ? "product"
          : null;
  return [region, stage].filter(Boolean).join(" · ") || null;
}

async function loadActiveCatalysts(
  cardIds: readonly string[],
  now: Date
): Promise<Map<string, ExternalSignalCatalyst[]>> {
  const byCard = new Map<string, ExternalSignalCatalyst[]>();
  for (let index = 0; index < cardIds.length; index += SQLITE_SAFE_CARD_CHUNK_SIZE) {
    const rows = await db.externalCardCatalyst.findMany({
      where: {
        card_id: { in: cardIds.slice(index, index + SQLITE_SAFE_CARD_CHUNK_SIZE) },
        OR: [{ expires_at: null }, { expires_at: { gt: now } }],
      },
      orderBy: [{ observed_at: "desc" }, { strength: "desc" }],
      include: {
        source: {
          select: {
            canonical_url: true,
            domain: true,
            source_type: true,
            title: true,
            description: true,
          },
        },
      },
    });
    for (const row of rows) {
      if (
        !row.card_id ||
        !isCatalystKind(row.catalyst_type) ||
        !isCatalystDirection(row.direction) ||
        !isSourceKind(row.source.source_type)
      ) {
        continue;
      }
      const existing = byCard.get(row.card_id) ?? [];
      if (existing.length >= MAX_CATALYSTS_PER_CARD) continue;
      const sourceText = [
        row.source.title,
        row.source.description,
        row.headline,
        row.evidence_excerpt,
      ]
        .filter(Boolean)
        .join(" ");
      existing.push({
        id: row.id,
        kind: row.catalyst_type,
        direction: row.direction,
        strength: clamp(row.strength, 0, 1),
        headline: row.headline,
        explanation: row.explanation,
        sourceUrl: row.source.canonical_url,
        sourceDomain: row.source.domain,
        sourceKind: row.source.source_type,
        evidenceLevel: evidenceLevel(row.source.source_type, sourceText),
        contextLabel: catalystContext(row.catalyst_type, sourceText),
        observedAt: row.observed_at.toISOString(),
        expiresAt: row.expires_at?.toISOString() ?? null,
      });
      byCard.set(row.card_id, existing);
    }
  }
  return byCard;
}

function calculateCatalystScores(catalysts: readonly ExternalSignalCatalyst[]): {
  catalystScore: number;
  hypeScore: number;
  riskScore: number;
} {
  let catalystScore = 0;
  let hypeScore = 0;
  let riskScore = 0;
  for (const catalyst of catalysts) {
    const sourceWeight =
      catalyst.sourceKind === "official" ? 1 : catalyst.sourceKind === "community" ? 0.75 : 0.4;
    const weightedStrength = catalyst.strength * sourceWeight;
    const signed = catalyst.direction === "positive" ? weightedStrength : -weightedStrength;
    if (catalyst.kind === "hype") hypeScore += signed;
    else if (catalyst.direction === "negative") riskScore += weightedStrength;
    else catalystScore += signed;
  }
  return {
    catalystScore: clamp(catalystScore, -1, 1),
    hypeScore: clamp(hypeScore, -1, 1),
    riskScore: clamp(riskScore, 0, 1),
  };
}

function getEventConfidence(catalysts: readonly ExternalSignalCatalyst[]): ExternalCardSignal["confidence"] {
  if (catalysts.some((catalyst) => catalyst.evidenceLevel === "Confirmed")) return "High";
  const independentSources = new Set(catalysts.map((catalyst) => catalyst.sourceUrl)).size;
  if (independentSources >= 2) return "High";
  if (
    catalysts.some((catalyst) =>
      ["Strong evidence", "Credible leak"].includes(catalyst.evidenceLevel)
    )
  ) {
    return "Medium";
  }
  return "Emerging";
}

export function calculateExternalEventScore(
  catalysts: readonly ExternalSignalCatalyst[],
  scores: ReturnType<typeof calculateCatalystScores>
): number {
  const sourceBonus = Math.min(8, new Set(catalysts.map((item) => item.sourceUrl)).size * 3);
  return Math.round(
    clamp(
      24 +
        Math.max(0, scores.catalystScore) * 48 +
        Math.max(0, scores.hypeScore) * 20 +
        sourceBonus -
        scores.riskScore * 38,
      0,
      100
    )
  );
}

async function loadActiveCatalystCardIds(now: Date): Promise<string[]> {
  const rows = await db.externalCardCatalyst.findMany({
    where: {
      card_id: { not: null },
      direction: { in: ["positive", "neutral"] },
      OR: [{ expires_at: null }, { expires_at: { gt: now } }],
    },
    distinct: ["card_id"],
    select: { card_id: true },
  });
  return rows.map((row) => row.card_id).filter((cardId): cardId is string => Boolean(cardId));
}

function firstPositivePrice(values: Array<number | null | undefined>): number | null {
  return values.find((value): value is number => value != null && Number.isFinite(value) && value > 0) ?? null;
}

async function loadEventSignalSeeds(
  cardIds: readonly string[]
): Promise<ExternalCardSignal[]> {
  const seeds: ExternalCardSignal[] = [];
  for (let index = 0; index < cardIds.length; index += SQLITE_SAFE_CARD_CHUNK_SIZE) {
    const rows = await db.card.findMany({
      where: { id: { in: cardIds.slice(index, index + SQLITE_SAFE_CARD_CHUNK_SIZE) } },
      select: {
        id: true,
        game: true,
        name: true,
        image_url: true,
        card_number: true,
        printed_card_number: true,
        rarity: true,
        episode: { select: { name: true, code: true } },
        prices: {
          orderBy: [{ fetched_at: "desc" }, { id: "desc" }],
          take: 1,
          select: {
            cm_en_avg_7d: true,
            cm_en_lowest_nm: true,
            cm_de_lowest_nm: true,
            cm_fr_lowest_nm: true,
            cm_es_lowest_nm: true,
            cm_it_lowest_nm: true,
            tcp_market: true,
          },
        },
      },
    });
    for (const row of rows) {
      const price = row.prices[0];
      const eur = price
        ? firstPositivePrice([
            price.cm_en_avg_7d,
            price.cm_en_lowest_nm,
            price.cm_de_lowest_nm,
            price.cm_fr_lowest_nm,
            price.cm_es_lowest_nm,
            price.cm_it_lowest_nm,
          ])
        : null;
      const usd = eur == null ? firstPositivePrice([price?.tcp_market]) : null;
      if (eur == null && usd == null) continue;
      const game = row.game === "one-piece" ? "one-piece" : "pokemon";
      seeds.push({
        rank: 0,
        cardId: row.id,
        entityKey: getExternalEntityKey(game, row.name),
        sourceMode: "event",
        game,
        name: row.name,
        imageUrl: row.image_url,
        cardNumber: row.printed_card_number ?? row.card_number,
        episodeName: row.episode.name,
        episodeCode: row.episode.code,
        rarity: row.rarity,
        currentPrice: eur ?? usd,
        currency: eur != null ? "EUR" : "USD",
        externalScore: 0,
        competitiveScore: 0,
        confidence: "Emerging",
        horizon: "30-90 day watch",
        pressureLabel: "Watch",
        pressureExplanation: "Fresh external event that still needs confirmation",
        reasons: [],
        evidence: [],
        maxDeckSharePercent: 0,
        maxInclusionPercent: 0,
        archetypeCount: 0,
      });
    }
  }
  return seeds;
}

function selectDiverseEventSignals(signals: ExternalCardSignal[]): ExternalCardSignal[] {
  const perEntity = new Map<string, number>();
  return signals
    .sort(
      (left, right) =>
        right.externalScore - left.externalScore ||
        (right.currentPrice ?? 0) - (left.currentPrice ?? 0) ||
        left.cardId.localeCompare(right.cardId)
    )
    .filter((signal) => {
      const key = signal.entityKey ?? `${signal.game}:${signal.name.toLowerCase()}`;
      const count = perEntity.get(key) ?? 0;
      if (count >= MAX_EVENT_VARIANTS_PER_ENTITY) return false;
      perEntity.set(key, count + 1);
      return true;
    })
    .slice(0, MAX_EVENT_ONLY_SIGNALS);
}

async function loadStructuralSignalSeeds(
  games: TradingCardGame[],
  now: Date
): Promise<ExternalCardSignal[]> {
  const cacheKey = `structural-v5:${[...games].sort().join(",")}`;
  return structuralSignalCache.get(cacheKey, () => loadStructuralSignalSeedsUncached(games, now));
}

async function loadStructuralSignalSeedsUncached(
  games: TradingCardGame[],
  now: Date
): Promise<ExternalCardSignal[]> {
  const cutoffYear = now.getUTCFullYear() - 3;
  const eras = [
    { key: "vintage", gte: "1995-01-01", lte: "2002-12-31" },
    { key: "ex", gte: "2003-01-01", lte: "2006-12-31" },
    { key: "dp-hgss", gte: "2007-01-01", lte: "2010-12-31" },
    { key: "bw", gte: "2011-01-01", lte: "2012-12-31" },
    { key: "xy", gte: "2013-01-01", lte: "2014-12-31" },
    { key: "sm", gte: "2015-01-01", lte: "2017-12-31" },
    { key: "swsh", gte: "2018-01-01", lte: "2020-12-31" },
    { key: "recent", gte: "2021-01-01", lte: `${cutoffYear}-12-31` },
    { key: "launch", gte: `${cutoffYear + 1}-01-01`, lte: `${now.getUTCFullYear()}-12-31` },
  ] as const;
  const [candidateBatches, entityDemand] = await Promise.all([
    Promise.all(
    eras.map((era) =>
      db.card.findMany({
        where: {
          game: { in: games },
          rarity: { not: null },
          prices: { some: {} },
          episode: { release_date: { gte: era.gte, lte: era.lte } },
          NOT: { rarity: { in: ["Common", "Uncommon", "Rare", "C", "UC", "R"] } },
        },
        orderBy: [{ episode: { release_date: "desc" } }, { id: "asc" }],
        // Nested relation queries use the parent ids as parameters. Keeping
        // each era below 400 avoids SQLite's parameter ceiling.
        take: 500,
        select: {
          id: true,
          game: true,
          name: true,
          image_url: true,
          card_number: true,
          printed_card_number: true,
          rarity: true,
          episode: { select: { name: true, code: true, release_date: true } },
          prices: {
            orderBy: [{ fetched_at: "desc" }, { id: "desc" }],
            take: 8,
            select: {
              cm_en_avg_7d: true,
              cm_en_lowest_nm: true,
              cm_de_lowest_nm: true,
              cm_fr_lowest_nm: true,
              cm_es_lowest_nm: true,
              cm_it_lowest_nm: true,
              tcp_market: true,
            },
          },
          ebaySoldGradedPrices: {
            where: { company: "PSA", grade: "10" },
            orderBy: { fetched_at: "desc" },
            take: 1,
            select: { median_price: true, currency: true, sample_size: true },
          },
        },
      })
    )),
    loadCollectorDemandScores(games),
  ]);
  const candidates = candidateBatches.flat();
  const scored = candidates.flatMap((card) => {
    const price = card.prices[0];
    if (!price) return [];
    const eur = firstPositivePrice([
      price.cm_en_avg_7d,
      price.cm_en_lowest_nm,
      price.cm_de_lowest_nm,
      price.cm_fr_lowest_nm,
      price.cm_es_lowest_nm,
      price.cm_it_lowest_nm,
    ]);
    const usd = eur == null ? firstPositivePrice([price.tcp_market]) : null;
    const currentPrice = eur ?? usd;
    if (currentPrice == null || currentPrice < 3) return [];
    const releaseTimestamp = Date.parse(card.episode.release_date ?? "");
    const ageYears = Number.isFinite(releaseTimestamp)
      ? Math.max(0, (now.getTime() - releaseTimestamp) / (365.25 * 86_400_000))
      : 0;
    const normalizedRarity = normalizeRarityLabel(card.rarity);
    const rarityIndex = normalizedRarity
      ? KNOWN_RARITY_ORDER.indexOf(normalizedRarity as (typeof KNOWN_RARITY_ORDER)[number])
      : -1;
    const rarityStrength = structuralRarityStrength(normalizedRarity, rarityIndex);
    const psa10 = card.ebaySoldGradedPrices[0];
    const comparablePsa10 =
      psa10 && ((psa10.currency === "EUR" && eur != null) || (psa10.currency !== "EUR" && usd != null))
        ? psa10.median_price
        : null;
    const gradeMultiple = comparablePsa10 == null ? null : comparablePsa10 / currentPrice;
    const valueWindow = currentPrice <= 25 ? 5 : currentPrice <= 100 ? 3 : currentPrice <= 300 ? 1 : 0;
    // A high raw market on an old card is useful collector-demand evidence,
    // not a reason to exclude it as "already expensive".
    const establishedDemand = Math.min(14, Math.log10(currentPrice + 1) * 5.5);
    const game: TradingCardGame = card.game === "one-piece" ? "one-piece" : "pokemon";
    const collectorDemand = entityDemand.get(getExternalEntityKey(game, card.name)) ?? 50;
    const collectorDemandBonus = Math.max(-3, Math.min(12, (collectorDemand - 50) * 0.24));
    const score = Math.round(
      clamp(
        28 +
          Math.min(24, ageYears * 2.2) +
          rarityStrength * 22 +
          valueWindow +
          establishedDemand +
          collectorDemandBonus +
          Math.min(12, Math.max(0, (gradeMultiple ?? 1) - 1) * 2.5),
        40,
        96
      )
    );
    const releaseYear = Number.parseInt((card.episode.release_date ?? "").slice(0, 4), 10);
    const eraKey =
      eras.find((era) => releaseYear >= Number(era.gte.slice(0, 4)) && releaseYear <= Number(era.lte.slice(0, 4)))?.key ?? "recent";
    return [{ card, currentPrice, currency: eur != null ? ("EUR" as const) : ("USD" as const), ageYears, gradeMultiple, score, eraKey, collectorDemand }];
  });
  const perEra = new Map<string, number>();
  const perEntity = new Map<string, number>();
  return scored
    .sort((left, right) => right.score - left.score || left.currentPrice - right.currentPrice)
    .filter((candidate) => {
      const entity = getExternalEntityKey(
        candidate.card.game === "one-piece" ? "one-piece" : "pokemon",
        candidate.card.name
      );
      const eraCount = perEra.get(candidate.eraKey) ?? 0;
      const entityCount = perEntity.get(entity) ?? 0;
      if (eraCount >= 5 || entityCount >= 2) return false;
      perEra.set(candidate.eraKey, eraCount + 1);
      perEntity.set(entity, entityCount + 1);
      return true;
    })
    .slice(0, MAX_STRUCTURAL_SIGNALS)
    .map(({ card, currentPrice, currency, ageYears, gradeMultiple, score, collectorDemand }) => {
      const game: TradingCardGame = card.game === "one-piece" ? "one-piece" : "pokemon";
      const externalScore = Math.min(82, score);
      const pressure = getPressureTierForScore(externalScore);
      return {
        rank: 0,
        cardId: card.id,
        entityKey: getExternalEntityKey(game, card.name),
        sourceMode: "structural",
        game,
        name: card.name,
        imageUrl: card.image_url,
        cardNumber: card.printed_card_number ?? card.card_number,
        episodeName: card.episode.name,
        episodeCode: card.episode.code,
        rarity: card.rarity,
        currentPrice,
        currency,
        externalScore,
        competitiveScore: -1,
        confidence: card.prices.length >= 5 ? "Medium" : "Emerging",
        horizon: "30-90 day watch",
        pressureLabel: pressure.label,
        pressureExplanation: "Structural scarcity and relative value, independent from a current news event",
        reasons: [
          `${card.rarity ?? "Higher rarity"} from a ${ageYears.toFixed(1)}-year-old set`,
          currentPrice <= 100
            ? `Raw market is still ${currency} ${currentPrice.toFixed(2)} despite older-set scarcity`
            : "Older sealed supply is increasingly expensive to replace",
          gradeMultiple != null
            ? `Observed PSA 10 sold value is about ${gradeMultiple.toFixed(1)}x the raw market`
            : "Graded upside is awaiting a reliable exact-grade comparison",
          collectorDemand >= 65
            ? `Related variants show established collector demand (${collectorDemand}/100)`
            : null,
        ].filter((reason): reason is string => Boolean(reason)),
        evidence: [],
        maxDeckSharePercent: 0,
        maxInclusionPercent: 0,
        archetypeCount: 0,
      } satisfies ExternalCardSignal;
    });
}

function structuralRarityStrength(normalizedRarity: string | null, rarityIndex: number): number {
  const value = normalizedRarity?.toLowerCase() ?? "";
  if (/star|shining|legend|manga|alternate art|special (?:art|illustration)|hyper|rare ultra|secret/.test(value)) {
    return 1;
  }
  if (/holo ex|holo gx|lv\.x|prime|rainbow|shiny|illustration rare|art rare/.test(value)) {
    return 0.84;
  }
  if (/promo/.test(value)) return 0.48;
  return rarityIndex < 0
    ? 0.35
    : Math.min(0.75, rarityIndex / Math.max(1, KNOWN_RARITY_ORDER.length - 1));
}

export async function enrichExternalSignalRadarData(
  data: ExternalSignalRadarData,
  now = new Date()
): Promise<ExternalSignalRadarData> {
  const existingCardIds = new Set(data.signals.map((signal) => signal.cardId));
  const games = [...new Set(data.sources.map((source) => source.game))];
  const [activeCatalystCardIds, structuralCandidates] = await Promise.all([
    loadActiveCatalystCardIds(now),
    loadStructuralSignalSeeds(games, now),
  ]);
  const eventSeeds = await loadEventSignalSeeds(activeCatalystCardIds.filter((cardId) => !existingCardIds.has(cardId)));
  const structuralSeeds = structuralCandidates.filter(
    (signal) => !existingCardIds.has(signal.cardId) && !activeCatalystCardIds.includes(signal.cardId)
  );
  const seeds = [
    ...data.signals.map((signal) => ({
      ...signal,
      entityKey: signal.entityKey ?? getExternalEntityKey(signal.game, signal.name),
      sourceMode: signal.sourceMode ?? ("competitive" as const),
    })),
    ...eventSeeds,
    ...structuralSeeds,
  ];
  const catalystsByCard = await loadActiveCatalysts(
    [...new Set(seeds.map((signal) => signal.cardId))],
    now
  );

  const scored = seeds
    .map((signal) => {
      const catalysts = catalystsByCard.get(signal.cardId) ?? [];
      const scores = calculateCatalystScores(catalysts);
      const competitiveScore = signal.competitiveScore ?? signal.externalScore;
      const structural = signal.sourceMode === "structural" || competitiveScore < 0;
      const eventOnly = !structural && competitiveScore === 0;
      const externalScore = structural
        ? signal.externalScore
        : eventOnly
        ? calculateExternalEventScore(catalysts, scores)
        : Math.round(
            clamp(
              competitiveScore +
                scores.catalystScore * 12 +
                scores.hypeScore * 8 -
                scores.riskScore * 18,
              0,
              100
            )
          );
      const pressure = getPressureTierForScore(externalScore);
      const sourceMode: NonNullable<ExternalCardSignal["sourceMode"]> = eventOnly
        ? "event"
        : structural
          ? "structural"
        : catalysts.length
          ? "hybrid"
          : "competitive";
      const eventReasons = eventOnly
        ? [
            catalysts[0]?.headline ?? "Fresh set or character event",
            catalysts[0]?.explanation ?? "External evidence is being verified.",
            `${new Set(catalysts.map((item) => item.sourceUrl)).size} independent source${new Set(catalysts.map((item) => item.sourceUrl)).size === 1 ? "" : "s"} linked`,
          ]
        : signal.reasons;
      return {
        ...signal,
        competitiveScore,
        externalScore,
        sourceMode,
        confidence: eventOnly ? getEventConfidence(catalysts) : signal.confidence,
        pressureLabel: pressure.label,
        pressureExplanation: pressure.explanation,
        reasons: eventReasons,
        catalysts,
        ...scores,
      };
    });
  const competitiveSignals = scored.filter((signal) => signal.sourceMode !== "event");
  const eventSignals = selectDiverseEventSignals(
    scored.filter(
      (signal) => signal.sourceMode === "event" && signal.externalScore >= MIN_EVENT_ONLY_SCORE
    )
  );
  const selected = await enrichSignalsWithMarketIntelligence(
    [...competitiveSignals, ...eventSignals],
    now
  );
  const forecasts = await getExternalForecastSummaries(selected.map((signal) => signal.cardId));
  const signals = selected
    .map((signal) => ({
      ...signal,
      forecast: forecasts.get(signal.cardId) ?? null,
    }))
    .sort(
      (left, right) =>
        (right.marketIntelligence?.rawOpportunityScore ?? right.externalScore) -
          (left.marketIntelligence?.rawOpportunityScore ?? left.externalScore) ||
        right.externalScore - left.externalScore ||
        right.archetypeCount - left.archetypeCount ||
        left.rank - right.rank
    )
    .map((signal, index) => ({ ...signal, rank: index + 1 }));

  return {
    ...data,
    signals,
  };
}
