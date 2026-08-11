import { db } from "@/lib/db";
import {
  getCollectionMatchedGradedPrice,
  type CollectionCardValueLike,
} from "@/lib/collection";
import { getUsdToEurRate, type CurrencyExchangeRate } from "@/lib/exchange-rates";
import { startPerformanceTimer } from "@/lib/performance-timing";
import {
  buildGradingTargetAssessment,
  parseGradingTargetLabel,
  type GradingTargetAssessment,
  type GradingTargetPriceStatus,
  type GradingTargetSpreadRisk,
  type GradingTargetTier,
} from "@/lib/grading-targets";
import {
  CARD_MARKET_HISTORY_SERIES,
  buildCardPriceHistory,
  getCardMarketHistorySeriesCurrentValue,
  getSaneCardMarketHistorySeriesCurrentValue,
  type CardPriceHistoryPoint,
  type CardPriceHistorySnapshot,
} from "@/lib/price-history";
import {
  buildPullRateInfoFromRarity,
  PREFERRED_PULL_RATE_SOURCES,
  type PullRateInfo,
} from "@/lib/pull-rates";
import {
  buildMoverScores,
  chooseRawMoverSource,
  type MoverPriceQuality,
} from "@/lib/mover-scoring";
import {
  buildBuySignal,
  type BuySignalConfidence,
  type BuySignalLabel,
} from "@/lib/buy-signal";
import { KNOWN_RARITY_ORDER, normalizeRarityLabel } from "@/lib/rarity";
import type { PriceSource } from "@/lib/user-settings";
import {
  ALL_GAMES,
  ONE_PIECE_GAME,
  POKEMON_GAME,
  type TradingCardGame,
  type TradingCardGameFilter,
} from "@/lib/games";

const DAY_MS = 1000 * 60 * 60 * 24;
const HISTORY_LOOKBACK_DAYS = 45;
const MIN_PERCENT_BASE_VALUE = 1;
const MIN_RAW_MOVER_PRICE = 3;
const RECENT_PRICE_SERIES_POINT_LIMIT = 16;
const MAX_ALL_SCOPE_MOVERS = 500;
const SQLITE_SAFE_CHUNK_SIZE = 250;
const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
});
const dateLabelCache = new Map<string, string>();

type RawMoverSource = "cardmarket" | "tcgplayer";
type MoverSource = RawMoverSource | "graded";
export type MoversScope = "collection" | "all" | "graded" | "grading" | "sealed";
export type MoversItemScope = "collection" | "all";

type LatestPriceSnapshot = CardPriceHistorySnapshot;

interface MoverCandidateCardRecord {
  id: string;
  name: string;
  card_number: string | null;
  rarity: string | null;
  image_url: string | null;
  episode: {
    id: string;
    name: string;
    code: string | null;
    release_date: string | null;
  };
  latestPrices: Record<RawMoverSource, LatestPriceSnapshot | null>;
  tcggoScore: TcggoMoverScore | null;
  ownedCount: number;
  collectionPriceOverride: CollectionMoverPriceOverride | null;
}

interface CollectionMoverPriceOverride {
  label: string;
  price: number;
  source: "ebay_sold_graded" | "cardmarket_graded";
}

interface CollectionMoverOwnedCardRecord {
  card_id: string;
  grading_company: string | null;
  grading_grade: string | null;
  card: CollectionCardValueLike & {
    gradedPrices: Array<{
      label: string;
      price: number;
    }>;
    ebaySoldGradedPrices: Array<{
      label: string;
      company: string;
      grade: string;
      median_price: number;
      currency: string;
    }>;
  };
}

export interface TcggoMoverScore {
  score: number | null;
  tier: string | null;
  momentum: number | null;
  stability: number | null;
  liquidity: number | null;
  demand: number | null;
  marketDepth: number | null;
  gradePremium: number | null;
  rsi: number | null;
  ath: number | null;
  atl: number | null;
  updatedAt: string | null;
}

interface MoverCandidateCardRow {
  id: string;
  name: string;
  card_number: string | null;
  rarity: string | null;
  image_url: string | null;
  episode_id: string;
  episode_name: string;
  episode_code: string | null;
  episode_release_date: string | null;
  owned_count: number | bigint | null;
  cm_fetched_at: Date | string | null;
  cm_en_lowest_nm: number | null;
  cm_de_lowest_nm: number | null;
  cm_fr_lowest_nm: number | null;
  cm_es_lowest_nm: number | null;
  cm_it_lowest_nm: number | null;
  cm_jp_lowest_nm: number | null;
  cm_en_avg_7d: number | null;
  cm_en_avg_30d: number | null;
  tcp_fetched_at: Date | string | null;
  tcp_market: number | null;
  tcggo_score: number | null;
  tcggo_score_tier: string | null;
  tcggo_score_momentum: number | null;
  tcggo_score_stability: number | null;
  tcggo_score_liquidity: number | null;
  tcggo_score_demand: number | null;
  tcggo_score_market_depth: number | null;
  tcggo_score_grade_premium: number | null;
  tcggo_score_rsi: number | null;
  tcggo_score_ath: number | null;
  tcggo_score_atl: number | null;
  tcggo_score_updated_at: Date | string | null;
}

interface RecentHistoryRow {
  card_id: string;
  fetched_at: Date;
  cm_en_lowest_nm: number | null;
  cm_de_lowest_nm: number | null;
  cm_fr_lowest_nm: number | null;
  cm_es_lowest_nm: number | null;
  cm_it_lowest_nm: number | null;
  cm_jp_lowest_nm: number | null;
  tcp_market: number | null;
  cm_en_avg_7d: number | null;
  cm_en_avg_30d: number | null;
  tcggo_score: number | null;
  tcggo_score_tier: string | null;
  tcggo_score_momentum: number | null;
  tcggo_score_stability: number | null;
  tcggo_score_liquidity: number | null;
  tcggo_score_demand: number | null;
  tcggo_score_market_depth: number | null;
  tcggo_score_grade_premium: number | null;
  tcggo_score_rsi: number | null;
  tcggo_score_ath: number | null;
  tcggo_score_atl: number | null;
  tcggo_score_updated_at: Date | string | null;
}

interface AllTimeHistorySummaryRow {
  card_id: string;
  cm_first_fetched_at: Date | null;
  cm_first_value: number | null;
  cm_low_fetched_at: Date | null;
  cm_low_value: number | null;
  cm_high_fetched_at: Date | null;
  cm_high_value: number | null;
  cm_history_points: number | null;
  tcp_first_fetched_at: Date | null;
  tcp_first_value: number | null;
  tcp_low_fetched_at: Date | null;
  tcp_low_value: number | null;
  tcp_high_fetched_at: Date | null;
  tcp_high_value: number | null;
  tcp_history_points: number | null;
}

interface PullRateRarityRow {
  source: string;
  set_code: string;
  normalized_rarity: string;
  rarity_name: string;
  pull_rate_odds: string | null;
  pull_rate_denominator: number | null;
  specific_pull_denominator: number | null;
  psa_avg_gem_pct: number | null;
}

interface GradedPriceRow {
  card_id: string;
  label: string;
  price: number;
}

interface GradedMoverCandidateRow {
  card_id: string;
  name: string;
  card_number: string | null;
  rarity: string | null;
  image_url: string | null;
  episode_id: string;
  episode_name: string;
  episode_code: string | null;
  episode_release_date: string | null;
  owned_count: number | bigint | null;
  graded_label: string;
  graded_price: number;
  graded_fetched_at: Date | string;
  raw_fetched_at: Date | string | null;
  tcp_fetched_at: Date | string | null;
  cm_en_lowest_nm: number | null;
  cm_de_lowest_nm: number | null;
  cm_fr_lowest_nm: number | null;
  cm_es_lowest_nm: number | null;
  cm_it_lowest_nm: number | null;
  cm_jp_lowest_nm: number | null;
  tcp_market: number | null;
  cm_en_avg_7d: number | null;
  cm_en_avg_30d: number | null;
  tcggo_score: number | null;
  tcggo_score_tier: string | null;
  tcggo_score_momentum: number | null;
  tcggo_score_stability: number | null;
  tcggo_score_liquidity: number | null;
  tcggo_score_demand: number | null;
  tcggo_score_market_depth: number | null;
  tcggo_score_grade_premium: number | null;
  tcggo_score_rsi: number | null;
  tcggo_score_ath: number | null;
  tcggo_score_atl: number | null;
  tcggo_score_updated_at: Date | string | null;
}

interface GradedHistoryRow {
  card_id: string;
  label: string;
  fetched_at: Date | string;
  price: number;
}

interface AllTimeGradedHistorySummaryRow {
  card_id: string;
  label: string;
  first_fetched_at: Date | null;
  first_value: number | null;
  low_fetched_at: Date | null;
  low_value: number | null;
  high_fetched_at: Date | null;
  high_value: number | null;
  history_points: number | null;
}

interface MoverSeriesPoint {
  date: string;
  timestamp: number;
  value: number;
}

interface MoverWindowMetric {
  change: number;
  changePct: number | null;
  coveredDays: number;
}

interface PeakGapMetric {
  change: number;
  changePct: number | null;
}

interface AllTimeSourceSummary {
  firstFetchedAt: Date | null;
  firstValue: number | null;
  lowFetchedAt: Date | null;
  lowValue: number | null;
  highFetchedAt: Date | null;
  highValue: number | null;
  historyPoints: number;
}

interface LifetimeMoverMetrics {
  firstTrackedAt: string | null;
  firstPrice: number | null;
  lowAt: string | null;
  lowPrice: number | null;
  highAt: string | null;
  highPrice: number | null;
  trackedDays: number | null;
  lifetimeHistoryPoints: number;
  changeSinceTracked: MoverWindowMetric | null;
  changeFromLow: MoverWindowMetric | null;
  gapToPeak: PeakGapMetric | null;
}

interface EvaluatedMoverSource {
  key: MoverSource;
  label: "CardMarket" | "TCGPlayer" | "Graded";
  currency: "EUR" | "USD";
  currentPrice: number;
  historyPoints: number;
  series: MoverSeriesPoint[];
  change7d: MoverWindowMetric | null;
  change30d: MoverWindowMetric | null;
  lifetime: LifetimeMoverMetrics;
}

export interface MoverRecentPricePoint {
  date: string;
  label: string;
  value: number;
}

export interface MoverGradedPrice {
  label: string;
  price: number;
}

export interface MoverGradingInsight {
  rawPrice: number;
  marketPrice: number;
  gradedPrice: number;
  valueGap: number;
  valueMultiplier: number;
  expectedValue: number;
  expectedGain: number;
  expectedMultiplier: number;
  estimatedHitRatePct: number;
  gradingCost: number;
  fallbackLabel: string | null;
  fallbackPrice: number | null;
  gradeStepMultiplier: number | null;
  spreadRisk: GradingTargetSpreadRisk;
  tier: GradingTargetTier;
  tierLabel: string;
  priceAdjusted: boolean;
  priceStatus: GradingTargetPriceStatus;
  priceReason: string | null;
  olderValueScore: number;
  score: number;
}

export interface MoverBuySignal {
  label: BuySignalLabel;
  labelText: string;
  score: number;
  markerPercent: number;
  confidence: BuySignalConfidence;
}

export interface CollectionMoverItem {
  cardId: string;
  name: string;
  imageUrl: string | null;
  cardNumber: string | null;
  rarity: string | null;
  normalizedRarity: string | null;
  episodeId: string;
  episodeName: string;
  episodeCode: string | null;
  episodeReleaseDate: string | null;
  releaseAgeYears: number | null;
  ownedCount: number;
  source: MoverSource;
  sourceLabel: "CardMarket" | "TCGPlayer" | "Graded";
  currency: "EUR" | "USD";
  currentPrice: number;
  cardmarketPrice: number | null;
  tcgplayerPrice: number | null;
  gradedLabel: string | null;
  gradedPrices: MoverGradedPrice[];
  grading: MoverGradingInsight | null;
  latestFetchedAt: string;
  historyPoints: number;
  cardmarketHistoryPoints: number;
  tcgplayerHistoryPoints: number;
  lifetimeHistoryPoints: number;
  recentPriceSeries: MoverRecentPricePoint[];
  trackedDays: number | null;
  change7d: number | null;
  change7dPct: number | null;
  change7dCoveredDays: number | null;
  change30d: number | null;
  change30dPct: number | null;
  change30dCoveredDays: number | null;
  changeSinceTracked: number | null;
  changeSinceTrackedPct: number | null;
  changeSinceTrackedCoveredDays: number | null;
  changeFromLow: number | null;
  changeFromLowPct: number | null;
  changeFromLowCoveredDays: number | null;
  gapToPeak: number | null;
  gapToPeakPct: number | null;
  firstTrackedAt: string | null;
  firstPrice: number | null;
  lowAt: string | null;
  lowPrice: number | null;
  highAt: string | null;
  highPrice: number | null;
  rarityWeight: number;
  pullRateOdds: string | null;
  specificPullOdds: string | null;
  pullRateWeight: number | null;
  pullRateSource: string | null;
  cheapnessWeight: number;
  ageWeight: number;
  olderValueScore: number;
  tcggoScore: TcggoMoverScore | null;
  movementScore: number;
  opportunityScore: number;
  rankingScore: number;
  priceQuality: MoverPriceQuality;
  buySignal: MoverBuySignal | null;
  moverScore: number;
}

