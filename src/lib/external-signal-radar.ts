import type { Prisma } from "@/generated/prisma";
import { loadLatestSafeEnglishNmPrices } from "@/lib/card-market-history";
import type { ExternalCardForecastSummary } from "@/lib/external-signal-forecast-store";
import type { ExternalEbayDemandIntelligence } from "@/lib/ebay-demand-signal";
import type { SetLifecycleStatus } from "@/lib/set-lifecycle-core";
import type { PostLaunchReratingMetrics } from "@/lib/post-launch-rerating";
import { db } from "@/lib/db";
import {
  ALL_GAMES,
  ONE_PIECE_GAME,
  POKEMON_GAME,
  type TradingCardGame,
  type TradingCardGameFilter,
} from "@/lib/games";
import { createSwrCache } from "@/lib/server-swr-cache";

const SIGNAL_CACHE_FRESH_MS = 6 * 60 * 60_000;
const SIGNAL_CACHE_STALE_MS = 24 * 60 * 60_000;
const SOURCE_FETCH_TIMEOUT_MS = 8_000;
const DECKS_PER_GAME = 10;
const MIN_ACCEPTED_DECKS_PER_GAME = 8;
const MIN_CORE_INCLUSION_PERCENT = 45;
const MAX_COMPETITIVE_SIGNALS_PER_GAME = 45;

const SOURCE_CONFIG = {
  [POKEMON_GAME]: {
    label: "Limitless Pokemon",
    baseUrl: "https://limitlesstcg.com",
  },
  [ONE_PIECE_GAME]: {
    label: "Limitless One Piece",
    baseUrl: "https://onepiece.limitlesstcg.com",
  },
} as const;

export type ExternalSignalConfidence = "High" | "Medium" | "Emerging";
export type ExternalSignalSourceMode = "competitive" | "event" | "hybrid" | "structural";
export type ExternalEvidenceLevel = "Confirmed" | "Strong evidence" | "Credible leak" | "Rumour";
export type ExternalMarketMode = "raw" | "graded";

export interface ExternalPriceScenarioPoint {
  days: 30 | 90 | 180;
  low: number;
  base: number;
  high: number;
}

export interface ExternalPriceScenario {
  marketMode: ExternalMarketMode;
  currentPrice: number;
  currency: "EUR" | "USD";
  confidence: "High" | "Medium" | "Low";
  outlook?: "strong_up" | "modest_up" | "flat" | "down";
  expectedReturnPct180?: number;
  points: ExternalPriceScenarioPoint[];
  drivers: string[];
}

export interface ExternalSealedIntelligence {
  productCount: number;
  packProductCount: number;
  packName: string | null;
  packPrice: number | null;
  boxName: string | null;
  boxPrice: number | null;
  trend30dPct: number | null;
  trend90dPct: number | null;
  ageYears: number | null;
  pressureScore: number;
  pressureLabel: "Low" | "Building" | "High" | "Extreme";
  lifecycleStatus: SetLifecycleStatus | null;
  lifecycleLabel: string | null;
  lifecycleConfidence: number | null;
  lifecycleOopProbability: number | null;
  lifecycleAsOf: string | null;
  lifecycleSummary: string | null;
}

export interface ExternalGradedIntelligence {
  available: boolean;
  label: string | null;
  currentPrice: number | null;
  currency: "EUR" | "USD";
  sampleSize: number | null;
  psa9Price: number | null;
  psa10Price: number | null;
  gradePremiumPct: number | null;
  gemRatePct: number | null;
  population10: number | null;
  populationTotal: number | null;
  populationStatus: "verified" | "set-rarity-estimate" | "unavailable";
  supplyLabel: "Deep" | "Balanced" | "Thin" | "Unknown";
}

export interface ExternalScarcityIntelligence {
  score: number;
  label: "Common supply" | "Watch" | "Scarce" | "Very scarce";
  setRarityScore: number | null;
  setRarityLabel: "Entry tier" | "Mid tier" | "Upper tier" | "Chase tier" | "Unknown";
  pullOdds: string | null;
  specificPullDenominator: number | null;
  rawMarketBreadth: number;
  rawTrend90dPct: number | null;
  artist: string | null;
  artistDemandScore: number | null;
  collectorDemandScore: number;
}

