import type {
  CardEbaySoldGradedPriceHistorySeries,
  CardGradedPriceHistorySeries,
  CardPriceHistoryPoint,
} from "@/lib/price-history";
import { KNOWN_RARITY_ORDER, normalizeRarityLabel } from "@/lib/rarity";

export type BuySignalLabel = "strong_sell" | "sell" | "hold" | "buy" | "strong_buy";
export type BuySignalConfidence = "low" | "medium" | "high";
export type BuySignalMarketMode = "raw" | "graded";
export type BuySignalContext = "owned" | "market";
export type BuySignalTone = "positive" | "negative" | "neutral" | "warning";

export interface BuySignalEvidenceItem {
  label: string;
  value: string;
  tone: BuySignalTone;
}

export interface BuySignalResult {
  score: number;
  marker_percent: number;
  label: BuySignalLabel;
  label_text: string;
  confidence: BuySignalConfidence;
  market_mode: BuySignalMarketMode;
  context: BuySignalContext;
  source_label: string;
  current_value: number | null;
  currency: "EUR" | "USD";
  reasons: string[];
  warnings: string[];
  evidence: BuySignalEvidenceItem[];
  metrics: {
    history_points: number;
    source_count: number;
    data_age_days: number | null;
    change_7d_pct: number | null;
    change_30d_pct: number | null;
    vs_30d_avg_pct: number | null;
    ebay_sold_gap_pct: number | null;
    cost_basis_pnl_pct: number | null;
    ebay_sample_size: number | null;
    rarity_weight: number;
    release_age_years: number | null;
    long_term_score: number;
    promo_scarcity_score: number;
    history_range_change_pct: number | null;
    history_range_covered_days: number | null;
    raw_active_listing_outlier: boolean;
  };
}

interface BuySignalPriceSnapshot {
  cm_en_lowest_nm: number | null;
  cm_de_lowest_nm: number | null;
  cm_fr_lowest_nm: number | null;
  cm_es_lowest_nm: number | null;
  cm_it_lowest_nm: number | null;
  cm_jp_lowest_nm?: number | null;
  tcp_market: number | null;
  tcp_mid: number | null;
  tcp_low: number | null;
  cm_en_avg_7d: number | null;
  cm_en_avg_30d: number | null;
}

interface BuySignalCollectionItem {
  purchase_price: number | null;
  cost_basis_value: number | null;
  grading_company: string | null;
  grading_grade: string | null;
}

interface BuySignalGradedPrice {
  label: string;
  price: number;
}

interface BuySignalEbaySoldGradedPrice {
  label: string;
  company: string;
  grade: string;
  median_price: number;
  currency: string;
  sample_size: number | null;
  fetched_at?: string | null;
  median_price_eur?: number | null;
}

interface BuySignalPullRateInfo {
  rarity_name: string;
  pull_rate_odds: string | null;
  specific_pull_odds: string | null;
  pull_rate_weight: number | null;
  psa_avg_gem_pct: number | null;
}

export interface BuildBuySignalInput {
  rarity?: string | null;
  episode_name?: string | null;
  episode_code?: string | null;
  episode_release_date?: string | null;
  price: BuySignalPriceSnapshot | null;
  price_fetched_at: string | null;
  price_source_checked_at?: string | null;
  ebay_sold_graded_synced_at?: string | null;
  price_history: CardPriceHistoryPoint[];
  graded_prices?: BuySignalGradedPrice[];
  ebay_sold_graded_prices?: BuySignalEbaySoldGradedPrice[];
  graded_price_history?: CardGradedPriceHistorySeries[];
  ebay_sold_graded_price_history?: CardEbaySoldGradedPriceHistorySeries[];
  pull_rate_info?: BuySignalPullRateInfo | null;
  collection_item?: BuySignalCollectionItem | null;
  now?: Date | string;
}

interface SignalValuePoint {
  date: string;
  value: number | null;
}

interface WindowChange {
  change: number;
  change_pct: number | null;
  covered_days: number;
}