/**
 * The market grid does not need the full lifetime evidence object for every
 * row. Keeping an explicit browser shape prevents hundreds of unused dates,
 * history counters and price-series points from entering the RSC payload.
 */
export type CollectionMoverBrowserItem = Pick<
  CollectionMoverItem,
  | "cardId"
  | "name"
  | "imageUrl"
  | "cardNumber"
  | "normalizedRarity"
  | "episodeId"
  | "episodeName"
  | "episodeCode"
  | "episodeReleaseDate"
  | "releaseAgeYears"
  | "ownedCount"
  | "source"
  | "sourceLabel"
  | "currency"
  | "currentPrice"
  | "cardmarketPrice"
  | "gradedLabel"
  | "change7d"
  | "change7dPct"
  | "change7dCoveredDays"
  | "change30d"
  | "change30dPct"
  | "change30dCoveredDays"
  | "changeSinceTrackedPct"
  | "changeFromLowPct"
  | "gapToPeakPct"
  | "rarityWeight"
  | "olderValueScore"
  | "movementScore"
  | "opportunityScore"
  | "rankingScore"
  | "buySignal"
  | "moverScore"
> & {
  tcggoScore: Pick<TcggoMoverScore, "score"> | null;
  priceQuality: Pick<MoverPriceQuality, "status" | "reason">;
  grading: Pick<
    MoverGradingInsight,
    | "rawPrice"
    | "marketPrice"
    | "gradedPrice"
    | "expectedValue"
    | "expectedGain"
    | "expectedMultiplier"
    | "estimatedHitRatePct"
    | "fallbackLabel"
    | "fallbackPrice"
    | "gradeStepMultiplier"
    | "spreadRisk"
    | "tier"
    | "priceAdjusted"
    | "score"
  > | null;
};

export function toCollectionMoverBrowserItem(
  item: CollectionMoverItem
): CollectionMoverBrowserItem {
  return {
    cardId: item.cardId,
    name: item.name,
    imageUrl: item.imageUrl,
    cardNumber: item.cardNumber,
    normalizedRarity: item.normalizedRarity,
    episodeId: item.episodeId,
    episodeName: item.episodeName,
    episodeCode: item.episodeCode,
    episodeReleaseDate: item.episodeReleaseDate,
    releaseAgeYears: item.releaseAgeYears,
    ownedCount: item.ownedCount,
    source: item.source,
    sourceLabel: item.sourceLabel,
    currency: item.currency,
    currentPrice: item.currentPrice,
    cardmarketPrice: item.cardmarketPrice,
    gradedLabel: item.gradedLabel,
    grading: item.grading
      ? {
          rawPrice: item.grading.rawPrice,
          marketPrice: item.grading.marketPrice,
          gradedPrice: item.grading.gradedPrice,
          expectedValue: item.grading.expectedValue,
          expectedGain: item.grading.expectedGain,
          expectedMultiplier: item.grading.expectedMultiplier,
          estimatedHitRatePct: item.grading.estimatedHitRatePct,
          fallbackLabel: item.grading.fallbackLabel,
          fallbackPrice: item.grading.fallbackPrice,
          gradeStepMultiplier: item.grading.gradeStepMultiplier,
          spreadRisk: item.grading.spreadRisk,
          tier: item.grading.tier,
          priceAdjusted: item.grading.priceAdjusted,
          score: item.grading.score,
        }
      : null,
    change7d: item.change7d,
    change7dPct: item.change7dPct,
    change7dCoveredDays: item.change7dCoveredDays,
    change30d: item.change30d,
    change30dPct: item.change30dPct,
    change30dCoveredDays: item.change30dCoveredDays,
    changeSinceTrackedPct: item.changeSinceTrackedPct,
    changeFromLowPct: item.changeFromLowPct,
    gapToPeakPct: item.gapToPeakPct,
    rarityWeight: item.rarityWeight,
    olderValueScore: item.olderValueScore,
    tcggoScore: item.tcggoScore ? { score: item.tcggoScore.score } : null,
    movementScore: item.movementScore,
    opportunityScore: item.opportunityScore,
    rankingScore: item.rankingScore,
    priceQuality: {
      status: item.priceQuality.status,
      reason: item.priceQuality.reason,
    },
    buySignal: item.buySignal,
    moverScore: item.moverScore,
  };
}

export interface CollectionMoversData {
  scope: MoversScope;
  preferredSource: PriceSource;
  trackedCards: number;
  eligibleCards: number;
  movers: CollectionMoverItem[];
  topOpportunities: CollectionMoverItem[];
  cheapestHighRarityMovers: CollectionMoverItem[];
  discountedHighRarity: CollectionMoverItem[];
  suddenDropDeals: CollectionMoverItem[];
  strongest7d: CollectionMoverItem | null;
  strongest30d: CollectionMoverItem | null;
}

export const SUDDEN_DROP_DEAL_MIN_AMOUNT = 50;
export const SUDDEN_DROP_DEAL_STRONG_AMOUNT = 100;
export const SUDDEN_DROP_DEAL_MAX_CURRENT_PRICE = 3000;

function round(value: number, decimals = 2): number {
  return Number(value.toFixed(decimals));
}

function pickStrongestCollectionMover(
  movers: CollectionMoverItem[],
  metric: "change7dPct" | "change30dPct"
): CollectionMoverItem | null {
  return (
    [...movers]
      .filter((item) => item.priceQuality.status !== "suspicious" && item[metric] != null)
      .sort(
        (a, b) =>
          (b[metric] ?? Number.NEGATIVE_INFINITY) -
          (a[metric] ?? Number.NEGATIVE_INFINITY)
      )[0] ?? null
  );
}

export function getMoverRecentDropAmount(
  item: Pick<CollectionMoverItem, "change7d" | "change30d">
): number {
  return Math.max(
    item.change7d != null && item.change7d < 0 ? Math.abs(item.change7d) : 0,
    item.change30d != null && item.change30d < 0 ? Math.abs(item.change30d) : 0
  );
}

export function getMoverRecentDropPercent(
  item: Pick<
    CollectionMoverItem,
    "change7d" | "change7dPct" | "change30d" | "change30dPct"
  >
): number | null {
  const candidates = [
    {
      change: item.change7d,
      percent: item.change7dPct,
    },
    {
      change: item.change30d,
      percent: item.change30dPct,
    },
  ]
    .filter(
      (candidate): candidate is { change: number; percent: number | null } =>
        candidate.change != null && candidate.change < 0
    )
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

  return candidates[0]?.percent ?? null;
}

function getSuddenDropInterestScore(item: CollectionMoverItem): number {
  const weightedCore =
    item.rankingScore +
    item.opportunityScore * 0.65 +
    Math.max(0, item.olderValueScore) * 0.85 +
    item.cheapnessWeight * 4 +
    item.ageWeight * 1.5;

  return weightedCore * clamp(item.rarityWeight, 0.8, 1.75);
}

function isSuddenDropDeal(item: CollectionMoverItem): boolean {
  if (item.priceQuality.status === "suspicious") {
    return false;
  }

  const dropAmount = getMoverRecentDropAmount(item);
  if (dropAmount < SUDDEN_DROP_DEAL_MIN_AMOUNT) {
    return false;
  }

  const dropPercent = Math.abs(getMoverRecentDropPercent(item) ?? 0);
  const peakGapPercent = Math.abs(Math.min(item.gapToPeakPct ?? 0, 0));
  const hasDropContext =
    dropAmount >= SUDDEN_DROP_DEAL_STRONG_AMOUNT ||
    dropPercent >= 10 ||
    peakGapPercent >= 20;
  const hasEnoughHistory =
    item.priceQuality.status === "ok" || dropAmount >= SUDDEN_DROP_DEAL_STRONG_AMOUNT;
  const hasInterestingWeight =
    item.rarityWeight >= 1.05 ||
    item.olderValueScore >= 4 ||
    item.opportunityScore >= 8 ||
    item.rankingScore >= 8 ||
    item.currentPrice <= 120;

  return (
    item.currentPrice <= SUDDEN_DROP_DEAL_MAX_CURRENT_PRICE &&
    hasDropContext &&
    hasEnoughHistory &&
    hasInterestingWeight
  );
}

function compareSuddenDropDeals(a: CollectionMoverItem, b: CollectionMoverItem): number {
  const interestDiff = getSuddenDropInterestScore(b) - getSuddenDropInterestScore(a);
  if (Math.abs(interestDiff) >= 0.01) {
    return interestDiff;
  }

  const dropDiff = getMoverRecentDropAmount(b) - getMoverRecentDropAmount(a);
  if (dropDiff !== 0) {
    return dropDiff;
  }

  const percentDiff =
    Math.abs(getMoverRecentDropPercent(b) ?? 0) -
    Math.abs(getMoverRecentDropPercent(a) ?? 0);
  if (percentDiff !== 0) {
    return percentDiff;
  }

  if (a.currentPrice !== b.currentPrice) {
    return a.currentPrice - b.currentPrice;
  }

  return a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });
}

function getSuddenDropDeals(movers: CollectionMoverItem[]): CollectionMoverItem[] {
  return movers.filter(isSuddenDropDeal).sort(compareSuddenDropDeals);
}