export interface ExternalGoldMineConfluence {
  score: number;
  label: "Single signal" | "Building" | "Strong setup" | "Gold mine setup";
  drivers: string[];
  freshChase: boolean;
}

export interface ExternalHypeResetIntelligence {
  peakPrice: number;
  supportPrice: number;
  drawdownPct: number;
  stableDays: number;
  rangePct: number;
  score: number;
  label: "Support forming" | "Support confirmed";
  explanation: string;
}

export interface ExternalMarketIntelligence {
  rawOpportunityScore: number;
  gradedOpportunityScore: number | null;
  hypeReset?: ExternalHypeResetIntelligence | null;
  postLaunch?: PostLaunchReratingMetrics | null;
  ebayDemand?: ExternalEbayDemandIntelligence;
  gradedEbayDemand?: ExternalEbayDemandIntelligence;
  sealed: ExternalSealedIntelligence;
  graded: ExternalGradedIntelligence;
  scarcity: ExternalScarcityIntelligence;
  rawConfluence?: ExternalGoldMineConfluence;
  gradedConfluence?: ExternalGoldMineConfluence | null;
  confluence: ExternalGoldMineConfluence;
  rawScenario: ExternalPriceScenario | null;
  gradedScenario: ExternalPriceScenario | null;
}

export interface LimitlessMetaDeck {
  id: string;
  name: string;
  points: number;
  sharePercent: number;
  url: string;
}

export interface LimitlessCoreCard {
  setCode: string;
  cardNumber: string;
  copies: number | null;
  inclusionPercent: number;
}

export interface ExternalSignalEvidence {
  deckName: string;
  deckUrl: string;
  deckSharePercent: number;
  inclusionPercent: number;
  copies: number | null;
  sourceLabel: string;
}

export interface ExternalSignalCatalyst {
  id: string;
  kind:
    | "support"
    | "product"
    | "reveal"
    | "localization"
    | "reprint"
    | "ban"
    | "rotation"
    | "hype";
  direction: "positive" | "negative" | "neutral";
  strength: number;
  headline: string;
  explanation: string;
  sourceUrl: string;
  sourceDomain: string;
  sourceKind: "official" | "community" | "social";
  evidenceLevel: ExternalEvidenceLevel;
  contextLabel: string | null;
  observedAt: string;
  expiresAt: string | null;
}

export interface ExternalCardSignal {
  rank: number;
  cardId: string;
  entityKey?: string;
  sourceMode?: ExternalSignalSourceMode;
  manualResearch?: boolean;
  game: TradingCardGame;
  name: string;
  imageUrl: string | null;
  cardNumber: string | null;
  episodeName: string;
  episodeCode: string | null;
  episodeReleaseDate?: string | null;
  rarity: string | null;
  currentPrice: number | null;
  currency: "EUR" | "USD";
  externalScore: number;
  competitiveScore?: number;
  confidence: ExternalSignalConfidence;
  horizon: "30-90 day watch";
  pressureLabel: "Breakout" | "Strong" | "Watch";
  pressureExplanation: string;
  reasons: string[];
  evidence: ExternalSignalEvidence[];
  maxDeckSharePercent: number;
  maxInclusionPercent: number;
  archetypeCount: number;
  forecast?: ExternalCardForecastSummary | null;
  catalysts?: ExternalSignalCatalyst[];
  catalystScore?: number;
  hypeScore?: number;
  riskScore?: number;
  marketIntelligence?: ExternalMarketIntelligence;
}

export interface ExternalSignalSourceStatus {
  game: TradingCardGame;
  label: string;
  url: string;
  ok: boolean;
  deckCount: number;
  message: string | null;
  /** Non-blocking note, e.g. a small deck-page shortfall on an accepted scan. */
  detail?: string | null;
  fetchedAt: string | null;
}