interface MarketSelection {
  market_mode: BuySignalMarketMode;
  source_label: string;
  current_value: number | null;
  currency: "EUR" | "USD";
  history_points: SignalValuePoint[];
  average_7d: number | null;
  average_30d: number | null;
  comparison_value: number | null;
  comparison_label: string | null;
  ebay_sample_size: number | null;
  ebay_fetched_at: string | null;
  data_fetched_at: string | null;
  raw_has_secondary_source: boolean;
  matched_graded: boolean;
  raw_active_listing_outlier: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const LABEL_TEXT: Record<BuySignalLabel, string> = {
  strong_sell: "STRONG SELL",
  sell: "SELL",
  hold: "HOLD",
  buy: "BUY",
  strong_buy: "STRONG BUY",
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round(value: number, decimals = 0): number {
  return Number(value.toFixed(decimals));
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseTimestamp(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function getRawCardMarketValue(price: BuySignalPriceSnapshot | null): number | null {
  if (!price) return null;
  return price.cm_en_lowest_nm ?? null;
}

function normalizeGradedLookupValue(value: string | null | undefined): string {
  return value?.toUpperCase().replace(/[^A-Z0-9.]+/g, " ").replace(/\s+/g, " ").trim() ?? "";
}

function normalizeGradedGradeToken(value: string | null | undefined): string {
  const normalized = normalizeGradedLookupValue(value);
  if (!normalized) return "";

  const numeric = Number(normalized.replace(/[^\d.]/g, ""));
  if (/^\d+(?:\.\d+)?$/.test(normalized) && Number.isFinite(numeric)) {
    return String(numeric);
  }

  return normalized;
}

function getSavedGrading(collectionItem: BuySignalCollectionItem | null | undefined) {
  const company = normalizeGradedLookupValue(collectionItem?.grading_company);
  const grade = normalizeGradedGradeToken(collectionItem?.grading_grade);
  return company && grade ? { company, grade } : null;
}

function gradedLabelMatchesSavedGrade(
  label: string,
  collectionItem: BuySignalCollectionItem | null | undefined
): boolean {
  const saved = getSavedGrading(collectionItem);
  if (!saved) return false;

  const normalizedLabel = normalizeGradedLookupValue(label);
  const compactLabel = normalizedLabel.replace(/\s+/g, "");
  const candidates = new Set([
    normalizeGradedLookupValue(`${saved.company} ${saved.grade}`),
    normalizeGradedLookupValue(`${saved.company} ${Number(saved.grade)}`),
  ]);

  if (/^\d+$/.test(saved.grade)) {
    candidates.add(normalizeGradedLookupValue(`${saved.company} ${saved.grade}.0`));
  }

  return [...candidates].some((candidate) => {
    const compactCandidate = candidate.replace(/\s+/g, "");
    return (
      normalizedLabel === candidate ||
      compactLabel === compactCandidate ||
      normalizedLabel.startsWith(`${candidate} `) ||
      normalizedLabel.startsWith(`${candidate} -`) ||
      normalizedLabel.startsWith(`${candidate} /`) ||
      normalizedLabel.startsWith(`${candidate} (`)
    );
  });
}

function findMatchingEbaySoldPrice(
  prices: BuySignalEbaySoldGradedPrice[],
  collectionItem: BuySignalCollectionItem | null | undefined
): BuySignalEbaySoldGradedPrice | null {
  const saved = getSavedGrading(collectionItem);
  if (!saved) return null;

  return (
    prices.find((price) => {
      const structuredMatch =
        normalizeGradedLookupValue(price.company) === saved.company &&
        normalizeGradedGradeToken(price.grade) === saved.grade;
      return structuredMatch || gradedLabelMatchesSavedGrade(price.label, collectionItem);
    }) ?? null
  );
}

function findMatchingCardMarketGradedPrice(
  prices: BuySignalGradedPrice[],
  collectionItem: BuySignalCollectionItem | null | undefined
): BuySignalGradedPrice | null {
  return prices.find((price) => gradedLabelMatchesSavedGrade(price.label, collectionItem)) ?? null;
}

function findHistorySeries(
  series: Array<{ label: string; points: SignalValuePoint[] }>,
  label: string | null | undefined
): SignalValuePoint[] {
  if (!label) return [];
  const normalized = normalizeGradedLookupValue(label);
  return (
    series.find((candidate) => normalizeGradedLookupValue(candidate.label) === normalized)?.points ??
    []
  );
}

function getEbaySoldValueEur(price: BuySignalEbaySoldGradedPrice | null): number | null {
  if (!price) return null;
  if (isFiniteNumber(price.median_price_eur)) return price.median_price_eur;
  return price.currency.toUpperCase() === "EUR" ? price.median_price : null;
}

function buildRawSelection(input: BuildBuySignalInput): MarketSelection {
  const cardMarketValue = getRawCardMarketValue(input.price);
  const tcgPlayerValue = input.price?.tcp_market ?? null;
  const historyPoints = input.price_history.map((point) => ({
    date: point.date,
    value: point.cm_market_en,
  }));

  return {
    market_mode: "raw",
    source_label: "CardMarket EN NM",
    current_value: cardMarketValue,
    currency: "EUR",
    history_points: historyPoints,
    average_7d: input.price?.cm_en_avg_7d ?? null,
    average_30d: input.price?.cm_en_avg_30d ?? null,
    comparison_value: tcgPlayerValue,
    comparison_label: tcgPlayerValue != null ? "TCGPlayer" : null,
    ebay_sample_size: null,
    ebay_fetched_at: null,
    data_fetched_at: input.price_fetched_at ?? input.price_source_checked_at ?? null,
    raw_has_secondary_source: cardMarketValue != null && tcgPlayerValue != null,
    matched_graded: false,
    raw_active_listing_outlier: false,
  };
}

function buildMarketSelection(input: BuildBuySignalInput): MarketSelection {
  const collectionItem = input.collection_item ?? null;
  const matchedEbay = findMatchingEbaySoldPrice(input.ebay_sold_graded_prices ?? [], collectionItem);
  const matchedCardMarketGraded = findMatchingCardMarketGradedPrice(
    input.graded_prices ?? [],
    collectionItem
  );
  const ebayValue = getEbaySoldValueEur(matchedEbay);
  const cardMarketGradedValue = matchedCardMarketGraded?.price ?? null;

  if (getSavedGrading(collectionItem) && (ebayValue != null || cardMarketGradedValue != null)) {
    const useEbay = ebayValue != null;
    const primaryLabel = useEbay ? matchedEbay?.label : matchedCardMarketGraded?.label;
    const rawHistory = useEbay
      ? findHistorySeries(input.ebay_sold_graded_price_history ?? [], primaryLabel)
      : findHistorySeries(input.graded_price_history ?? [], primaryLabel);

    return {
      market_mode: "graded",
      source_label: useEbay ? "eBay sold graded" : "CardMarket graded",
      current_value: useEbay ? ebayValue : cardMarketGradedValue,
      currency: "EUR",
      history_points: rawHistory,
      average_7d: getRecentAverage(rawHistory, 7),
      average_30d: getRecentAverage(rawHistory, 30),
      comparison_value: useEbay ? cardMarketGradedValue : ebayValue,
      comparison_label:
        useEbay && cardMarketGradedValue != null
          ? "CardMarket graded"
          : !useEbay && ebayValue != null
            ? "eBay sold"
            : null,
      ebay_sample_size: matchedEbay?.sample_size ?? null,
      ebay_fetched_at: matchedEbay?.fetched_at ?? input.ebay_sold_graded_synced_at ?? null,
      data_fetched_at: useEbay
        ? matchedEbay?.fetched_at ?? input.ebay_sold_graded_synced_at ?? null
        : input.price_fetched_at ?? input.price_source_checked_at ?? null,
      raw_has_secondary_source: false,
      matched_graded: true,
      raw_active_listing_outlier: false,
    };
  }

  return buildRawSelection(input);
}

function getValidPoints(points: SignalValuePoint[]): Array<{ timestamp: number; value: number }> {
  return points
    .map((point) => ({
      timestamp: parseTimestamp(/^\d{4}-\d{2}-\d{2}$/.test(point.date) ? `${point.date}T12:00:00.000Z` : point.date),
      value: point.value,
    }))
    .filter(
      (point): point is { timestamp: number; value: number } =>
        point.timestamp != null && isFiniteNumber(point.value)
    )
    .sort((a, b) => a.timestamp - b.timestamp);
}

function getWindowChange(points: SignalValuePoint[], days: number): WindowChange | null {
  const valid = getValidPoints(points);
  if (valid.length < 2) return null;

  const latest = valid[valid.length - 1];
  const targetTimestamp = latest.timestamp - days * DAY_MS;
  const baseline =
    [...valid].reverse().find((point) => point.timestamp <= targetTimestamp) ?? valid[0];
  const coveredDays = Math.max(1, Math.round((latest.timestamp - baseline.timestamp) / DAY_MS));
  const change = latest.value - baseline.value;
  const changePct = baseline.value > 0 ? (change / baseline.value) * 100 : null;

  return {
    change: round(change, 2),
    change_pct: changePct == null ? null : round(changePct, 1),
    covered_days: coveredDays,
  };
}

function getHistoryRangeChange(points: SignalValuePoint[]): WindowChange | null {
  const valid = getValidPoints(points);
  if (valid.length < 2) return null;

  const baseline = valid[0];
  const latest = valid[valid.length - 1];
  const coveredDays = Math.max(1, Math.round((latest.timestamp - baseline.timestamp) / DAY_MS));
  const change = latest.value - baseline.value;
  const changePct = baseline.value > 0 ? (change / baseline.value) * 100 : null;

  return {
    change: round(change, 2),
    change_pct: changePct == null ? null : round(changePct, 1),
    covered_days: coveredDays,
  };
}

function getRecentAverage(points: SignalValuePoint[], days: number): number | null {
  const valid = getValidPoints(points);
  if (valid.length === 0) return null;

  const latestTimestamp = valid[valid.length - 1].timestamp;
  const cutoff = latestTimestamp - days * DAY_MS;
  const values = valid.filter((point) => point.timestamp >= cutoff).map((point) => point.value);
  if (values.length === 0) return null;

  return round(values.reduce((total, value) => total + value, 0) / values.length, 2);
}

function getDataAgeDays(fetchedAt: string | null, now: Date): number | null {
  const timestamp = parseTimestamp(fetchedAt);
  if (timestamp == null) return null;
  return Math.max(0, Math.floor((now.getTime() - timestamp) / DAY_MS));
}

function getRarityWeight(rarity: string | null | undefined): number {
  const normalized = normalizeRarityLabel(rarity);
  if (!normalized) return 1;

  const index = KNOWN_RARITY_ORDER.indexOf(normalized as (typeof KNOWN_RARITY_ORDER)[number]);
  if (index === -1) return 1.08;

  return round(0.7 + (index / Math.max(KNOWN_RARITY_ORDER.length - 1, 1)) * 1.45, 2);
}

function getReleaseAgeYears(releaseDate: string | null | undefined, now: Date): number | null {
  const releaseTimestamp = parseTimestamp(releaseDate);
  if (releaseTimestamp == null) return null;
  return round(Math.max(0, (now.getTime() - releaseTimestamp) / (DAY_MS * 365.25)), 1);
}

function isPromoLikeCard(input: {
  rarity?: string | null;
  episodeName?: string | null;
  episodeCode?: string | null;
}): boolean {
  const normalizedRarity = normalizeRarityLabel(input.rarity);
  if (normalizedRarity === "Promo") return true;

  const haystack = [input.episodeName, input.episodeCode]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /\b(?:promo|promos|black\s+star|pr-[a-z0-9]+|svp|swshp|sm-p|s-p)\b/i.test(haystack);
}

function getPromoScarcityScore(input: {
  isPromo: boolean;
  releaseAgeYears: number | null;
}): number {
  if (!input.isPromo) return 0;

  const age = input.releaseAgeYears;
  if (age == null) return 12;
  if (age < 1) return 7;
  if (age < 2) return 9;
  if (age < 4) return 12;
  if (age < 7) return 16;
  if (age < 12) return 20;
  return 24;
}

function getPromoScarcityLabel(score: number): string {
  if (score >= 20) return "Hard promo";
  if (score >= 14) return "Promo hold";
  if (score > 0) return "New promo";
  return "None";
}

function getLongTermScore(input: {
  rarityWeight: number;
  releaseAgeYears: number | null;
  pullRateInfo: BuySignalPullRateInfo | null | undefined;
  promoScarcityScore: number;
}): number {
  const rarityComponent = clamp((input.rarityWeight - 1) / 0.9, 0, 1) * 42;
  const ageComponent =
    input.releaseAgeYears == null
      ? 0
      : clamp((input.releaseAgeYears - 1.5) / 8.5, 0, 1) * 42;
  const pullOddsComponent =
    input.pullRateInfo?.specific_pull_odds || input.pullRateInfo?.pull_rate_odds ? 10 : 0;
  const gemPct = input.pullRateInfo?.psa_avg_gem_pct;
  const gemComponent =
    gemPct == null ? 0 : gemPct <= 0.3 ? 12 : gemPct <= 0.5 ? 8 : gemPct <= 0.7 ? 4 : 0;

  const baseScore =
    clamp(
      rarityComponent +
        ageComponent +
        pullOddsComponent +
        gemComponent +
        input.promoScarcityScore,
      0,
      100
    );
  const matureRarityFloor =
    input.releaseAgeYears != null &&
    input.releaseAgeYears >= 7 &&
    input.rarityWeight >= 1.08
      ? input.releaseAgeYears >= 9 || input.rarityWeight >= 1.15
        ? 58
        : 52
      : 0;

  return round(Math.max(baseScore, matureRarityFloor));
}

function getLongTermLabel(score: number): string {
  if (score >= 75) return "Strong hold";
  if (score >= 55) return "Hold value";
  if (score >= 35) return "Medium";
  return "Low";
}

function formatAgeLabel(releaseAgeYears: number | null): string | null {
  if (releaseAgeYears == null) return null;
  if (releaseAgeYears < 1) return "<1y";
  return `${releaseAgeYears.toFixed(releaseAgeYears >= 10 ? 0 : 1)}y`;
}

export function getBuySignalLabelForScore(score: number): BuySignalLabel {
  if (score <= 19) return "strong_sell";
  if (score <= 39) return "sell";
  if (score <= 60) return "hold";
  if (score <= 80) return "buy";
  return "strong_buy";
}

function formatCurrencyValue(value: number | null, currency: "EUR" | "USD"): string {
  if (value == null) return "--";
  const prefix = currency === "USD" ? "$" : "€";
  return `${prefix}${value.toFixed(value >= 100 ? 0 : 2)}`;
}

function formatPercent(value: number | null): string {
  if (value == null) return "--";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(1)}%`;
}

function getTrendTone(value: number | null): BuySignalTone {
  if (value == null) return "neutral";
  if (value > 2) return "positive";
  if (value < -2) return "negative";
  return "neutral";
}

function getDiscountTone(value: number | null): BuySignalTone {
  if (value == null) return "neutral";
  if (value > 5) return "positive";
  if (value < -5) return "negative";
  return "neutral";
}

function calculateConfidence(input: {
  selection: MarketSelection;
  currentValue: number | null;
  historyPointCount: number;
  sourceCount: number;
  dataAgeDays: number | null;
}): BuySignalConfidence {
  if (input.currentValue == null) return "low";

  let confidenceScore = 28;

  if (input.historyPointCount >= 12) confidenceScore += 24;
  else if (input.historyPointCount >= 5) confidenceScore += 16;
  else if (input.historyPointCount >= 2) confidenceScore += 8;

  if (input.sourceCount >= 2) confidenceScore += 12;

  if (input.selection.market_mode === "graded") {
    const sample = input.selection.ebay_sample_size;
    if (sample != null && sample >= 12) confidenceScore += 26;
    else if (sample != null && sample >= 5) confidenceScore += 18;
    else if (sample != null && sample >= 2) confidenceScore += 10;
  } else {
    confidenceScore -= 8;
    if (input.selection.raw_active_listing_outlier) confidenceScore -= 8;
  }

  if (input.dataAgeDays == null) confidenceScore -= 5;
  else if (input.dataAgeDays <= 7) confidenceScore += 12;
  else if (input.dataAgeDays <= 30) confidenceScore += 5;
  else if (input.dataAgeDays > 60) confidenceScore -= 18;
  else confidenceScore -= 8;

  const cappedScore =
    input.selection.market_mode === "raw" ? Math.min(confidenceScore, 68) : confidenceScore;

  if (cappedScore >= 70) return "high";
  if (cappedScore >= 40) return "medium";
  return "low";
}

export function buildBuySignal(input: BuildBuySignalInput): BuySignalResult {
  const now = input.now instanceof Date ? input.now : new Date(input.now ?? Date.now());
  const selection = buildMarketSelection(input);
  const rarityWeight = input.pull_rate_info?.pull_rate_weight ?? getRarityWeight(input.rarity);
  const releaseAgeYears = getReleaseAgeYears(input.episode_release_date, now);
  const isPromo = isPromoLikeCard({
    rarity: input.rarity ?? input.pull_rate_info?.rarity_name,
    episodeName: input.episode_name,
    episodeCode: input.episode_code,
  });
  const promoScarcityScore = getPromoScarcityScore({ isPromo, releaseAgeYears });
  const longTermScore = getLongTermScore({
    rarityWeight,
    releaseAgeYears,
    pullRateInfo: input.pull_rate_info,
    promoScarcityScore,
  });
  const currentValue = selection.current_value;
  const validHistory = getValidPoints(selection.history_points);
  const change7d = getWindowChange(selection.history_points, 7);
  const change30d = getWindowChange(selection.history_points, 30);
  const historyRangeChange = getHistoryRangeChange(selection.history_points);
  const avg30d = selection.average_30d ?? getRecentAverage(selection.history_points, 30);
  const vs30dAvgPct =
    currentValue != null && avg30d != null && avg30d > 0
      ? ((avg30d - currentValue) / avg30d) * 100
      : null;
  const ebaySoldGapPct =
    currentValue != null &&
    selection.comparison_value != null &&
    (selection.source_label.includes("eBay") || selection.comparison_label?.includes("eBay"))
      ? selection.source_label.includes("eBay") && currentValue > 0
        ? ((selection.comparison_value - currentValue) / currentValue) * 100
        : selection.comparison_value > 0
          ? ((currentValue - selection.comparison_value) / selection.comparison_value) * 100
          : null
      : null;
  const costBasis =
    input.collection_item?.cost_basis_value ?? input.collection_item?.purchase_price ?? null;
  const costBasisPnlPct =
    currentValue != null && costBasis != null && costBasis > 0
      ? ((currentValue - costBasis) / costBasis) * 100
      : null;
  const sourceCount =
    1 +
    (selection.raw_has_secondary_source || selection.comparison_value != null ? 1 : 0) +
    (selection.market_mode === "graded" && selection.ebay_sample_size != null ? 1 : 0);
  const dataAgeDays = getDataAgeDays(selection.data_fetched_at, now);
  const warnings: string[] = [];
  const reasons: string[] = [];
  const hasLongTermHoldValue = longTermScore >= 55;
  const isMatureCollectible =
    releaseAgeYears != null &&
    releaseAgeYears >= 6 &&
    (rarityWeight >= 1.08 || isPromo || longTermScore >= 55);
  const historyRangeIsStable =
    historyRangeChange?.change_pct != null &&
    historyRangeChange.covered_days >= 45 &&
    Math.abs(historyRangeChange.change_pct) <= 8;
  const recentTrendPct = change7d?.change_pct ?? change30d?.change_pct ?? 0;
  const recentTrendIsStable = Math.abs(recentTrendPct) <= 8;
  const averagePremiumPct = vs30dAvgPct == null ? null : -vs30dAvgPct;
  const shortTermPump =
    (change7d?.change_pct != null && change7d.change_pct >= 12) ||
    (change30d?.change_pct != null && change30d.change_pct >= 18 && !historyRangeIsStable);
  const matureAverageDampens =
    isMatureCollectible &&
    averagePremiumPct != null &&
    averagePremiumPct > 0 &&
    averagePremiumPct < 28 &&
    (historyRangeIsStable || recentTrendIsStable) &&
    !shortTermPump;
  const matureStableCollectible =
    isMatureCollectible &&
    !selection.raw_active_listing_outlier &&
    (historyRangeIsStable || (historyRangeChange == null && recentTrendIsStable)) &&
    !shortTermPump &&
    (averagePremiumPct == null || averagePremiumPct < 28);

  if (currentValue == null) {
    warnings.push("No current market value");
  }
  if (validHistory.length < 3) {
    warnings.push("Thin history");
  }
  if (selection.market_mode === "graded" && selection.ebay_sample_size != null && selection.ebay_sample_size < 5) {
    warnings.push("Low eBay sold sample");
  }
  if (selection.raw_active_listing_outlier) {
    warnings.push("Active listing outlier");
  }
  if (dataAgeDays != null && dataAgeDays > 30) {
    warnings.push("Stale market data");
  }
  if (getSavedGrading(input.collection_item) && !selection.matched_graded) {
    warnings.push("No exact graded match");
  }

  let score = 50;

  if (currentValue == null) {
    score = 50;
  } else {
    if (vs30dAvgPct != null) {
      const averageWeight = matureAverageDampens && vs30dAvgPct < 0 ? 0.32 : 1;
      score += clamp(vs30dAvgPct * 0.85 * averageWeight, -20, 20);
      if (vs30dAvgPct >= 8) reasons.push("Below 30d average");
      if (vs30dAvgPct <= -8 && !matureAverageDampens) reasons.push("Above 30d average");
    }

    if (selection.average_7d != null && selection.average_7d > 0) {
      const vs7dAvgPct = ((selection.average_7d - currentValue) / selection.average_7d) * 100;
      score += clamp(vs7dAvgPct * 0.35, -8, 8);
    }

    if (change7d?.change_pct != null) {
      score += clamp(change7d.change_pct * 0.28, -12, 12);
      if (change7d.change_pct >= 8) reasons.push("7d trend up");
      if (change7d.change_pct <= -8) reasons.push("7d trend down");
    }

    if (change30d?.change_pct != null) {
      score += clamp(change30d.change_pct * 0.18, -12, 12);
      if (change30d.change_pct >= 12) reasons.push("30d trend up");
      if (change30d.change_pct <= -12) reasons.push("30d trend down");
    }

    const historyValues = validHistory.map((point) => point.value);
    const low = historyValues.length > 0 ? Math.min(...historyValues) : null;
    const high = historyValues.length > 0 ? Math.max(...historyValues) : null;
    if (low != null && high != null && high > low && currentValue > 0) {
      const gapToHighPct = ((currentValue - high) / high) * 100;
      const changeFromLowPct = low > 0 ? ((currentValue - low) / low) * 100 : null;
      if (gapToHighPct <= -20) score += clamp(Math.abs(gapToHighPct) * 0.08, 0, 8);
      if (gapToHighPct > -6 && changeFromLowPct != null && changeFromLowPct > 45) score -= 6;
    }

    if (ebaySoldGapPct != null) {
      const ebayOpportunityPct = -ebaySoldGapPct;
      score += clamp(ebayOpportunityPct * 0.75, -22, 22);
      if (ebayOpportunityPct >= 8) reasons.push("Below eBay sold median");
      if (ebayOpportunityPct <= -8) reasons.push("Above eBay sold median");
    }

    if (costBasisPnlPct != null) {
      const recentTrendPct = change7d?.change_pct ?? change30d?.change_pct ?? 0;
      const profitSellPressure =
        costBasisPnlPct >= 50 && recentTrendPct < 0
          ? 12
          : costBasisPnlPct >= 100 && recentTrendPct < 8
            ? 8
            : 0;
      const longTermDiscount = hasLongTermHoldValue
        ? clamp((longTermScore - 45) / 45, 0.25, 0.8)
        : 0;
      if (profitSellPressure > 0) {
        score -= profitSellPressure * (1 - longTermDiscount);
      } else if (costBasisPnlPct <= -20 && recentTrendPct > 5) {
        score += 6;
      }
    }

    if (hasLongTermHoldValue) {
      const isOwned = Boolean(input.collection_item);
      const overheated =
        (vs30dAvgPct != null && vs30dAvgPct <= -18) ||
        (ebaySoldGapPct != null && ebaySoldGapPct >= 18);
      const fallingHard =
        (change7d?.change_pct ?? 0) <= -8 || (change30d?.change_pct ?? 0) <= -12;

      if (isOwned && (!overheated || !fallingHard)) {
        if (score < 40) score = 43;
        else if (score < 50) score += clamp((longTermScore - 55) * 0.12, 1, 5);
        reasons.push("Long-term hold value");
      } else if (!isOwned && !overheated) {
        score += clamp((longTermScore - 50) * 0.12, 0, 7);
        reasons.push("Long-term collectible strength");
      }
    }

    if (selection.raw_active_listing_outlier) {
      score = clamp(score, 40, 60);
      reasons.push("Active listing outlier");
    }

    if (matureStableCollectible) {
      if (input.collection_item) {
        score = Math.max(score, 48);
      } else {
        score = Math.max(score, 62);
        score += clamp((longTermScore - 55) * 0.08, 0, 3);
      }
      reasons.push(
        historyRangeIsStable ? "Mature stable collectible" : "Older collectible, no strong pump"
      );
    }
  }

  const confidence = calculateConfidence({
    selection,
    currentValue,
    historyPointCount: validHistory.length,
    sourceCount,
    dataAgeDays,
  });

  if (confidence === "low") {
    score = clamp(score, 20, 80);
  }

  const roundedScore = round(clamp(score, 0, 100));
  const label = getBuySignalLabelForScore(roundedScore);
  const rarityLabel =
    normalizeRarityLabel(input.rarity ?? input.pull_rate_info?.rarity_name) ??
    input.rarity ??
    input.pull_rate_info?.rarity_name ??
    null;
  const ageLabel = formatAgeLabel(releaseAgeYears);
  const pullOddsLabel =
    input.pull_rate_info?.specific_pull_odds ?? input.pull_rate_info?.pull_rate_odds ?? null;
  const longTermValue = [
    isPromo ? getPromoScarcityLabel(promoScarcityScore) : getLongTermLabel(longTermScore),
    ageLabel,
    pullOddsLabel,
  ]
    .filter(Boolean)
    .join(" / ");

  const evidence: BuySignalEvidenceItem[] = [
    {
      label: "Market",
      value: `${selection.source_label} ${formatCurrencyValue(currentValue, selection.currency)}`,
      tone: currentValue == null ? "warning" : "neutral",
    },
    {
      label: isPromo ? "Promo scarcity" : rarityLabel ?? "Long term",
      value: longTermValue || getLongTermLabel(longTermScore),
      tone: longTermScore >= 55 ? "positive" : longTermScore >= 35 ? "neutral" : "warning",
    },
    {
      label: "30d avg",
      value:
        avg30d != null
          ? `${formatCurrencyValue(avg30d, selection.currency)} (${formatPercent(vs30dAvgPct)})`
          : "--",
      tone: getDiscountTone(vs30dAvgPct),
    },
    {
      label: "30d trend",
      value: formatPercent(change30d?.change_pct ?? null),
      tone: getTrendTone(change30d?.change_pct ?? null),
    },
  ];

  if (historyRangeChange?.change_pct != null && historyRangeChange.covered_days >= 45) {
    evidence.push({
      label: `${Math.round(historyRangeChange.covered_days)}d range`,
      value: formatPercent(historyRangeChange.change_pct),
      tone:
        Math.abs(historyRangeChange.change_pct) <= 8
          ? "positive"
          : getTrendTone(historyRangeChange.change_pct),
    });
  }

  if (selection.market_mode === "graded") {
    evidence.push({
      label: "eBay sold",
      value:
        selection.ebay_sample_size != null
          ? `${selection.ebay_sample_size} sales`
          : selection.comparison_label === "eBay sold"
            ? "Available"
            : "--",
      tone:
        selection.ebay_sample_size == null
          ? "warning"
          : selection.ebay_sample_size >= 5
            ? "positive"
            : "warning",
    });
  } else {
    evidence.push({
      label: "eBay sold",
      value: "Graded only",
      tone: "warning",
    });
  }

  if (costBasisPnlPct != null) {
    evidence.push({
      label: "Owned P&L",
      value: formatPercent(costBasisPnlPct),
      tone: costBasisPnlPct >= 0 ? "positive" : "negative",
    });
  }

  evidence.push({
    label: "Updated",
    value: dataAgeDays == null ? "--" : dataAgeDays === 0 ? "Today" : `${dataAgeDays}d ago`,
    tone: dataAgeDays == null || dataAgeDays > 30 ? "warning" : "neutral",
  });

  if (reasons.length === 0 && roundedScore >= 61) reasons.push("Market setup improving");
  if (reasons.length === 0 && roundedScore <= 39) reasons.push("Market setup weakening");
  if (reasons.length === 0) reasons.push("Neutral market setup");

  return {
    score: roundedScore,
    marker_percent: roundedScore,
    label,
    label_text: LABEL_TEXT[label],
    confidence,
    market_mode: selection.market_mode,
    context: input.collection_item ? "owned" : "market",
    source_label: selection.source_label,
    current_value: currentValue,
    currency: selection.currency,
    reasons: reasons.slice(0, 4),
    warnings: warnings.slice(0, 4),
    evidence,
    metrics: {
      history_points: validHistory.length,
      source_count: Math.max(1, sourceCount),
      data_age_days: dataAgeDays,
      change_7d_pct: change7d?.change_pct ?? null,
      change_30d_pct: change30d?.change_pct ?? null,
      vs_30d_avg_pct: vs30dAvgPct == null ? null : round(vs30dAvgPct, 1),
      ebay_sold_gap_pct: ebaySoldGapPct == null ? null : round(ebaySoldGapPct, 1),
      cost_basis_pnl_pct: costBasisPnlPct == null ? null : round(costBasisPnlPct, 1),
      ebay_sample_size: selection.ebay_sample_size,
      rarity_weight: rarityWeight,
      release_age_years: releaseAgeYears,
      long_term_score: longTermScore,
      promo_scarcity_score: promoScarcityScore,
      history_range_change_pct:
        historyRangeChange?.change_pct == null ? null : round(historyRangeChange.change_pct, 1),
      history_range_covered_days: historyRangeChange?.covered_days ?? null,
      raw_active_listing_outlier: selection.raw_active_listing_outlier,
    },
  };
}