function combineCollectionMoversData(
  results: CollectionMoversData[]
): CollectionMoversData {
  const sourceResult = results[0];
  const movers = results
    .flatMap((result) => result.movers)
    .sort((a, b) => b.moverScore - a.moverScore || a.name.localeCompare(b.name))
    .slice(0, MAX_ALL_SCOPE_MOVERS);
  const topOpportunities = results
    .flatMap((result) => result.topOpportunities)
    .sort((a, b) => b.moverScore - a.moverScore || a.name.localeCompare(b.name))
    .slice(0, 12);
  const cheapestHighRarityMovers = results
    .flatMap((result) => result.cheapestHighRarityMovers)
    .sort(
      (a, b) =>
        a.currentPrice - b.currentPrice ||
        b.moverScore - a.moverScore ||
        a.name.localeCompare(b.name)
    )
    .slice(0, 16);
  const discountedHighRarity = results
    .flatMap((result) => result.discountedHighRarity)
    .sort(
      (a, b) =>
        (a.gapToPeakPct ?? 0) - (b.gapToPeakPct ?? 0) ||
        a.currentPrice - b.currentPrice ||
        a.name.localeCompare(b.name)
    );
  const suddenDropDeals = results
    .flatMap((result) => result.suddenDropDeals)
    .sort(compareSuddenDropDeals);

  return {
    scope: sourceResult?.scope ?? "collection",
    preferredSource: sourceResult?.preferredSource ?? "cm_en",
    trackedCards: results.reduce((total, result) => total + result.trackedCards, 0),
    eligibleCards: results.reduce((total, result) => total + result.eligibleCards, 0),
    movers,
    topOpportunities,
    cheapestHighRarityMovers,
    discountedHighRarity,
    suddenDropDeals,
    strongest7d: pickStrongestCollectionMover(movers, "change7dPct"),
    strongest30d: pickStrongestCollectionMover(movers, "change30dPct"),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getPullRateSourcePriority(source: string): number {
  const index = PREFERRED_PULL_RATE_SOURCES.indexOf(
    source as (typeof PREFERRED_PULL_RATE_SOURCES)[number]
  );
  return index >= 0 ? index : PREFERRED_PULL_RATE_SOURCES.length;
}

function toDateKey(value: Date | string): string {
  return new Date(value).toISOString().slice(0, 10);
}

function toDateLabel(dateKey: string): string {
  const cached = dateLabelCache.get(dateKey);
  if (cached) return cached;

  const label = SHORT_DATE_FORMATTER.format(new Date(`${dateKey}T00:00:00.000Z`));
  dateLabelCache.set(dateKey, label);
  return label;
}

function toIsoOrNull(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return new Date(value).toISOString();
}

function buildMoverBuySignal(input: {
  rarity: string | null;
  episodeName: string;
  episodeCode: string | null;
  episodeReleaseDate: string | null;
  latestPrices: Record<RawMoverSource, LatestPriceSnapshot | null>;
  priceHistory: CardPriceHistoryPoint[];
  pullRateInfo: PullRateInfo | null;
}): MoverBuySignal | null {
  const latestCardmarketPrice = input.latestPrices.cardmarket;
  const latestTcgplayerPrice = input.latestPrices.tcgplayer;
  const hasCurrentRawPrice = Boolean(latestCardmarketPrice || latestTcgplayerPrice);
  const signal = buildBuySignal({
    rarity: input.rarity,
    episode_name: input.episodeName,
    episode_code: input.episodeCode,
    episode_release_date: input.episodeReleaseDate,
    price: hasCurrentRawPrice
      ? {
          cm_en_lowest_nm: latestCardmarketPrice?.cm_en_lowest_nm ?? null,
          cm_de_lowest_nm: latestCardmarketPrice?.cm_de_lowest_nm ?? null,
          cm_fr_lowest_nm: latestCardmarketPrice?.cm_fr_lowest_nm ?? null,
          cm_es_lowest_nm: latestCardmarketPrice?.cm_es_lowest_nm ?? null,
          cm_it_lowest_nm: latestCardmarketPrice?.cm_it_lowest_nm ?? null,
          cm_jp_lowest_nm: latestCardmarketPrice?.cm_jp_lowest_nm ?? null,
          tcp_market: latestTcgplayerPrice?.tcp_market ?? null,
          tcp_mid: null,
          tcp_low: null,
          cm_en_avg_7d: latestCardmarketPrice?.cm_en_avg_7d ?? null,
          cm_en_avg_30d: latestCardmarketPrice?.cm_en_avg_30d ?? null,
        }
      : null,
    // CardMarket is the primary raw selection in buildBuySignal. Its timestamp
    // must not be advanced by a newer TCGPlayer comparison quote.
    price_fetched_at: toIsoOrNull(
      latestCardmarketPrice?.fetched_at ?? latestTcgplayerPrice?.fetched_at
    ),
    price_history: input.priceHistory,
    pull_rate_info: input.pullRateInfo
      ? {
          rarity_name: input.pullRateInfo.rarityName,
          pull_rate_odds: input.pullRateInfo.pullRateOdds,
          specific_pull_odds: input.pullRateInfo.specificPullOdds,
          pull_rate_weight: input.pullRateInfo.pullRateWeight,
          psa_avg_gem_pct: input.pullRateInfo.psaAvgGemPct,
        }
      : null,
  });

  return {
    label: signal.label,
    labelText: signal.label_text,
    score: signal.score,
    markerPercent: signal.marker_percent,
    confidence: signal.confidence,
  };
}

function hasTcggoScoreData(score: TcggoMoverScore): boolean {
  return Object.entries(score).some(([key, value]) => key !== "updatedAt" && value != null);
}

function buildTcggoMoverScore(row: {
  tcggo_score: number | null;
  tcggo_score_tier: string | null;
  tcggo_score_momentum: number | null;
  tcggo_score_stability: number | null;
  tcggo_score_liquidity: number | null;
  tcggo_score_demand: number | null;
  tcggo_score_market_depth: number | null;
  tcggo_score_grade_premium: number | null;
  tcggo_score_rsi: number | null;
  tcggo_score_ath: number | null;
  tcggo_score_atl: number | null;
  tcggo_score_updated_at: Date | string | null;
}): TcggoMoverScore | null {
  const score = {
    score: row.tcggo_score,
    tier: row.tcggo_score_tier,
    momentum: row.tcggo_score_momentum,
    stability: row.tcggo_score_stability,
    liquidity: row.tcggo_score_liquidity,
    demand: row.tcggo_score_demand,
    marketDepth: row.tcggo_score_market_depth,
    gradePremium: row.tcggo_score_grade_premium,
    rsi: row.tcggo_score_rsi,
    ath: row.tcggo_score_ath,
    atl: row.tcggo_score_atl,
    updatedAt: toIsoOrNull(row.tcggo_score_updated_at),
  };

  return hasTcggoScoreData(score) ? score : null;
}

function getPreferredCardMarketHistorySeriesKey(
  snapshot: LatestPriceSnapshot | null | undefined
): (typeof CARD_MARKET_HISTORY_SERIES)[number]["key"] | null {
  if (!snapshot) return null;
  return getCardMarketHistorySeriesCurrentValue(snapshot, "cm_market_en") != null
    ? "cm_market_en"
    : null;
}

function getUsableMoverMarketValue(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) && value > 0 && value !== 9001
    ? value
    : null;
}

function getCurrentSourceValue(
  snapshot: LatestPriceSnapshot | null | undefined,
  source: RawMoverSource
): number | null {
  if (!snapshot) {
    return null;
  }

  return source === "tcgplayer"
    ? getUsableMoverMarketValue(snapshot.tcp_market)
    : getUsableMoverMarketValue(snapshot.cm_en_lowest_nm);
}

function getHistorySourceValue(
  point: CardPriceHistoryPoint,
  source: RawMoverSource,
  cardmarketSeriesKey: (typeof CARD_MARKET_HISTORY_SERIES)[number]["key"] | null,
  historyPoints: CardPriceHistoryPoint[]
): number | null {
  if (source === "tcgplayer") return getUsableMoverMarketValue(point.tcp_market);
  if (!cardmarketSeriesKey) return point.cm_market ?? null;

  return getSaneCardMarketHistorySeriesCurrentValue(
    {
      cm_en_lowest_nm: point.cm_market_en,
      cm_de_lowest_nm: point.cm_market_de,
      cm_fr_lowest_nm: point.cm_market_fr,
      cm_es_lowest_nm: point.cm_market_es,
      cm_it_lowest_nm: point.cm_market_it,
    },
    cardmarketSeriesKey,
    historyPoints
  ).value;
}

function buildSeries(
  points: CardPriceHistoryPoint[],
  latestPrice: LatestPriceSnapshot | null,
  source: RawMoverSource
): MoverSeriesPoint[] {
  const cardmarketSeriesKey =
    source === "cardmarket" ? getPreferredCardMarketHistorySeriesKey(latestPrice) : null;
  const series = points
    .map((point) => {
      const value = getHistorySourceValue(point, source, cardmarketSeriesKey, points);
      if (value == null) {
        return null;
      }

      return {
        date: point.date,
        timestamp: new Date(`${point.date}T00:00:00.000Z`).getTime(),
        value,
      } satisfies MoverSeriesPoint;
    })
    .filter((point): point is MoverSeriesPoint => Boolean(point));

  const latestValue = getCurrentSourceValue(latestPrice, source);
  if (latestPrice && latestValue != null) {
    const latestDate = toDateKey(latestPrice.fetched_at);
    const latestTimestamp = new Date(`${latestDate}T00:00:00.000Z`).getTime();
    const existingIndex = series.findIndex((point) => point.date === latestDate);

    if (existingIndex >= 0) {
      series[existingIndex] = {
        date: latestDate,
        timestamp: latestTimestamp,
        value: latestValue,
      };
    } else {
      series.push({
        date: latestDate,
        timestamp: latestTimestamp,
        value: latestValue,
      });
    }
  }

  return series.sort((a, b) => a.timestamp - b.timestamp);
}

function buildGradedSeries(
  snapshots: GradedHistoryRow[],
  current: { fetched_at: Date | string; price: number }
): MoverSeriesPoint[] {
  const byDay = new Map<string, MoverSeriesPoint>();
  const sorted = [...snapshots].sort(
    (a, b) => new Date(a.fetched_at).getTime() - new Date(b.fetched_at).getTime()
  );

  for (const snapshot of sorted) {
    const date = toDateKey(snapshot.fetched_at);
    byDay.set(date, {
      date,
      timestamp: new Date(`${date}T00:00:00.000Z`).getTime(),
      value: snapshot.price,
    });
  }

  const currentDate = toDateKey(current.fetched_at);
  byDay.set(currentDate, {
    date: currentDate,
    timestamp: new Date(`${currentDate}T00:00:00.000Z`).getTime(),
    value: current.price,
  });

  return [...byDay.values()].sort((a, b) => a.timestamp - b.timestamp);
}

function buildRecentPriceSeries(series: MoverSeriesPoint[]): MoverRecentPricePoint[] {
  return series.slice(-RECENT_PRICE_SERIES_POINT_LIMIT).map((point) => ({
    date: point.date,
    label: toDateLabel(point.date),
    value: round(point.value),
  }));
}

function computeWindowMetric(
  series: MoverSeriesPoint[],
  desiredDays: number
): MoverWindowMetric | null {
  if (series.length < 2) {
    return null;
  }

  const latest = series[series.length - 1];
  const cutoff = latest.timestamp - desiredDays * DAY_MS;
  const baselineAtOrBeforeCutoff = [...series]
    .reverse()
    .find((point) => point.timestamp <= cutoff);
  const baseline =
    baselineAtOrBeforeCutoff ??
    series.find((point) => point.timestamp < latest.timestamp) ??
    null;

  if (!baseline || baseline.timestamp >= latest.timestamp) {
    return null;
  }

  const coveredDays = Math.max(1, Math.round((latest.timestamp - baseline.timestamp) / DAY_MS));
  const change = round(latest.value - baseline.value);
  const percentBase =
    baseline.value > 0 ? Math.max(baseline.value, MIN_PERCENT_BASE_VALUE) : null;
  const changePct = percentBase ? round((change / percentBase) * 100, 1) : null;

  return {
    change,
    changePct,
    coveredDays,
  };
}

function computeMetricFromBaseline(
  currentValue: number,
  currentAt: Date | string,
  baselineValue: number | null,
  baselineAt: Date | string | null | undefined
): MoverWindowMetric | null {
  if (baselineValue == null || !baselineAt) {
    return null;
  }

  const latestTimestamp = new Date(currentAt).getTime();
  const baselineTimestamp = new Date(baselineAt).getTime();

  if (!Number.isFinite(latestTimestamp) || !Number.isFinite(baselineTimestamp)) {
    return null;
  }

  const coveredDays = Math.max(1, Math.round((latestTimestamp - baselineTimestamp) / DAY_MS));
  const change = round(currentValue - baselineValue);
  const percentBase = baselineValue > 0 ? Math.max(baselineValue, MIN_PERCENT_BASE_VALUE) : null;
  const changePct = percentBase ? round((change / percentBase) * 100, 1) : null;

  return {
    change,
    changePct,
    coveredDays,
  };
}

function computeGapToPeakMetric(
  currentValue: number,
  peakValue: number | null
): PeakGapMetric | null {
  if (peakValue == null) {
    return null;
  }

  const change = round(currentValue - peakValue);
  const changePct =
    peakValue > 0 ? round((change / Math.max(peakValue, MIN_PERCENT_BASE_VALUE)) * 100, 1) : null;

  return {
    change,
    changePct,
  };
}

function getRarityWeight(rarity: string | null): number {
  const normalized = normalizeRarityLabel(rarity);
  if (!normalized) {
    return 1;
  }

  const index = KNOWN_RARITY_ORDER.indexOf(normalized as (typeof KNOWN_RARITY_ORDER)[number]);
  if (index === -1) {
    return 1.08;
  }

  return round(0.7 + (index / Math.max(KNOWN_RARITY_ORDER.length - 1, 1)) * 1.45, 2);
}

export function resolveMoverRarityWeight(
  rarity: string | null,
  pullRateWeight: number | null | undefined
): number {
  return pullRateWeight ?? getRarityWeight(rarity);
}

export function resolveRawMoverRarityWeight(
  rarity: string | null,
  pullRateWeight: number | null | undefined
): number {
  const weight = resolveMoverRarityWeight(rarity, pullRateWeight);
  const normalized = normalizeRarityLabel(rarity);

  if (normalized === "Common") {
    return Math.min(weight, 0.9);
  }

  if (normalized === "Uncommon") {
    return Math.min(weight, 1);
  }

  return weight;
}

function getCheapnessWeight(currentPrice: number): number {
  // Bulk cards under 1 EUR/USD are usually too noisy to deserve the strongest cheapness boost.
  if (currentPrice <= 0.25) return 0.82;
  if (currentPrice <= 0.5) return 0.94;
  if (currentPrice <= 1) return 1.06;
  if (currentPrice <= 3) return 1.34;
  if (currentPrice <= 5) return 1.5;
  if (currentPrice <= 10) return 1.42;
  if (currentPrice <= 20) return 1.3;
  if (currentPrice <= 40) return 1.16;
  if (currentPrice <= 75) return 1.03;
  if (currentPrice <= 120) return 0.9;
  return 0.8;
}

function getReleaseAgeYears(releaseDate: string | null | undefined): number | null {
  if (!releaseDate) {
    return null;
  }

  const timestamp = new Date(releaseDate).getTime();
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return round(Math.max(0, (Date.now() - timestamp) / (DAY_MS * 365.25)), 1);
}

function getAgeWeight(releaseAgeYears: number | null): number {
  if (releaseAgeYears == null) return 1;
  if (releaseAgeYears >= 20) return 1.3;
  if (releaseAgeYears >= 15) return 1.24;
  if (releaseAgeYears >= 10) return 1.18;
  if (releaseAgeYears >= 7) return 1.12;
  if (releaseAgeYears >= 5) return 1.07;
  if (releaseAgeYears >= 3) return 1.03;
  return 1;
}

function isGradeTenLabel(label: string | null | undefined): boolean {
  return parseGradingTargetLabel(label).isGradeTenEquivalent;
}

function getOlderValueScore(input: {
  releaseAgeYears: number | null;
  currentPrice: number;
  rarityWeight: number;
  cheapnessWeight: number;
  kind: "raw" | "graded" | "grading";
  isGradeTen?: boolean;
}): number {
  if (input.releaseAgeYears == null || input.releaseAgeYears < 5) {
    return 0;
  }

  const priceCap =
    input.kind === "grading" ? 35 : input.kind === "graded" && input.isGradeTen ? 180 : 80;
  if (input.currentPrice > priceCap) {
    return 0;
  }

  const ageFactor = clamp((input.releaseAgeYears - 5) / 15, 0, 1);
  const cheapFactor = clamp((input.cheapnessWeight - 0.8) / 0.75, 0, 1);
  const rarityFactor = clamp((input.rarityWeight - 1) / 0.85, 0, 1);
  const gradeTenBoost = input.isGradeTen ? 1.2 : 1;
  const baseScore = input.kind === "grading" ? 14 : input.kind === "graded" ? 9 : 11;

  return round(
    baseScore *
      (0.3 + ageFactor * 0.7) *
      (0.5 + cheapFactor * 0.5) *
      (0.55 + rarityFactor * 0.45) *
      gradeTenBoost
  );
}

interface GradingInsightOptions {
  assessment: GradingTargetAssessment;
  ageWeight?: number;
  olderValueScore?: number;
  isGradeTen?: boolean;
}

function buildGradingInsight(
  rawPrice: number | null,
  rarityWeight: number,
  options: GradingInsightOptions
): MoverGradingInsight | null {
  const { assessment } = options;
  const gradedPrice = assessment.targetPrice;
  if (rawPrice == null || rawPrice <= 0 || gradedPrice <= 0) {
    return null;
  }

  const valueGap = gradedPrice - rawPrice;
  const valueMultiplier = gradedPrice / rawPrice;
  const positiveExpectedGain = Math.max(assessment.expectedGain, 0);
  const rawAffordabilityBoost =
    rawPrice <= 5
      ? 1.18
      : rawPrice <= 10
        ? 1.14
        : rawPrice <= 20
          ? 1.1
          : rawPrice <= 40
            ? 1.05
            : rawPrice <= 75
              ? 1
              : rawPrice <= 120
                ? 0.92
                : 0.82;
  const expectedMultiplierScore =
    Math.log2(Math.max(assessment.expectedMultiplier, 1)) * 42;
  const expectedGainScore = Math.min(positiveExpectedGain, 600) / 7;
  const targetGapScore = Math.min(Math.max(valueGap, 0), 500) / 25;
  const ageMultiplier = clamp(options.ageWeight ?? 1, 1, 1.24);
  const gradeTenMultiplier = options.isGradeTen ? 1.03 : 1;
  const qualityWeight =
    assessment.priceStatus === "suspicious"
      ? 0
      : assessment.priceStatus === "thin_history"
        ? 0.68
        : 1;
  const olderValueScore = options.olderValueScore ?? 0;
  const rawScore =
    (expectedMultiplierScore + expectedGainScore + targetGapScore) *
      rawAffordabilityBoost *
      clamp(rarityWeight, 0.75, 1.85) *
      ageMultiplier *
      gradeTenMultiplier + olderValueScore;
  const score = round(clamp(rawScore * qualityWeight, 0, 100));

  return {
    rawPrice: round(rawPrice),
    marketPrice: assessment.marketPrice,
    gradedPrice: round(gradedPrice),
    valueGap: round(valueGap),
    valueMultiplier: round(valueMultiplier, 2),
    expectedValue: assessment.expectedValue,
    expectedGain: assessment.expectedGain,
    expectedMultiplier: assessment.expectedMultiplier,
    estimatedHitRatePct: assessment.estimatedHitRatePct,
    gradingCost: assessment.gradingCost,
    fallbackLabel: assessment.fallbackLabel,
    fallbackPrice: assessment.fallbackPrice,
    gradeStepMultiplier: assessment.gradeStepMultiplier,
    spreadRisk: assessment.spreadRisk,
    tier: assessment.tier,
    tierLabel: assessment.tierLabel,
    priceAdjusted: assessment.priceAdjusted,
    priceStatus: assessment.priceStatus,
    priceReason: assessment.priceReason,
    olderValueScore,
    score,
  };
}

function hasMeaningfulMove(
  change7d: MoverWindowMetric | null,
  change30d: MoverWindowMetric | null
): boolean {
  const biggestPercent = Math.max(
    Math.abs(change7d?.changePct ?? 0),
    Math.abs(change30d?.changePct ?? 0)
  );
  const biggestAbsolute = Math.max(
    Math.abs(change7d?.change ?? 0),
    Math.abs(change30d?.change ?? 0)
  );
  return biggestPercent >= 4 || biggestAbsolute >= 0.75;
}

function buildLifetimeMetrics(
  currentPrice: number,
  currentAt: Date | string,
  summary: AllTimeSourceSummary
): LifetimeMoverMetrics {
  const changeSinceTracked = computeMetricFromBaseline(
    currentPrice,
    currentAt,
    summary.firstValue,
    summary.firstFetchedAt
  );
  const changeFromLow = computeMetricFromBaseline(
    currentPrice,
    currentAt,
    summary.lowValue,
    summary.lowFetchedAt
  );
  const gapToPeak = computeGapToPeakMetric(currentPrice, summary.highValue);
  const trackedDays = summary.firstFetchedAt
    ? Math.max(
        1,
        Math.round(
          (new Date(currentAt).getTime() - new Date(summary.firstFetchedAt).getTime()) / DAY_MS
        )
      )
    : null;

  return {
    firstTrackedAt: toIsoOrNull(summary.firstFetchedAt),
    firstPrice: summary.firstValue != null ? round(summary.firstValue) : null,
    lowAt: toIsoOrNull(summary.lowFetchedAt),
    lowPrice: summary.lowValue != null ? round(summary.lowValue) : null,
    highAt: toIsoOrNull(summary.highFetchedAt),
    highPrice: summary.highValue != null ? round(summary.highValue) : null,
    trackedDays,
    lifetimeHistoryPoints: summary.historyPoints,
    changeSinceTracked,
    changeFromLow,
    gapToPeak,
  };
}

function evaluateSource(
  latestPrice: LatestPriceSnapshot | null,
  historyPoints: CardPriceHistoryPoint[],
  source: RawMoverSource,
  allTimeSummary: AllTimeSourceSummary
): EvaluatedMoverSource | null {
  const currentPrice = getCurrentSourceValue(latestPrice, source);
  if (currentPrice == null) {
    return null;
  }

  const series = buildSeries(historyPoints, latestPrice, source);
  if (series.length < 2) {
    return null;
  }

  return {
    key: source,
    label: source === "tcgplayer" ? "TCGPlayer" : "CardMarket",
    currency: source === "tcgplayer" ? "USD" : "EUR",
    currentPrice,
    historyPoints: series.length,
    series,
    change7d: computeWindowMetric(series, 7),
    change30d: computeWindowMetric(series, 30),
    lifetime: buildLifetimeMetrics(currentPrice, latestPrice?.fetched_at ?? new Date(), allTimeSummary),
  };
}

function resolveBestSource(
  latestPrices: Record<RawMoverSource, LatestPriceSnapshot | null>,
  historyPoints: CardPriceHistoryPoint[],
  preferredSource: PriceSource,
  allTimeSummaries: Record<RawMoverSource, AllTimeSourceSummary>
): EvaluatedMoverSource | null {
  const preferredRawSource: RawMoverSource =
    preferredSource === "tcp" ? "tcgplayer" : "cardmarket";
  const available = {
    cardmarket: getCurrentSourceValue(latestPrices.cardmarket, "cardmarket") != null,
    tcgplayer: getCurrentSourceValue(latestPrices.tcgplayer, "tcgplayer") != null,
  };
  const selectedSource = chooseRawMoverSource({
    preferred: preferredRawSource,
    available,
  });

  if (!selectedSource) {
    return null;
  }

  return evaluateSource(
    latestPrices[selectedSource],
    historyPoints,
    selectedSource,
    allTimeSummaries[selectedSource]
  );
}

function getMoverCandidateCardsCte(
  scope: MoversScope,
  userId: string | null | undefined,
  game: TradingCardGame
): { sql: string; params: unknown[] } {
  if (scope === "all" || scope === "graded" || scope === "grading") {
    return {
      sql: `
        SELECT c_filter.id AS card_id
        FROM "Card" c_filter
        WHERE c_filter.game = ?
          AND EXISTS (
            SELECT 1
            FROM "Price" p
            WHERE p.card_id = c_filter.id
            LIMIT 1
          )
      `,
      params: [game],
    };
  }

  return {
    sql: `
      SELECT DISTINCT cc.card_id
      FROM "CollectionCard" cc
      INNER JOIN "Card" c_filter ON c_filter.id = cc.card_id
      WHERE ${userId ? "cc.user_id = ? AND " : ""}cc.for_sale = 0
        AND cc.sold_at IS NULL
        AND c_filter.game = ?
    `,
    params: userId ? [userId, game] : [game],
  };
}

function chunkValues<T>(values: T[], size = SQLITE_SAFE_CHUNK_SIZE): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

function hasUsdEbaySoldGradedMoverPrices(records: CollectionMoverOwnedCardRecord[]): boolean {
  return records.some(
    (record) =>
      record.grading_company &&
      record.grading_grade &&
      record.card.ebaySoldGradedPrices.some(
        (price) => price.currency.toUpperCase() === "USD"
      )
  );
}

function buildCollectionMoverPriceOverrideMap(
  records: CollectionMoverOwnedCardRecord[],
  usdToEurRate: CurrencyExchangeRate | null
): Map<string, CollectionMoverPriceOverride> {
  const overrides = new Map<string, CollectionMoverPriceOverride>();

  for (const record of records) {
    if (overrides.has(record.card_id)) continue;

    const matchedGradedPrice = getCollectionMatchedGradedPrice(record.card, {
      gradingCompany: record.grading_company,
      gradingGrade: record.grading_grade,
      usdToEurRate,
    });

    if (matchedGradedPrice) {
      overrides.set(record.card_id, matchedGradedPrice);
    }
  }

  return overrides;
}

async function fetchCollectionMoverPriceOverrides(
  cardIds: string[],
  userId?: string | null
): Promise<Map<string, CollectionMoverPriceOverride>> {
  if (!userId || cardIds.length === 0) {
    return new Map();
  }

  const pages = await Promise.all(
    chunkValues(cardIds).map((chunk) =>
      db.collectionCard.findMany({
        where: {
          user_id: userId,
          for_sale: false,
          sold_at: null,
          card_id: { in: chunk },
          grading_company: { not: null },
          grading_grade: { not: null },
        },
        orderBy: [{ updated_at: "desc" }],
        select: {
          card_id: true,
          grading_company: true,
          grading_grade: true,
          card: {
            select: {
              gradedPrices: {
                orderBy: [{ price: "desc" }, { label: "asc" }],
                select: {
                  label: true,
                  price: true,
                },
              },
              ebaySoldGradedPrices: {
                orderBy: [{ median_price: "desc" }, { label: "asc" }],
                select: {
                  label: true,
                  company: true,
                  grade: true,
                  median_price: true,
                  currency: true,
                },
              },
            },
          },
        },
      })
    )
  );
  const records = pages.flat();
  const usdToEurRate = hasUsdEbaySoldGradedMoverPrices(records)
    ? await getUsdToEurRate()
    : null;

  return buildCollectionMoverPriceOverrideMap(records, usdToEurRate);
}

async function fetchMoverCandidateCards(
  scope: MoversScope,
  userId?: string | null,
  game: TradingCardGame = POKEMON_GAME
): Promise<MoverCandidateCardRecord[]> {
  const candidateCardsCte = getMoverCandidateCardsCte(scope, userId, game);
  const ownedCountWhere = userId
    ? "WHERE user_id = ? AND for_sale = 0 AND sold_at IS NULL"
    : "WHERE for_sale = 0 AND sold_at IS NULL";
  const rows = await db.$queryRawUnsafe<MoverCandidateCardRow[]>(
    `
    WITH candidate_cards AS (
      ${candidateCardsCte.sql}
    ),
    owned_counts AS (
      SELECT card_id, COUNT(*) AS owned_count
      FROM "CollectionCard"
      ${ownedCountWhere}
      GROUP BY card_id
    )
    SELECT
      c.id,
      c.name,
      c.card_number,
      c.rarity,
      c.image_url,
      c.tcggo_score,
      c.tcggo_score_tier,
      c.tcggo_score_momentum,
      c.tcggo_score_stability,
      c.tcggo_score_liquidity,
      c.tcggo_score_demand,
      c.tcggo_score_market_depth,
      c.tcggo_score_grade_premium,
      c.tcggo_score_rsi,
      c.tcggo_score_ath,
      c.tcggo_score_atl,
      c.tcggo_score_updated_at,
      e.id AS episode_id,
      e.name AS episode_name,
      e.code AS episode_code,
      e.release_date AS episode_release_date,
      COALESCE(oc.owned_count, 0) AS owned_count,
      cm_lp.fetched_at AS cm_fetched_at,
      cm_lp.cm_en_lowest_nm,
      cm_lp.cm_de_lowest_nm,
      cm_lp.cm_fr_lowest_nm,
      cm_lp.cm_es_lowest_nm,
      cm_lp.cm_it_lowest_nm,
      cm_lp.cm_jp_lowest_nm,
      cm_lp.cm_en_avg_7d,
      cm_lp.cm_en_avg_30d,
      tcp_lp.fetched_at AS tcp_fetched_at,
      tcp_lp.tcp_market
    FROM candidate_cards cc
    INNER JOIN "Card" c ON c.id = cc.card_id
    INNER JOIN "Episode" e ON e.id = c.episode_id
    LEFT JOIN owned_counts oc ON oc.card_id = c.id
    LEFT JOIN "Price" cm_lp ON cm_lp.id = (
      SELECT p2.id
      FROM "Price" p2
      WHERE p2.card_id = c.id
        AND p2.cm_en_lowest_nm > 0
        AND p2.cm_en_lowest_nm <> 9001
      ORDER BY p2.fetched_at DESC, p2.id DESC
      LIMIT 1
    )
    LEFT JOIN "Price" tcp_lp ON tcp_lp.id = (
      SELECT p2.id
      FROM "Price" p2
      WHERE p2.card_id = c.id
        AND p2.tcp_market > 0
        AND p2.tcp_market <> 9001
      ORDER BY p2.fetched_at DESC, p2.id DESC
      LIMIT 1
    )
    ORDER BY c.name ASC
  `,
    ...candidateCardsCte.params,
    ...(userId ? [userId] : [])
  );

  const candidates = rows.map((row) => ({
    id: row.id,
    name: row.name,
    card_number: row.card_number,
    rarity: row.rarity,
    image_url: row.image_url,
    episode: {
      id: row.episode_id,
      name: row.episode_name,
      code: row.episode_code,
      release_date: row.episode_release_date,
    },
    latestPrices: {
      cardmarket: row.cm_fetched_at
        ? {
            fetched_at: row.cm_fetched_at,
            cm_en_lowest_nm: row.cm_en_lowest_nm,
            cm_de_lowest_nm: row.cm_de_lowest_nm,
            cm_fr_lowest_nm: row.cm_fr_lowest_nm,
            cm_es_lowest_nm: row.cm_es_lowest_nm,
            cm_it_lowest_nm: row.cm_it_lowest_nm,
            cm_jp_lowest_nm: row.cm_jp_lowest_nm,
            tcp_market: null,
            cm_en_avg_7d: row.cm_en_avg_7d,
            cm_en_avg_30d: row.cm_en_avg_30d,
          }
        : null,
      tcgplayer: row.tcp_fetched_at
        ? {
            fetched_at: row.tcp_fetched_at,
            cm_en_lowest_nm: null,
            cm_de_lowest_nm: null,
            cm_fr_lowest_nm: null,
            cm_es_lowest_nm: null,
            cm_it_lowest_nm: null,
            cm_jp_lowest_nm: null,
            tcp_market: row.tcp_market,
            cm_en_avg_7d: null,
            cm_en_avg_30d: null,
          }
        : null,
    },
    tcggoScore: buildTcggoMoverScore(row),
    ownedCount: Number(row.owned_count ?? 0),
    collectionPriceOverride: null,
  }));

  if (scope !== "collection" || !userId || candidates.length === 0) {
    return candidates;
  }

  const collectionPriceOverrides = await fetchCollectionMoverPriceOverrides(
    candidates.map((card) => card.id),
    userId
  );

  return candidates.map((card) => ({
    ...card,
    collectionPriceOverride: collectionPriceOverrides.get(card.id) ?? null,
  }));
}

function buildGradedMoverKey(cardId: string, label: string): string {
  return `${cardId}\u0000${label}`;
}

function buildLatestRawPricesFromGradedRow(
  row: GradedMoverCandidateRow
): Record<RawMoverSource, LatestPriceSnapshot | null> {
  return {
    cardmarket: row.raw_fetched_at
      ? {
          fetched_at: row.raw_fetched_at,
          cm_en_lowest_nm: row.cm_en_lowest_nm,
          cm_de_lowest_nm: row.cm_de_lowest_nm,
          cm_fr_lowest_nm: row.cm_fr_lowest_nm,
          cm_es_lowest_nm: row.cm_es_lowest_nm,
          cm_it_lowest_nm: row.cm_it_lowest_nm,
          cm_jp_lowest_nm: row.cm_jp_lowest_nm,
          tcp_market: null,
          cm_en_avg_7d: row.cm_en_avg_7d,
          cm_en_avg_30d: row.cm_en_avg_30d,
        }
      : null,
    tcgplayer: row.tcp_fetched_at
      ? {
          fetched_at: row.tcp_fetched_at,
          cm_en_lowest_nm: null,
          cm_de_lowest_nm: null,
          cm_fr_lowest_nm: null,
          cm_es_lowest_nm: null,
          cm_it_lowest_nm: null,
          cm_jp_lowest_nm: null,
          tcp_market: row.tcp_market,
          cm_en_avg_7d: null,
          cm_en_avg_30d: null,
        }
      : null,
  };
}

function buildGradedPricesByCardId(
  rows: GradedMoverCandidateRow[]
): Map<string, MoverGradedPrice[]> {
  const pricesByCardId = new Map<string, MoverGradedPrice[]>();

  for (const row of rows) {
    const existing = pricesByCardId.get(row.card_id) ?? [];
    existing.push({
      label: row.graded_label,
      price: row.graded_price,
    });
    pricesByCardId.set(row.card_id, existing);
  }

  for (const [cardId, prices] of pricesByCardId) {
    pricesByCardId.set(
      cardId,
      [...prices].sort((a, b) => b.price - a.price || a.label.localeCompare(b.label))
    );
  }

  return pricesByCardId;
}

async function buildGradedMoversData(
  preferredSource: PriceSource,
  scope: Extract<MoversScope, "graded" | "grading"> = "graded",
  itemScope: MoversItemScope = "all",
  userId?: string | null,
  game: TradingCardGame = POKEMON_GAME
): Promise<{ result: CollectionMoversData; historyRows: number }> {
  const historyCutoff = new Date(Date.now() - HISTORY_LOOKBACK_DAYS * DAY_MS).toISOString();
  const ownedCountWhere = userId
    ? "WHERE user_id = ? AND for_sale = 0 AND sold_at IS NULL"
    : "WHERE for_sale = 0 AND sold_at IS NULL";
  const gradedWhereParts = ["c.game = ?"];
  if (scope === "grading") {
    gradedWhereParts.push("gp.price > 0", "gp.price <> 9001");
  }
  if (itemScope === "collection") {
    gradedWhereParts.push("COALESCE(oc.owned_count, 0) > 0");
  }
  const gradedWhere = `WHERE ${gradedWhereParts.join(" AND ")}`;

  const [currentRows, recentHistoryRows, allTimeHistorySummaries, pullRateRows] =
    await Promise.all([
      db.$queryRawUnsafe<GradedMoverCandidateRow[]>(
        `
        WITH owned_counts AS (
          SELECT card_id, COUNT(*) AS owned_count
          FROM "CollectionCard"
          ${ownedCountWhere}
          GROUP BY card_id
        )
        SELECT
          gp.card_id,
          c.name,
          c.card_number,
          c.rarity,
          c.image_url,
          c.tcggo_score,
          c.tcggo_score_tier,
          c.tcggo_score_momentum,
          c.tcggo_score_stability,
          c.tcggo_score_liquidity,
          c.tcggo_score_demand,
          c.tcggo_score_market_depth,
          c.tcggo_score_grade_premium,
          c.tcggo_score_rsi,
          c.tcggo_score_ath,
          c.tcggo_score_atl,
          c.tcggo_score_updated_at,
          e.id AS episode_id,
          e.name AS episode_name,
          e.code AS episode_code,
          e.release_date AS episode_release_date,
          COALESCE(oc.owned_count, 0) AS owned_count,
          gp.label AS graded_label,
          gp.price AS graded_price,
          gp.fetched_at AS graded_fetched_at,
          lp.fetched_at AS raw_fetched_at,
          tcp_lp.fetched_at AS tcp_fetched_at,
          lp.cm_en_lowest_nm,
          lp.cm_de_lowest_nm,
          lp.cm_fr_lowest_nm,
          lp.cm_es_lowest_nm,
          lp.cm_it_lowest_nm,
          lp.cm_jp_lowest_nm,
          tcp_lp.tcp_market,
          lp.cm_en_avg_7d,
          lp.cm_en_avg_30d
        FROM "CardGradedPrice" gp
        INNER JOIN "Card" c ON c.id = gp.card_id
        INNER JOIN "Episode" e ON e.id = c.episode_id
        LEFT JOIN owned_counts oc ON oc.card_id = c.id
        LEFT JOIN "Price" lp ON lp.id = (
          SELECT p2.id
          FROM "Price" p2
          WHERE p2.card_id = c.id
            AND p2.cm_en_lowest_nm > 0
            AND p2.cm_en_lowest_nm <> 9001
          ORDER BY p2.fetched_at DESC, p2.id DESC
          LIMIT 1
        )
        LEFT JOIN "Price" tcp_lp ON tcp_lp.id = (
          SELECT p2.id
          FROM "Price" p2
          WHERE p2.card_id = c.id
            AND p2.tcp_market > 0
            AND p2.tcp_market <> 9001
          ORDER BY p2.fetched_at DESC, p2.id DESC
          LIMIT 1
        )
        ${gradedWhere}
        ORDER BY gp.price DESC, c.name ASC, gp.label ASC
      `,
        ...(userId ? [userId] : []),
        game
      ),
      db.$queryRawUnsafe<GradedHistoryRow[]>(
        `
        WITH current_graded AS (
          SELECT gp.card_id, gp.label
          FROM "CardGradedPrice" gp
          INNER JOIN "Card" c ON c.id = gp.card_id
          WHERE c.game = ?
        )
        SELECT
          card_id,
          label,
          fetched_at,
          price
        FROM (
          SELECT
            s.card_id,
            s.label,
            s.fetched_at,
            s.price,
            ROW_NUMBER() OVER (
              PARTITION BY s.card_id, s.label, DATE(s.fetched_at)
              ORDER BY s.fetched_at DESC, s.id DESC
            ) AS row_num
          FROM "CardGradedPriceSnapshot" s
          INNER JOIN current_graded cg
            ON cg.card_id = s.card_id
            AND cg.label = s.label
          WHERE s.fetched_at >= ?
            AND s.price > 0
            AND s.price <> 9001
        )
        WHERE row_num = 1
        ORDER BY card_id ASC, label ASC, fetched_at ASC
      `,
        game,
        historyCutoff
      ),
      db.$queryRawUnsafe<AllTimeGradedHistorySummaryRow[]>(
        `
        WITH current_graded AS (
          SELECT gp.card_id, gp.label
          FROM "CardGradedPrice" gp
          INNER JOIN "Card" c ON c.id = gp.card_id
          WHERE c.game = ?
        ),
        graded_summary AS (
          SELECT
            s.card_id,
            s.label,
            COUNT(DISTINCT DATE(s.fetched_at)) AS history_points,
            MIN(s.price) AS low_value,
            MAX(s.price) AS high_value
          FROM "CardGradedPriceSnapshot" s
          INNER JOIN current_graded cg
            ON cg.card_id = s.card_id
            AND cg.label = s.label
          WHERE s.price > 0
            AND s.price <> 9001
          GROUP BY s.card_id, s.label
        )
        SELECT
          cg.card_id,
          cg.label,
          (
            SELECT s.fetched_at
            FROM "CardGradedPriceSnapshot" s
            WHERE s.card_id = cg.card_id
              AND s.label = cg.label
              AND s.price > 0
              AND s.price <> 9001
            ORDER BY s.fetched_at ASC, s.id ASC
            LIMIT 1
          ) AS first_fetched_at,
          (
            SELECT s.price
            FROM "CardGradedPriceSnapshot" s
            WHERE s.card_id = cg.card_id
              AND s.label = cg.label
              AND s.price > 0
              AND s.price <> 9001
            ORDER BY s.fetched_at ASC, s.id ASC
            LIMIT 1
          ) AS first_value,
          (
            SELECT s.fetched_at
            FROM "CardGradedPriceSnapshot" s
            WHERE s.card_id = cg.card_id
              AND s.label = cg.label
              AND s.price > 0
              AND s.price <> 9001
            ORDER BY s.price ASC, s.fetched_at ASC, s.id ASC
            LIMIT 1
          ) AS low_fetched_at,
          graded_summary.low_value,
          (
            SELECT s.fetched_at
            FROM "CardGradedPriceSnapshot" s
            WHERE s.card_id = cg.card_id
              AND s.label = cg.label
              AND s.price > 0
              AND s.price <> 9001
            ORDER BY s.price DESC, s.fetched_at ASC, s.id ASC
            LIMIT 1
          ) AS high_fetched_at,
          graded_summary.high_value,
          graded_summary.history_points
        FROM current_graded cg
        LEFT JOIN graded_summary
          ON graded_summary.card_id = cg.card_id
          AND graded_summary.label = cg.label
        ORDER BY cg.card_id ASC, cg.label ASC
      `,
        game
      ),
      db.$queryRawUnsafe<PullRateRarityRow[]>(
        `
        SELECT DISTINCT
          spr.source,
          spr.set_code,
          spr.normalized_rarity,
          spr.rarity_name,
          spr.pull_rate_odds,
          spr.pull_rate_denominator,
          spr.specific_pull_denominator,
          spr.psa_avg_gem_pct
        FROM "CardGradedPrice" gp
        INNER JOIN "Card" c ON c.id = gp.card_id
        INNER JOIN "Episode" e ON e.id = c.episode_id
        INNER JOIN "SetPullRateRarity" spr
          ON spr.source IN (?, ?)
          AND spr.set_code = UPPER(e.code)
        WHERE e.code IS NOT NULL
          AND c.game = ?
        ORDER BY
          spr.set_code ASC,
          spr.normalized_rarity ASC,
          CASE spr.source WHEN ? THEN 0 WHEN ? THEN 1 ELSE 2 END ASC
      `,
        PREFERRED_PULL_RATE_SOURCES[0],
        PREFERRED_PULL_RATE_SOURCES[1],
        game,
        PREFERRED_PULL_RATE_SOURCES[0],
        PREFERRED_PULL_RATE_SOURCES[1]
      ),
    ]);

  const recentHistoryRowsByKey = new Map<string, GradedHistoryRow[]>();
  for (const row of recentHistoryRows) {
    const key = buildGradedMoverKey(row.card_id, row.label);
    const existing = recentHistoryRowsByKey.get(key) ?? [];
    existing.push(row);
    recentHistoryRowsByKey.set(key, existing);
  }

  const allTimeSummaryByKey = new Map<string, AllTimeSourceSummary>();
  for (const row of allTimeHistorySummaries) {
    allTimeSummaryByKey.set(buildGradedMoverKey(row.card_id, row.label), {
      firstFetchedAt: row.first_fetched_at,
      firstValue: row.first_value,
      lowFetchedAt: row.low_fetched_at,
      lowValue: row.low_value,
      highFetchedAt: row.high_fetched_at,
      highValue: row.high_value,
      historyPoints: Number(row.history_points ?? 0),
    });
  }

  const pullRateBySetAndRarity = new Map<string, PullRateInfo>();
  for (const row of pullRateRows) {
    const key = `${row.set_code.toUpperCase()}::${row.normalized_rarity}`;
    const existing = pullRateBySetAndRarity.get(key);
    if (
      existing &&
      getPullRateSourcePriority(existing.source) <= getPullRateSourcePriority(row.source)
    ) {
      continue;
    }
    pullRateBySetAndRarity.set(
      key,
      buildPullRateInfoFromRarity({
        source: row.source,
        setCode: row.set_code,
        normalizedRarity: row.normalized_rarity,
        rarityName: row.rarity_name,
        pullRateOdds: row.pull_rate_odds,
        pullRateDenominator: row.pull_rate_denominator,
        specificPullDenominator: row.specific_pull_denominator,
        psaAvgGemPct: row.psa_avg_gem_pct,
      })
    );
  }

  const gradedPricesByCardId = buildGradedPricesByCardId(currentRows);
  const movers: CollectionMoverItem[] = [];

  for (const row of currentRows) {
    const key = buildGradedMoverKey(row.card_id, row.graded_label);
    const currentPrice = row.graded_price;
    const currentAt = row.graded_fetched_at;
    const series = buildGradedSeries(recentHistoryRowsByKey.get(key) ?? [], {
      fetched_at: currentAt,
      price: currentPrice,
    });
    const change7d = computeWindowMetric(series, 7);
    const change30d = computeWindowMetric(series, 30);
    const allTimeSummary =
      allTimeSummaryByKey.get(key) ?? {
        firstFetchedAt: currentAt instanceof Date ? currentAt : new Date(currentAt),
        firstValue: currentPrice,
        lowFetchedAt: currentAt instanceof Date ? currentAt : new Date(currentAt),
        lowValue: currentPrice,
        highFetchedAt: currentAt instanceof Date ? currentAt : new Date(currentAt),
        highValue: currentPrice,
        historyPoints: series.length,
      };
    const lifetime = buildLifetimeMetrics(currentPrice, currentAt, allTimeSummary);
    const normalizedRarity = normalizeRarityLabel(row.rarity);
    const pullRateInfo =
      row.episode_code && normalizedRarity
        ? pullRateBySetAndRarity.get(`${row.episode_code.toUpperCase()}::${normalizedRarity}`) ??
          null
        : null;
    const isGradeTen = isGradeTenLabel(row.graded_label);
    const rawLatestPrices = buildLatestRawPricesFromGradedRow(row);
    const rawPriceHistory = buildCardPriceHistory(
      [rawLatestPrices.cardmarket, rawLatestPrices.tcgplayer].filter(
        (price): price is LatestPriceSnapshot => Boolean(price)
      )
    );
    const buySignal = buildMoverBuySignal({
      rarity: row.rarity,
      episodeName: row.episode_name,
      episodeCode: row.episode_code,
      episodeReleaseDate: row.episode_release_date,
      latestPrices: rawLatestPrices,
      priceHistory: rawPriceHistory,
      pullRateInfo,
    });
    const rarityWeight = resolveMoverRarityWeight(row.rarity, pullRateInfo?.pullRateWeight);
    const cheapnessWeight = getCheapnessWeight(currentPrice);
    const releaseAgeYears = getReleaseAgeYears(row.episode_release_date);
    const ageWeight = getAgeWeight(releaseAgeYears);
    const cardmarketPrice = getCurrentSourceValue(rawLatestPrices.cardmarket, "cardmarket");
    const tcgplayerPrice = getCurrentSourceValue(rawLatestPrices.tcgplayer, "tcgplayer");
    const olderValueScore = getOlderValueScore({
      releaseAgeYears,
      currentPrice: scope === "grading" ? cardmarketPrice ?? currentPrice : currentPrice,
      rarityWeight,
      cheapnessWeight:
        scope === "grading" && cardmarketPrice != null
          ? getCheapnessWeight(cardmarketPrice)
          : cheapnessWeight,
      kind: scope === "grading" ? "grading" : "graded",
      isGradeTen,
    });
    const gradingAssessment =
      cardmarketPrice != null
        ? buildGradingTargetAssessment({
            label: row.graded_label,
            marketPrice: currentPrice,
            rawPrice: cardmarketPrice,
            peerPrices: gradedPricesByCardId.get(row.card_id) ?? [],
            ageYears: releaseAgeYears,
            gemRatePct: pullRateInfo?.psaAvgGemPct ?? null,
          })
        : null;
    const grading = gradingAssessment
      ? buildGradingInsight(cardmarketPrice, rarityWeight, {
          assessment: gradingAssessment,
          ageWeight,
          olderValueScore,
          isGradeTen,
        })
      : null;
    const scores = buildMoverScores({
      kind: "graded",
      currentPrice,
      change7d,
      change30d,
      changeSinceTrackedPct: lifetime.changeSinceTracked?.changePct ?? null,
      changeFromLowPct: lifetime.changeFromLow?.changePct ?? null,
      gapToPeakPct: lifetime.gapToPeak?.changePct ?? null,
      historyPoints: series.length,
      lifetimeHistoryPoints: lifetime.lifetimeHistoryPoints,
      rarityWeight,
      cheapnessWeight,
      ageWeight,
    });
    const priceQuality: MoverPriceQuality =
      scope === "grading" && grading
        ? grading.priceStatus === "suspicious" ||
          scores.priceQuality.status === "suspicious"
          ? {
              status: "suspicious",
              reason: grading.priceReason ?? scores.priceQuality.reason,
            }
          : grading.priceStatus === "thin_history" ||
              scores.priceQuality.status === "thin_history"
            ? {
                status: "thin_history",
                reason: grading.priceReason ?? scores.priceQuality.reason,
              }
            : scores.priceQuality
        : scores.priceQuality;
    const moverScore = scope === "grading" ? grading?.score ?? 0 : scores.rankingScore;
    const rankingScore = scope === "grading" ? moverScore : scores.rankingScore;

    movers.push({
      cardId: row.card_id,
      name: row.name,
      imageUrl: row.image_url,
      cardNumber: row.card_number,
      rarity: row.rarity,
      normalizedRarity,
      episodeId: row.episode_id,
      episodeName: row.episode_name,
      episodeCode: row.episode_code,
      episodeReleaseDate: row.episode_release_date,
      releaseAgeYears,
      ownedCount: Number(row.owned_count ?? 0),
      source: "graded",
      sourceLabel: "Graded",
      currency: "EUR",
      currentPrice: round(currentPrice),
      cardmarketPrice: cardmarketPrice != null ? round(cardmarketPrice) : null,
      tcgplayerPrice: tcgplayerPrice != null ? round(tcgplayerPrice) : null,
      gradedLabel: row.graded_label,
      gradedPrices: gradedPricesByCardId.get(row.card_id) ?? [],
      grading,
      latestFetchedAt: new Date(currentAt).toISOString(),
      historyPoints: series.length,
      cardmarketHistoryPoints: 0,
      tcgplayerHistoryPoints: 0,
      lifetimeHistoryPoints: lifetime.lifetimeHistoryPoints,
      recentPriceSeries: buildRecentPriceSeries(series),
      trackedDays: lifetime.trackedDays,
      change7d: change7d?.change ?? null,
      change7dPct: change7d?.changePct ?? null,
      change7dCoveredDays: change7d?.coveredDays ?? null,
      change30d: change30d?.change ?? null,
      change30dPct: change30d?.changePct ?? null,
      change30dCoveredDays: change30d?.coveredDays ?? null,
      changeSinceTracked: lifetime.changeSinceTracked?.change ?? null,
      changeSinceTrackedPct: lifetime.changeSinceTracked?.changePct ?? null,
      changeSinceTrackedCoveredDays: lifetime.changeSinceTracked?.coveredDays ?? null,
      changeFromLow: lifetime.changeFromLow?.change ?? null,
      changeFromLowPct: lifetime.changeFromLow?.changePct ?? null,
      changeFromLowCoveredDays: lifetime.changeFromLow?.coveredDays ?? null,
      gapToPeak: lifetime.gapToPeak?.change ?? null,
      gapToPeakPct: lifetime.gapToPeak?.changePct ?? null,
      firstTrackedAt: lifetime.firstTrackedAt,
      firstPrice: lifetime.firstPrice,
      lowAt: lifetime.lowAt,
      lowPrice: lifetime.lowPrice,
      highAt: lifetime.highAt,
      highPrice: lifetime.highPrice,
      rarityWeight,
      pullRateOdds: pullRateInfo?.pullRateOdds ?? null,
      specificPullOdds: pullRateInfo?.specificPullOdds ?? null,
      pullRateWeight: pullRateInfo?.pullRateWeight ?? null,
      pullRateSource: pullRateInfo?.source ?? null,
      cheapnessWeight,
      ageWeight,
      olderValueScore,
      tcggoScore: buildTcggoMoverScore(row),
      movementScore: scores.movementScore,
      opportunityScore: scores.opportunityScore,
      rankingScore,
      priceQuality,
      buySignal,
      moverScore,
    });
  }

  const sortedMovers =
    scope === "grading"
      ? [...movers]
          .filter(
            (item) =>
              item.grading &&
              item.grading.expectedGain > 0 &&
              item.grading.score > 0 &&
              item.grading.priceStatus !== "suspicious" &&
              item.priceQuality.status !== "suspicious"
          )
          .sort((a, b) => {
            const scoreDiff = (b.grading?.score ?? 0) - (a.grading?.score ?? 0);
            if (scoreDiff !== 0) return scoreDiff;

            const multiplierDiff =
              (b.grading?.expectedMultiplier ?? 0) - (a.grading?.expectedMultiplier ?? 0);
            if (multiplierDiff !== 0) return multiplierDiff;

            const gapDiff = (b.grading?.expectedGain ?? 0) - (a.grading?.expectedGain ?? 0);
            if (gapDiff !== 0) return gapDiff;

            return `${a.name} ${a.gradedLabel ?? ""}`.localeCompare(
              `${b.name} ${b.gradedLabel ?? ""}`,
              undefined,
              { sensitivity: "base", numeric: true }
            );
          })
      : [...movers].sort((a, b) => {
          if (b.moverScore !== a.moverScore) {
            return b.moverScore - a.moverScore;
          }

          const changeDiff =
            (b.change7dPct ?? b.change30dPct ?? -Infinity) -
            (a.change7dPct ?? a.change30dPct ?? -Infinity);
          if (changeDiff !== 0) {
            return changeDiff;
          }

          if (b.currentPrice !== a.currentPrice) {
            return b.currentPrice - a.currentPrice;
          }

          return `${a.name} ${a.gradedLabel ?? ""}`.localeCompare(
            `${b.name} ${b.gradedLabel ?? ""}`,
            undefined,
            { sensitivity: "base", numeric: true }
          );
        });

  const topOpportunities =
    scope === "grading"
      ? sortedMovers.slice(0, 12)
      : sortedMovers
          .filter(
            (item) => item.moverScore > 0 && item.currentPrice <= 120 && item.rarityWeight >= 1.15
          )
          .slice(0, 12);
  const cheapestHighRarityMovers =
    scope === "grading"
      ? sortedMovers
          .filter((item) => {
            const rawPrice = item.grading?.rawPrice;
            return (
              rawPrice != null &&
              ((rawPrice <= 15 && item.rarityWeight >= 1.15) || item.olderValueScore >= 5)
            );
          })
          .slice(0, 16)
      : sortedMovers
          .filter(
            (item) => item.moverScore > 0 && item.currentPrice <= 80 && item.rarityWeight >= 1.15
          )
          .slice(0, 16);
  const discountedHighRarity =
    scope === "grading"
      ? [...sortedMovers]
          .filter((item) => (item.grading?.valueMultiplier ?? 0) >= 3 || item.olderValueScore >= 6)
          .sort((a, b) => {
            const olderValueDiff = b.olderValueScore - a.olderValueScore;
            if (olderValueDiff !== 0) return olderValueDiff;

            const multiplierDiff =
              (b.grading?.valueMultiplier ?? 0) - (a.grading?.valueMultiplier ?? 0);
            if (multiplierDiff !== 0) return multiplierDiff;

            return (b.grading?.valueGap ?? 0) - (a.grading?.valueGap ?? 0);
          })
      : [...sortedMovers]
          .filter((item) => {
            const hasDeepDiscount = (item.gapToPeakPct ?? 0) <= -25;
            const hasRecentWeakness =
              (item.change7dPct ?? 0) < 0 || (item.change30dPct ?? 0) < 0 || item.moverScore < 0;

            return item.rarityWeight >= 1.15 && hasDeepDiscount && hasRecentWeakness;
          })
          .sort((a, b) => {
            const peakGapDiff = (a.gapToPeakPct ?? 0) - (b.gapToPeakPct ?? 0);
            if (peakGapDiff !== 0) {
              return peakGapDiff;
            }

            if (a.currentPrice !== b.currentPrice) {
              return a.currentPrice - b.currentPrice;
            }

            return a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });
          });
  const suddenDropDeals: CollectionMoverItem[] = [];
  const strongest7d =
    [...sortedMovers]
      .filter((item) => (item.change7dPct ?? 0) > 0)
      .sort((a, b) => (b.change7dPct ?? 0) - (a.change7dPct ?? 0))[0] ?? null;
  const strongest30d =
    [...sortedMovers]
      .filter((item) => (item.change30dPct ?? 0) > 0)
      .sort((a, b) => (b.change30dPct ?? 0) - (a.change30dPct ?? 0))[0] ?? null;

  // The all-cards graded list can hold thousands of slab labels; cap the
  // serialized payload the same way the raw all-cards scope does.
  const displayedMovers =
    itemScope === "all" && sortedMovers.length > MAX_ALL_SCOPE_MOVERS
      ? sortedMovers.slice(0, MAX_ALL_SCOPE_MOVERS)
      : sortedMovers;

  return {
    result: {
      scope,
      preferredSource,
      trackedCards: currentRows.length,
      eligibleCards: sortedMovers.length,
      movers: displayedMovers,
      topOpportunities,
      cheapestHighRarityMovers,
      discountedHighRarity,
      suddenDropDeals,
      strongest7d,
      strongest30d,
    },
    historyRows: recentHistoryRows.length,
  };
}