export interface ExternalSignalRadarData {
  generatedAt: string;
  signals: ExternalCardSignal[];
  sources: ExternalSignalSourceStatus[];
  unmatchedCount: number;
  scannedDeckCount: number;
}

interface AggregatedExternalCard {
  game: TradingCardGame;
  setCode: string;
  cardNumber: string;
  evidence: ExternalSignalEvidence[];
}

interface GameSignalScan {
  game: TradingCardGame;
  source: ExternalSignalSourceStatus;
  cards: AggregatedExternalCard[];
}

const gameScanCache = createSwrCache<GameSignalScan>(
  SIGNAL_CACHE_FRESH_MS,
  SIGNAL_CACHE_STALE_MS
);

const RADAR_CARD_SELECT = {
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
  episode: {
    select: {
      id: true,
      name: true,
      code: true,
      release_date: true,
    },
  },
} satisfies Prisma.CardSelect;

type RadarCardRecord = Prisma.CardGetPayload<{ select: typeof RADAR_CARD_SELECT }>;

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&eacute;/gi, "e")
    .replace(/&ndash;/gi, "-")
    .replace(/&mdash;/gi, "-")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16))
    );
}

function stripHtml(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeSetCode(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function normalizePokemonCardNumber(value: string | null | undefined): string {
  const firstPart = String(value ?? "").trim().split("/")[0] ?? "";
  const compact = firstPart.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const structuredMatch = compact.match(/^([A-Z]*)(\d+)([A-Z]*)$/);
  if (!structuredMatch) return compact;
  const numericPart = String(Number.parseInt(structuredMatch[2], 10));
  return `${structuredMatch[1]}${numericPart}${structuredMatch[3]}`;
}

function normalizeOnePieceCardNumber(value: string | null | undefined): string {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

function normalizeCardNumber(game: TradingCardGame, value: string | null | undefined): string {
  return game === ONE_PIECE_GAME
    ? normalizeOnePieceCardNumber(value)
    : normalizePokemonCardNumber(value);
}

function getSignalKey(game: TradingCardGame, setCode: string, cardNumber: string): string {
  return `${game}:${normalizeSetCode(setCode)}:${normalizeCardNumber(game, cardNumber)}`;
}

export function parseLimitlessMetaDecks(
  html: string,
  baseUrl: string
): LimitlessMetaDeck[] {
  const decks: LimitlessMetaDeck[] = [];
  const allowedOrigin = new URL(baseUrl).origin;
  const rows = html.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [];

  for (const row of rows) {
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(
      (match) => match[1] ?? ""
    );
    if (cells.length < 5) continue;

    const linkMatch = cells[2]?.match(/href=["']([^"']*\/decks\/(\d+))[^"']*["']/i);
    if (!linkMatch) continue;

    const points = Number.parseInt(stripHtml(cells[3] ?? ""), 10);
    const shareMatch = stripHtml(cells[4] ?? "").match(/([\d.]+)%/);
    const sharePercent = shareMatch ? Number.parseFloat(shareMatch[1]) : Number.NaN;
    const name = stripHtml(cells[2] ?? "");
    if (!name || !Number.isFinite(sharePercent)) continue;
    const deckUrl = new URL(linkMatch[1], baseUrl);
    if (deckUrl.origin !== allowedOrigin) continue;

    decks.push({
      id: linkMatch[2],
      name,
      points: Number.isFinite(points) ? points : 0,
      sharePercent,
      url: deckUrl.toString(),
    });
  }

  return decks;
}

export function parseLimitlessCoreCards(
  html: string,
  game: TradingCardGame
): LimitlessCoreCard[] {
  const cards: LimitlessCoreCard[] = [];
  const blocks = html.match(/<div\s+class=["']core-card["'][^>]*>[\s\S]*?<\/div>/gi) ?? [];

  for (const block of blocks) {
    let setCode = "";
    let cardNumber = "";

    if (game === ONE_PIECE_GAME) {
      const cardMatch = block.match(/data-card=["']([^"']+)["']/i);
      if (!cardMatch) continue;
      cardNumber = normalizeOnePieceCardNumber(cardMatch[1]);
      setCode = normalizeSetCode(cardNumber.split("-")[0]);
    } else {
      const setMatch = block.match(/data-set=["']([^"']+)["']/i);
      const numberMatch = block.match(/data-number=["']([^"']+)["']/i);
      if (!setMatch || !numberMatch) continue;
      setCode = normalizeSetCode(setMatch[1]);
      cardNumber = normalizePokemonCardNumber(numberMatch[1]);
    }

    const shareMatches = [...block.matchAll(/([\d.]+)\s+in\s+([\d.]+)%/gi)]
      .map((match) => ({
        copies: Number.parseFloat(match[1]),
        inclusionPercent: Number.parseFloat(match[2]),
      }))
      .filter(
        (match) => Number.isFinite(match.copies) && Number.isFinite(match.inclusionPercent)
      )
      .sort((a, b) => b.inclusionPercent - a.inclusionPercent || b.copies - a.copies);
    const bestShare = shareMatches[0];
    if (!bestShare || bestShare.inclusionPercent < MIN_CORE_INCLUSION_PERCENT) continue;

    cards.push({
      setCode,
      cardNumber,
      copies: bestShare.copies,
      inclusionPercent: bestShare.inclusionPercent,
    });
  }

  return cards;
}

async function fetchLimitlessHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SOURCE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "DustyCards/1.0 (+https://dustycards.myftp.org)",
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Source returned HTTP ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

/** One fresh second attempt (own timeout) so a single slow page cannot void a scan. */
export async function fetchWithSingleRetry<T>(attempt: () => Promise<T>): Promise<T> {
  try {
    return await attempt();
  } catch {
    return attempt();
  }
}

/**
 * A near-complete scan (at most two of the ten deck pages missing) still
 * represents the meta, so it keeps the cacheable six-hour persistence slot.
 * The shortfall is reported as a non-blocking detail instead of a message.
 */
export function resolveDeckScanStatus(input: {
  attempted: number;
  successful: number;
}): { complete: boolean; message: string | null; detail: string | null } {
  if (input.successful >= input.attempted) {
    return { complete: true, message: null, detail: null };
  }
  const detail = `${input.successful} of ${input.attempted} archetypes could be read`;
  const complete =
    input.successful >= Math.min(input.attempted, MIN_ACCEPTED_DECKS_PER_GAME);
  return { complete, message: complete ? null : detail, detail };
}

async function scanGame(game: TradingCardGame): Promise<GameSignalScan> {
  const config = SOURCE_CONFIG[game];
  const decksUrl = `${config.baseUrl}/decks`;

  if (process.env.DUSTYCARDS_DISABLE_SCRAPER_REQUESTS === "1") {
    return {
      game,
      cards: [],
      source: {
        game,
        label: config.label,
        url: decksUrl,
        ok: false,
        deckCount: 0,
        fetchedAt: null,
        message: "External scan disabled for this runtime",
      },
    };
  }

  try {
    const overviewHtml = await fetchLimitlessHtml(decksUrl);
    const decks = parseLimitlessMetaDecks(overviewHtml, config.baseUrl).slice(0, DECKS_PER_GAME);
    const deckResults = await Promise.allSettled(
      decks.map(async (deck) => ({
        deck,
        cards: parseLimitlessCoreCards(
          await fetchWithSingleRetry(() => fetchLimitlessHtml(deck.url)),
          game
        ),
      }))
    );
    const aggregated = new Map<string, AggregatedExternalCard>();

    for (const result of deckResults) {
      if (result.status !== "fulfilled") continue;
      const { deck, cards } = result.value;
      for (const card of cards) {
        const key = getSignalKey(game, card.setCode, card.cardNumber);
        const current = aggregated.get(key) ?? {
          game,
          setCode: card.setCode,
          cardNumber: card.cardNumber,
          evidence: [],
        };
        current.evidence.push({
          deckName: deck.name,
          deckUrl: deck.url,
          deckSharePercent: deck.sharePercent,
          inclusionPercent: card.inclusionPercent,
          copies: card.copies,
          sourceLabel: config.label,
        });
        aggregated.set(key, current);
      }
    }

    const successfulDecks = deckResults.filter((result) => result.status === "fulfilled").length;
    const scanStatus = resolveDeckScanStatus({
      attempted: decks.length,
      successful: successfulDecks,
    });
    return {
      game,
      cards: [...aggregated.values()],
      source: {
        game,
        label: config.label,
        url: decksUrl,
        ok: successfulDecks > 0,
        deckCount: successfulDecks,
        fetchedAt: new Date().toISOString(),
        message: scanStatus.message,
        detail: scanStatus.detail,
      },
    };
  } catch (error) {
    return {
      game,
      cards: [],
      source: {
        game,
        label: config.label,
        url: decksUrl,
        ok: false,
        deckCount: 0,
        fetchedAt: null,
        message: error instanceof Error ? error.message : "Source unavailable",
      },
    };
  }
}

async function getCachedGameScan(game: TradingCardGame): Promise<GameSignalScan> {
  const config = SOURCE_CONFIG[game];
  try {
    return await gameScanCache.get(game, async () => {
      const scan = await scanGame(game);
      const completeScan = scan.source.ok && scan.source.message == null && scan.cards.length > 0;
      if (!completeScan) {
        throw new Error(scan.source.message ?? "Source layout returned no usable cards");
      }
      return scan;
    });
  } catch (error) {
    return {
      game,
      cards: [],
      source: {
        game,
        label: config.label,
        url: `${config.baseUrl}/decks`,
        ok: false,
        deckCount: 0,
        fetchedAt: null,
        message: error instanceof Error ? error.message : "Source unavailable",
      },
    };
  }
}

export function calculateExternalSignalScore(evidence: ExternalSignalEvidence[]): number {
  if (evidence.length === 0) return 0;
  const maxInclusion = Math.max(...evidence.map((item) => item.inclusionPercent));
  const weightedMetaShare = evidence.reduce(
    (total, item) => total + item.deckSharePercent * (item.inclusionPercent / 100),
    0
  );
  const crossArchetypeBonus = Math.min(3, Math.max(0, evidence.length - 1)) * 7;
  return Math.round(
    clamp(maxInclusion * 0.35 + Math.min(50, weightedMetaShare) * 1.1 + crossArchetypeBonus, 0, 100)
  );
}

function getConfidence(score: number, archetypeCount: number): ExternalSignalConfidence {
  if (score >= 80 || (score >= 70 && archetypeCount >= 2)) return "High";
  if (score >= 58 || archetypeCount >= 2) return "Medium";
  return "Emerging";
}

export function getPressureTierForScore(score: number): {
  label: "Breakout" | "Strong" | "Watch";
  explanation: string;
} {
  if (score >= 82) {
    return {
      label: "Breakout",
      explanation: "Highest observed competitive demand pressure",
    };
  }
  if (score >= 66) {
    return {
      label: "Strong",
      explanation: "Strong observed competitive demand pressure",
    };
  }
  return {
    label: "Watch",
    explanation: "Early external signal that needs more confirmation",
  };
}

function chooseCollectorVariant(cards: RadarCardRecord[]): RadarCardRecord | null {
  if (cards.length === 0) return null;
  // Variant selection only decides which local artwork is displayed. It never changes
  // the externally calculated rank or score.
  return [...cards].sort((left, right) => {
    const leftVariantPenalty = /alternate|parallel|manga|special art/i.test(left.rarity ?? "")
      ? 1
      : 0;
    const rightVariantPenalty = /alternate|parallel|manga|special art/i.test(right.rarity ?? "")
      ? 1
      : 0;
    if (leftVariantPenalty !== rightVariantPenalty) {
      return leftVariantPenalty - rightVariantPenalty;
    }
    const imageDelta = Number(Boolean(right.image_url)) - Number(Boolean(left.image_url));
    if (imageDelta !== 0) return imageDelta;
    return left.id.localeCompare(right.id);
  })[0];
}

function buildReasons(evidence: ExternalSignalEvidence[]): string[] {
  const sorted = [...evidence].sort(
    (left, right) =>
      right.deckSharePercent * right.inclusionPercent -
      left.deckSharePercent * left.inclusionPercent
  );
  const leading = sorted[0];
  if (!leading) return [];

  const reasons = [
    `${leading.inclusionPercent.toFixed(0)}% inclusion in ${leading.deckName} lists`,
    `${leading.deckSharePercent.toFixed(1)}% share for that archetype`,
  ];
  if (sorted.length > 1) {
    reasons.push(`Core card across ${sorted.length} leading archetypes`);
  }
  return reasons;
}

function isActionableCollectorSignal(signal: ExternalCardSignal): boolean {
  // The forecast model refuses reference prices below EUR 1 ("Below EUR 1
  // model floor"), so a cheaper card can never be tracked or predicted. The
  // old premium-name exemption let cent-priced "ex"/"GX" commons through as
  // pure noise; a known price below the model floor is now always dropped.
  return signal.currentPrice != null && signal.currentPrice >= 1;
}

export function capCompetitiveSignalsPerGame<
  T extends { game: TradingCardGame }
>(signals: readonly T[], maxPerGame = MAX_COMPETITIVE_SIGNALS_PER_GAME): T[] {
  const countByGame = new Map<TradingCardGame, number>();
  return signals.filter((signal) => {
    const count = countByGame.get(signal.game) ?? 0;
    if (count >= maxPerGame) return false;
    countByGame.set(signal.game, count + 1);
    return true;
  });
}

async function loadLocalCards(
  aggregatedCards: AggregatedExternalCard[]
): Promise<Map<string, RadarCardRecord[]>> {
  const requestedKeys = new Set(
    aggregatedCards.map((card) => `${card.game}:${normalizeSetCode(card.setCode)}`)
  );
  if (requestedKeys.size === 0) return new Map();

  const episodes = await db.episode.findMany({
    where: {
      code: { not: null },
    },
    select: {
      id: true,
      game: true,
      code: true,
    },
  });
  const relevantEpisodes = episodes.filter((episode) => {
    const game = episode.game === ONE_PIECE_GAME ? ONE_PIECE_GAME : POKEMON_GAME;
    return requestedKeys.has(`${game}:${normalizeSetCode(episode.code)}`);
  });
  if (relevantEpisodes.length === 0) return new Map();

  const episodeIds = relevantEpisodes.map((episode) => episode.id);
  const cards: RadarCardRecord[] = [];
  // SQLite limits the number of bound parameters per statement. Imported and
  // user-submitted catalog variants can create many episodes with the same code,
  // so keep the lookup safely below that limit.
  for (let index = 0; index < episodeIds.length; index += 50) {
    cards.push(
      ...(await db.card.findMany({
        where: {
          episode_id: { in: episodeIds.slice(index, index + 50) },
        },
        select: RADAR_CARD_SELECT,
      }))
    );
  }
  const cardMap = new Map<string, RadarCardRecord[]>();

  for (const card of cards) {
    const game = card.game === ONE_PIECE_GAME ? ONE_PIECE_GAME : POKEMON_GAME;
    const number = card.printed_card_number ?? card.card_number;
    const key = getSignalKey(game, card.episode.code ?? "", number ?? "");
    const matches = cardMap.get(key) ?? [];
    matches.push(card);
    cardMap.set(key, matches);
  }

  return cardMap;
}

async function buildRadarData(
  gameFilter: TradingCardGameFilter,
  options?: { fresh?: boolean }
): Promise<ExternalSignalRadarData> {
  const games: TradingCardGame[] =
    gameFilter === ALL_GAMES ? [POKEMON_GAME, ONE_PIECE_GAME] : [gameFilter];
  const scans = await Promise.all(
    games.map((game) => (options?.fresh ? scanGame(game) : getCachedGameScan(game)))
  );
  const aggregatedCards = scans.flatMap((scan) => scan.cards);
  const localCards = await loadLocalCards(aggregatedCards);
  let unmatchedCount = 0;
  const matchedCards = aggregatedCards.flatMap((externalCard) => {
    const key = getSignalKey(
      externalCard.game,
      externalCard.setCode,
      externalCard.cardNumber
    );
    const localCard = chooseCollectorVariant(localCards.get(key) ?? []);
    if (!localCard) {
      unmatchedCount += 1;
      return [];
    }

    return [{ externalCard, localCard }];
  });
  const priceMap = await loadLatestSafeEnglishNmPrices(
    [
      ...new Map(
        matchedCards.map(({ localCard }) => [
          localCard.id,
          {
            id: localCard.id,
            game: localCard.game,
            episodeId: localCard.episode_id,
            name: localCard.name,
            cardNumber: localCard.card_number,
            printedCardNumber: localCard.printed_card_number,
            cardmarketId: localCard.cardmarket_id,
            cardmarketUrl: localCard.cardmarket_url,
          },
        ])
      ).values(),
    ]
  );

  const matchedSignals = matchedCards.map(({ externalCard, localCard }) => {

    const score = calculateExternalSignalScore(externalCard.evidence);
    const confidence = getConfidence(score, externalCard.evidence.length);
    const pressure = getPressureTierForScore(score);
    const price = priceMap.get(localCard.id);

    return {
        rank: 0,
        cardId: localCard.id,
        game: externalCard.game,
        name: localCard.name,
        imageUrl: localCard.image_url,
        cardNumber: localCard.printed_card_number ?? localCard.card_number,
        episodeName: localCard.episode.name,
        episodeCode: localCard.episode.code,
        episodeReleaseDate: localCard.episode.release_date,
        rarity: localCard.rarity,
        currentPrice: price?.value ?? null,
        currency: "EUR" as const,
        externalScore: score,
        competitiveScore: score,
        confidence,
        horizon: "30-90 day watch",
        pressureLabel: pressure.label,
        pressureExplanation: pressure.explanation,
        reasons: buildReasons(externalCard.evidence),
        evidence: [...externalCard.evidence].sort(
          (left, right) =>
            right.deckSharePercent * right.inclusionPercent -
            left.deckSharePercent * left.inclusionPercent
        ),
        maxDeckSharePercent: Math.max(
          ...externalCard.evidence.map((item) => item.deckSharePercent)
        ),
        maxInclusionPercent: Math.max(
          ...externalCard.evidence.map((item) => item.inclusionPercent)
        ),
        archetypeCount: externalCard.evidence.length,
      } satisfies ExternalCardSignal;
  });

  const signals = capCompetitiveSignalsPerGame(
    matchedSignals
      .filter(isActionableCollectorSignal)
      .sort(
        (left, right) =>
          right.externalScore - left.externalScore ||
          right.archetypeCount - left.archetypeCount ||
          right.maxInclusionPercent - left.maxInclusionPercent
      )
  )
    .map((signal, index) => ({ ...signal, rank: index + 1 }));

  const successfulSourceTimes = scans
    .map((scan) => scan.source.fetchedAt)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);

  return {
    generatedAt:
      successfulSourceTimes.length > 0
        ? new Date(Math.max(...successfulSourceTimes)).toISOString()
        : new Date().toISOString(),
    signals,
    sources: scans.map((scan) => scan.source),
    unmatchedCount,
    scannedDeckCount: scans.reduce((total, scan) => total + scan.source.deckCount, 0),
  };
}

export function getExternalSignalRadarData(
  gameFilter: TradingCardGameFilter = ALL_GAMES
): Promise<ExternalSignalRadarData> {
  return buildRadarData(gameFilter);
}

/**
 * Scheduler-only refresh that bypasses the process-local SWR cache. Page loads
 * continue to use the shared six-hour cache; the fixed background job uses
 * this path so a quiet site still records a fresh observation.
 */
export function refreshExternalSignalRadarData(
  gameFilter: TradingCardGameFilter = ALL_GAMES
): Promise<ExternalSignalRadarData> {
  return buildRadarData(gameFilter, { fresh: true });
}