export async function getMovers(
  preferredSource: PriceSource,
  scope: MoversScope = "collection",
  itemScope: MoversItemScope =
    scope === "collection" ? "collection" : "all",
  userId?: string | null,
  game: TradingCardGameFilter = POKEMON_GAME
): Promise<CollectionMoversData> {
  if (game === ALL_GAMES) {
    return combineCollectionMoversData(
      await Promise.all([
        getMovers(preferredSource, scope, itemScope, userId, POKEMON_GAME),
        getMovers(preferredSource, scope, itemScope, userId, ONE_PIECE_GAME),
      ])
    );
  }

  const timer = startPerformanceTimer(`movers.${scope}`, { preferredSource, scope, game });

  if (scope === "sealed") {
    timer.finish({ skipped: true });
    throw new Error("Use getSealedMovers for sealed movers.");
  }

  if (scope === "graded" || scope === "grading") {
    const { result, historyRows } = await buildGradedMoversData(
      preferredSource,
      scope,
      itemScope,
      userId,
      game
    );
    timer.finish({
      trackedCards: result.trackedCards,
      eligibleCards: result.eligibleCards,
      historyRows,
    });
    return result;
  }

  const historyCutoff = new Date(Date.now() - HISTORY_LOOKBACK_DAYS * DAY_MS).toISOString();
  const candidateCardsCte = getMoverCandidateCardsCte(scope, userId, game);

  const [
    candidateCards,
    recentHistoryRows,
    allTimeHistorySummaries,
    pullRateRows,
    gradedPriceRows,
  ] = await Promise.all([
    fetchMoverCandidateCards(scope, userId, game),
    db.$queryRawUnsafe<RecentHistoryRow[]>(
      `
      WITH candidate_cards AS (
        ${candidateCardsCte.sql}
      ),
      cardmarket_ranked AS (
        SELECT
          p.card_id,
          DATE(p.fetched_at) AS price_date,
          p.fetched_at,
          p.cm_en_lowest_nm,
          p.cm_de_lowest_nm,
          p.cm_fr_lowest_nm,
          p.cm_es_lowest_nm,
          p.cm_it_lowest_nm,
          p.cm_jp_lowest_nm,
          p.cm_en_avg_7d,
          p.cm_en_avg_30d,
          ROW_NUMBER() OVER (
            PARTITION BY p.card_id, DATE(p.fetched_at)
            ORDER BY p.fetched_at DESC, p.id DESC
          ) AS row_num
        FROM "Price" p
        INNER JOIN candidate_cards cc ON cc.card_id = p.card_id
        WHERE p.fetched_at >= ?
          AND p.cm_en_lowest_nm > 0
          AND p.cm_en_lowest_nm <> 9001
      ),
      tcgplayer_ranked AS (
        SELECT
          p.card_id,
          DATE(p.fetched_at) AS price_date,
          p.fetched_at,
          p.tcp_market,
          ROW_NUMBER() OVER (
            PARTITION BY p.card_id, DATE(p.fetched_at)
            ORDER BY p.fetched_at DESC, p.id DESC
          ) AS row_num
        FROM "Price" p
        INNER JOIN candidate_cards cc ON cc.card_id = p.card_id
        WHERE p.fetched_at >= ?
          AND p.tcp_market > 0
          AND p.tcp_market <> 9001
      ),
      daily_sources AS (
        SELECT card_id, price_date
        FROM cardmarket_ranked
        WHERE row_num = 1
        UNION
        SELECT card_id, price_date
        FROM tcgplayer_ranked
        WHERE row_num = 1
      )
      SELECT
        daily_sources.card_id,
        COALESCE(cardmarket_ranked.fetched_at, tcgplayer_ranked.fetched_at) AS fetched_at,
        cardmarket_ranked.cm_en_lowest_nm,
        cardmarket_ranked.cm_de_lowest_nm,
        cardmarket_ranked.cm_fr_lowest_nm,
        cardmarket_ranked.cm_es_lowest_nm,
        cardmarket_ranked.cm_it_lowest_nm,
        cardmarket_ranked.cm_jp_lowest_nm,
        tcgplayer_ranked.tcp_market,
        cardmarket_ranked.cm_en_avg_7d,
        cardmarket_ranked.cm_en_avg_30d
      FROM daily_sources
      LEFT JOIN cardmarket_ranked
        ON cardmarket_ranked.card_id = daily_sources.card_id
        AND cardmarket_ranked.price_date = daily_sources.price_date
        AND cardmarket_ranked.row_num = 1
      LEFT JOIN tcgplayer_ranked
        ON tcgplayer_ranked.card_id = daily_sources.card_id
        AND tcgplayer_ranked.price_date = daily_sources.price_date
        AND tcgplayer_ranked.row_num = 1
      ORDER BY daily_sources.card_id ASC, daily_sources.price_date ASC
    `,
      ...candidateCardsCte.params,
      historyCutoff,
      historyCutoff
    ),
    db.$queryRawUnsafe<AllTimeHistorySummaryRow[]>(
      `
      WITH candidate_cards AS (
        ${candidateCardsCte.sql}
      ),
      history_summary AS (
        SELECT
          p.card_id,
          COUNT(DISTINCT CASE
            WHEN p.cm_en_lowest_nm > 0 AND p.cm_en_lowest_nm <> 9001
              THEN DATE(p.fetched_at)
          END) AS cm_history_points,
          MIN(CASE
            WHEN p.cm_en_lowest_nm > 0 AND p.cm_en_lowest_nm <> 9001
              THEN p.cm_en_lowest_nm
          END) AS cm_low_value,
          MAX(CASE
            WHEN p.cm_en_lowest_nm > 0 AND p.cm_en_lowest_nm <> 9001
              THEN p.cm_en_lowest_nm
          END) AS cm_high_value,
          COUNT(DISTINCT CASE
            WHEN p.tcp_market > 0 AND p.tcp_market <> 9001
              THEN DATE(p.fetched_at)
          END) AS tcp_history_points,
          MIN(CASE
            WHEN p.tcp_market > 0 AND p.tcp_market <> 9001
              THEN p.tcp_market
          END) AS tcp_low_value,
          MAX(CASE
            WHEN p.tcp_market > 0 AND p.tcp_market <> 9001
              THEN p.tcp_market
          END) AS tcp_high_value
        FROM "Price" p
        INNER JOIN candidate_cards cc ON cc.card_id = p.card_id
        WHERE (p.cm_en_lowest_nm > 0 AND p.cm_en_lowest_nm <> 9001)
           OR (p.tcp_market > 0 AND p.tcp_market <> 9001)
        GROUP BY p.card_id
      )
      SELECT
        cc.card_id,
        (
          SELECT p.fetched_at
          FROM "Price" p
          WHERE p.card_id = cc.card_id
            AND p.cm_en_lowest_nm > 0
            AND p.cm_en_lowest_nm <> 9001
          ORDER BY p.fetched_at ASC, p.id ASC
          LIMIT 1
        ) AS cm_first_fetched_at,
        (
          SELECT p.cm_en_lowest_nm
          FROM "Price" p
          WHERE p.card_id = cc.card_id
            AND p.cm_en_lowest_nm > 0
            AND p.cm_en_lowest_nm <> 9001
          ORDER BY p.fetched_at ASC, p.id ASC
          LIMIT 1
        ) AS cm_first_value,
        (
          SELECT p.fetched_at
          FROM "Price" p
          WHERE p.card_id = cc.card_id
            AND p.cm_en_lowest_nm > 0
            AND p.cm_en_lowest_nm <> 9001
          ORDER BY
            p.cm_en_lowest_nm ASC,
            p.fetched_at ASC,
            p.id ASC
          LIMIT 1
        ) AS cm_low_fetched_at,
        history_summary.cm_low_value,
        (
          SELECT p.fetched_at
          FROM "Price" p
          WHERE p.card_id = cc.card_id
            AND p.cm_en_lowest_nm > 0
            AND p.cm_en_lowest_nm <> 9001
          ORDER BY
            p.cm_en_lowest_nm DESC,
            p.fetched_at ASC,
            p.id ASC
          LIMIT 1
        ) AS cm_high_fetched_at,
        history_summary.cm_high_value,
        history_summary.cm_history_points,
        (
          SELECT p.fetched_at
          FROM "Price" p
          WHERE p.card_id = cc.card_id
            AND p.tcp_market > 0
            AND p.tcp_market <> 9001
          ORDER BY p.fetched_at ASC, p.id ASC
          LIMIT 1
        ) AS tcp_first_fetched_at,
        (
          SELECT p.tcp_market
          FROM "Price" p
          WHERE p.card_id = cc.card_id
            AND p.tcp_market > 0
            AND p.tcp_market <> 9001
          ORDER BY p.fetched_at ASC, p.id ASC
          LIMIT 1
        ) AS tcp_first_value,
        (
          SELECT p.fetched_at
          FROM "Price" p
          WHERE p.card_id = cc.card_id
            AND p.tcp_market > 0
            AND p.tcp_market <> 9001
          ORDER BY p.tcp_market ASC, p.fetched_at ASC, p.id ASC
          LIMIT 1
        ) AS tcp_low_fetched_at,
        history_summary.tcp_low_value,
        (
          SELECT p.fetched_at
          FROM "Price" p
          WHERE p.card_id = cc.card_id
            AND p.tcp_market > 0
            AND p.tcp_market <> 9001
          ORDER BY p.tcp_market DESC, p.fetched_at ASC, p.id ASC
          LIMIT 1
        ) AS tcp_high_fetched_at,
        history_summary.tcp_high_value,
        history_summary.tcp_history_points
      FROM candidate_cards cc
      LEFT JOIN history_summary ON history_summary.card_id = cc.card_id
      ORDER BY cc.card_id ASC
    `,
      ...candidateCardsCte.params
    ),
    db.$queryRawUnsafe<PullRateRarityRow[]>(
      `
      WITH candidate_cards AS (
        ${candidateCardsCte.sql}
      )
      SELECT DISTINCT
        spr.source,
        spr.set_code,
        spr.normalized_rarity,
        spr.rarity_name,
        spr.pull_rate_odds,
        spr.pull_rate_denominator,
        spr.specific_pull_denominator,
        spr.psa_avg_gem_pct
      FROM candidate_cards cc
      INNER JOIN "Card" c ON c.id = cc.card_id
      INNER JOIN "Episode" e ON e.id = c.episode_id
      INNER JOIN "SetPullRateRarity" spr
        ON spr.source IN (?, ?)
        AND spr.set_code = UPPER(e.code)
      WHERE e.code IS NOT NULL
      ORDER BY
        spr.set_code ASC,
        spr.normalized_rarity ASC,
        CASE spr.source WHEN ? THEN 0 WHEN ? THEN 1 ELSE 2 END ASC
    `,
      ...candidateCardsCte.params,
      PREFERRED_PULL_RATE_SOURCES[0],
      PREFERRED_PULL_RATE_SOURCES[1],
      PREFERRED_PULL_RATE_SOURCES[0],
      PREFERRED_PULL_RATE_SOURCES[1]
    ),
    db.$queryRawUnsafe<GradedPriceRow[]>(
      `
      WITH candidate_cards AS (
        ${candidateCardsCte.sql}
      )
      SELECT
        gp.card_id,
        gp.label,
        gp.price
      FROM "CardGradedPrice" gp
      INNER JOIN candidate_cards cc ON cc.card_id = gp.card_id
      ORDER BY gp.card_id ASC, gp.price DESC, gp.label ASC
    `,
      ...candidateCardsCte.params
    ),
  ]);

  const historyRowsByCardId = new Map<string, CardPriceHistorySnapshot[]>();
  for (const row of recentHistoryRows) {
    const existing = historyRowsByCardId.get(row.card_id);
    if (existing) {
      existing.push(row);
    } else {
      historyRowsByCardId.set(row.card_id, [row]);
    }
  }

  const allTimeSummariesByCardId = new Map<
    string,
    Record<RawMoverSource, AllTimeSourceSummary>
  >();
  for (const row of allTimeHistorySummaries) {
    allTimeSummariesByCardId.set(row.card_id, {
      cardmarket: {
        firstFetchedAt: row.cm_first_fetched_at,
        firstValue: row.cm_first_value,
        lowFetchedAt: row.cm_low_fetched_at,
        lowValue: row.cm_low_value,
        highFetchedAt: row.cm_high_fetched_at,
        highValue: row.cm_high_value,
        historyPoints: Number(row.cm_history_points ?? 0),
      },
      tcgplayer: {
        firstFetchedAt: row.tcp_first_fetched_at,
        firstValue: row.tcp_first_value,
        lowFetchedAt: row.tcp_low_fetched_at,
        lowValue: row.tcp_low_value,
        highFetchedAt: row.tcp_high_fetched_at,
        highValue: row.tcp_high_value,
        historyPoints: Number(row.tcp_history_points ?? 0),
      },
    });
  }

  const pullRateBySetAndRarity = new Map<string, PullRateInfo>();
  for (const row of pullRateRows) {
    const key = `${row.set_code.toUpperCase()}::${row.normalized_rarity}`;
    const existing = pullRateBySetAndRarity.get(key);
    if (
      existing &&
      getPullRateSourcePriority(existing.source) <= getPullRateSourcePriority(row.source)
    ) {
      continue;
    }
    pullRateBySetAndRarity.set(
      key,
      buildPullRateInfoFromRarity({
        source: row.source,
        setCode: row.set_code,
        normalizedRarity: row.normalized_rarity,
        rarityName: row.rarity_name,
        pullRateOdds: row.pull_rate_odds,
        pullRateDenominator: row.pull_rate_denominator,
        specificPullDenominator: row.specific_pull_denominator,
        psaAvgGemPct: row.psa_avg_gem_pct,
      })
    );
  }

  const gradedPricesByCardId = new Map<string, MoverGradedPrice[]>();
  for (const row of gradedPriceRows) {
    const existing = gradedPricesByCardId.get(row.card_id) ?? [];
    existing.push({
      label: row.label,
      price: row.price,
    });
    gradedPricesByCardId.set(row.card_id, existing);
  }

  const movers: CollectionMoverItem[] = [];

  for (const card of candidateCards) {
    const latestCardmarketPrice = card.latestPrices.cardmarket;
    const latestTcgplayerPrice = card.latestPrices.tcgplayer;
    const historyPoints = buildCardPriceHistory(historyRowsByCardId.get(card.id) ?? []);
    const allTimeSummary =
      allTimeSummariesByCardId.get(card.id) ??
      ({
        cardmarket: {
          firstFetchedAt: null,
          firstValue: null,
          lowFetchedAt: null,
          lowValue: null,
          highFetchedAt: null,
          highValue: null,
          historyPoints: 0,
        },
        tcgplayer: {
          firstFetchedAt: null,
          firstValue: null,
          lowFetchedAt: null,
          lowValue: null,
          highFetchedAt: null,
          highValue: null,
          historyPoints: 0,
        },
      } satisfies Record<RawMoverSource, AllTimeSourceSummary>);
    const resolvedSource = resolveBestSource(
      card.latestPrices,
      historyPoints,
      preferredSource,
      allTimeSummary
    );

    if (!resolvedSource) {
      continue;
    }

    const collectionPriceOverride = card.collectionPriceOverride;
    const currentPrice = collectionPriceOverride?.price ?? resolvedSource.currentPrice;
    const source = collectionPriceOverride ? "graded" : resolvedSource.key;
    const sourceLabel = collectionPriceOverride ? "Graded" : resolvedSource.label;
    const currency = collectionPriceOverride ? "EUR" : resolvedSource.currency;

    if (currentPrice < MIN_RAW_MOVER_PRICE) {
      continue;
    }

    const normalizedRarity = normalizeRarityLabel(card.rarity);
    const pullRateInfo =
      card.episode.code && normalizedRarity
        ? pullRateBySetAndRarity.get(`${card.episode.code.toUpperCase()}::${normalizedRarity}`) ??
          null
        : null;
    const buySignal = buildMoverBuySignal({
      rarity: card.rarity,
      episodeName: card.episode.name,
      episodeCode: card.episode.code,
      episodeReleaseDate: card.episode.release_date,
      latestPrices: card.latestPrices,
      priceHistory: historyPoints,
      pullRateInfo,
    });
    const rarityWeight = resolveRawMoverRarityWeight(card.rarity, pullRateInfo?.pullRateWeight);
    const cheapnessWeight = getCheapnessWeight(currentPrice);
    const releaseAgeYears = getReleaseAgeYears(card.episode.release_date);
    const ageWeight = getAgeWeight(releaseAgeYears);
    const olderValueScore = getOlderValueScore({
      releaseAgeYears,
      currentPrice,
      rarityWeight,
      cheapnessWeight,
      kind: "raw",
    });

    if (
      !hasMeaningfulMove(resolvedSource.change7d, resolvedSource.change30d) &&
      olderValueScore < 4
    ) {
      continue;
    }

    const cardmarketPrice = getCurrentSourceValue(latestCardmarketPrice, "cardmarket");
    const tcgplayerPrice = getCurrentSourceValue(latestTcgplayerPrice, "tcgplayer");
    const comparisonPrice =
      resolvedSource.key === "cardmarket" ? tcgplayerPrice : cardmarketPrice;
    const scores = buildMoverScores({
      kind: "raw",
      currentPrice,
      change7d: resolvedSource.change7d,
      change30d: resolvedSource.change30d,
      changeSinceTrackedPct: resolvedSource.lifetime.changeSinceTracked?.changePct ?? null,
      changeFromLowPct: resolvedSource.lifetime.changeFromLow?.changePct ?? null,
      gapToPeakPct: resolvedSource.lifetime.gapToPeak?.changePct ?? null,
      historyPoints: resolvedSource.historyPoints,
      lifetimeHistoryPoints: resolvedSource.lifetime.lifetimeHistoryPoints,
      rarityWeight,
      cheapnessWeight,
      ageWeight,
      comparisonPrice,
    });
    const moverScore = scores.rankingScore;

    movers.push({
      cardId: card.id,
      name: card.name,
      imageUrl: card.image_url,
      cardNumber: card.card_number,
      rarity: card.rarity,
      normalizedRarity,
      episodeId: card.episode.id,
      episodeName: card.episode.name,
      episodeCode: card.episode.code,
      episodeReleaseDate: card.episode.release_date,
      releaseAgeYears,
      ownedCount: card.ownedCount,
      source,
      sourceLabel,
      currency,
      currentPrice: round(currentPrice),
      cardmarketPrice: cardmarketPrice != null ? round(cardmarketPrice) : null,
      tcgplayerPrice: tcgplayerPrice != null ? round(tcgplayerPrice) : null,
      gradedLabel: collectionPriceOverride?.label ?? null,
      gradedPrices: gradedPricesByCardId.get(card.id) ?? [],
      grading: null,
      latestFetchedAt: (resolvedSource.key === "tcgplayer"
        ? latestTcgplayerPrice
        : latestCardmarketPrice)
        ? new Date(
            (resolvedSource.key === "tcgplayer"
              ? latestTcgplayerPrice
              : latestCardmarketPrice
            )!.fetched_at
          ).toISOString()
        : new Date().toISOString(),
      historyPoints: resolvedSource.historyPoints,
      cardmarketHistoryPoints: allTimeSummary.cardmarket.historyPoints,
      tcgplayerHistoryPoints: allTimeSummary.tcgplayer.historyPoints,
      lifetimeHistoryPoints: resolvedSource.lifetime.lifetimeHistoryPoints,
      recentPriceSeries: buildRecentPriceSeries(resolvedSource.series),
      trackedDays: resolvedSource.lifetime.trackedDays,
      change7d: resolvedSource.change7d?.change ?? null,
      change7dPct: resolvedSource.change7d?.changePct ?? null,
      change7dCoveredDays: resolvedSource.change7d?.coveredDays ?? null,
      change30d: resolvedSource.change30d?.change ?? null,
      change30dPct: resolvedSource.change30d?.changePct ?? null,
      change30dCoveredDays: resolvedSource.change30d?.coveredDays ?? null,
      changeSinceTracked: resolvedSource.lifetime.changeSinceTracked?.change ?? null,
      changeSinceTrackedPct: resolvedSource.lifetime.changeSinceTracked?.changePct ?? null,
      changeSinceTrackedCoveredDays: resolvedSource.lifetime.changeSinceTracked?.coveredDays ?? null,
      changeFromLow: resolvedSource.lifetime.changeFromLow?.change ?? null,
      changeFromLowPct: resolvedSource.lifetime.changeFromLow?.changePct ?? null,
      changeFromLowCoveredDays: resolvedSource.lifetime.changeFromLow?.coveredDays ?? null,
      gapToPeak: resolvedSource.lifetime.gapToPeak?.change ?? null,
      gapToPeakPct: resolvedSource.lifetime.gapToPeak?.changePct ?? null,
      firstTrackedAt: resolvedSource.lifetime.firstTrackedAt,
      firstPrice: resolvedSource.lifetime.firstPrice,
      lowAt: resolvedSource.lifetime.lowAt,
      lowPrice: resolvedSource.lifetime.lowPrice,
      highAt: resolvedSource.lifetime.highAt,
      highPrice: resolvedSource.lifetime.highPrice,
      rarityWeight,
      pullRateOdds: pullRateInfo?.pullRateOdds ?? null,
      specificPullOdds: pullRateInfo?.specificPullOdds ?? null,
      pullRateWeight: pullRateInfo?.pullRateWeight ?? null,
      pullRateSource: pullRateInfo?.source ?? null,
      cheapnessWeight,
      ageWeight,
      olderValueScore,
      tcggoScore: card.tcggoScore,
      movementScore: scores.movementScore,
      opportunityScore: scores.opportunityScore,
      rankingScore: scores.rankingScore,
      priceQuality: scores.priceQuality,
      buySignal,
      moverScore,
    });
  }

  const sortedMovers = [...movers].sort((a, b) => {
    if (b.moverScore !== a.moverScore) {
      return b.moverScore - a.moverScore;
    }

    const changeDiff = (b.change7dPct ?? b.change30dPct ?? -Infinity) -
      (a.change7dPct ?? a.change30dPct ?? -Infinity);
    if (changeDiff !== 0) {
      return changeDiff;
    }

    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  const topOpportunities = sortedMovers
    .filter((item) => item.moverScore > 0 && item.currentPrice <= 60 && item.rarityWeight >= 1.15)
    .slice(0, 12);
  const cheapestHighRarityMovers = sortedMovers
    .filter((item) => item.moverScore > 0 && item.currentPrice <= 25 && item.rarityWeight >= 1.15)
    .slice(0, 16);
  const discountedHighRarity = [...sortedMovers]
    .filter((item) => {
      const hasDeepDiscount = (item.gapToPeakPct ?? 0) <= -25;
      const hasRecentWeakness =
        (item.change7dPct ?? 0) < 0 || (item.change30dPct ?? 0) < 0 || item.moverScore < 0;

      return (
        item.rarityWeight >= 1.15 &&
        item.currentPrice <= 50 &&
        hasDeepDiscount &&
        hasRecentWeakness
      );
    })
    .sort((a, b) => {
      const peakGapDiff = (a.gapToPeakPct ?? 0) - (b.gapToPeakPct ?? 0);
      if (peakGapDiff !== 0) {
        return peakGapDiff;
      }

      if (a.currentPrice !== b.currentPrice) {
        return a.currentPrice - b.currentPrice;
      }

      if (a.moverScore !== b.moverScore) {
        return a.moverScore - b.moverScore;
      }

      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
  const suddenDropDeals = getSuddenDropDeals(sortedMovers);
  const strongest7d =
    [...sortedMovers]
      .filter((item) => (item.change7dPct ?? 0) > 0)
      .sort((a, b) => (b.change7dPct ?? 0) - (a.change7dPct ?? 0))[0] ?? null;
  const strongest30d =
    [...sortedMovers]
      .filter((item) => (item.change30dPct ?? 0) > 0)
      .sort((a, b) => (b.change30dPct ?? 0) - (a.change30dPct ?? 0))[0] ?? null;

  const displayedMovers =
    scope === "all" && sortedMovers.length > MAX_ALL_SCOPE_MOVERS
      ? sortedMovers.slice(0, MAX_ALL_SCOPE_MOVERS)
      : sortedMovers;

  const result = {
    scope,
    preferredSource,
    trackedCards: candidateCards.length,
    eligibleCards: sortedMovers.length,
    movers: displayedMovers,
    topOpportunities,
    cheapestHighRarityMovers,
    discountedHighRarity,
    suddenDropDeals,
    strongest7d,
    strongest30d,
  };

  timer.finish({
    trackedCards: result.trackedCards,
    eligibleCards: result.eligibleCards,
    historyRows: recentHistoryRows.length,
  });

  return result;
}

export async function getCollectionMovers(
  preferredSource: PriceSource,
  userId?: string | null,
  game: TradingCardGameFilter = POKEMON_GAME
): Promise<CollectionMoversData> {
  return getMovers(preferredSource, "collection", "collection", userId, game);
}
