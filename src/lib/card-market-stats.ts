import type { EbayDemandPayload } from "@/lib/ebay-demand";
import type { CardPriceHistoryPoint } from "@/lib/price-history";

export type CardMarketStatsConfidence = "low" | "medium" | "high";
export type CardMarketStatsTier =
  | "STRONG"
  | "POSITIVE"
  | "NEUTRAL"
  | "CAUTION"
  | "WEAK"
  | "BUILDING";

export interface CardMarketStatsMetrics {
  momentum: number | null;
  stability: number | null;
  liquidity: number | null;
  grade_premium: number | null;
  demand: number | null;
  market_depth: number | null;
}

export interface CardMarketStatsMetricSources {
  liquidity: "ebay_inventory" | "ebay_sales_proxy" | "market_proxy" | "neutral_prior";
  demand: "ebay_lifecycle" | "ebay_sales_proxy" | "price_proxy" | "neutral_prior";
}

export interface CardMarketStatsTcggoComparison {
  score: number | null;
  tier: string | null;
  momentum: number | null;
  stability: number | null;
  liquidity: number | null;
  grade_premium: number | null;
  demand: number | null;
  market_depth: number | null;
  rsi: number | null;
  ath: number | null;
  atl: number | null;
  updated_at: string | null;
}

export interface CardMarketStatsGradedComparison {
  label: string;
  company: string;
  grade: string;
  price_eur: number;
  raw_multiple: number | null;
  source: "ebay_sold" | "cardmarket";
  sample_size: number | null;
  reliability: CardMarketStatsConfidence;
}

export interface CardMarketStats {
  model: "dustycards-market-v2";
  score: number | null;
  tier: CardMarketStatsTier;
  confidence: CardMarketStatsConfidence;
  metrics: CardMarketStatsMetrics;
  metric_sources: CardMarketStatsMetricSources;
  rsi: number | null;
  rsi_label: "Oversold" | "Neutral" | "Overbought" | null;
  volatility_percent: number | null;
  ath: number | null;
  atl: number | null;
  language_spread: number | null;
  language_spread_percent: number | null;
  data_points: number;
  graded_comparisons: CardMarketStatsGradedComparison[];
  updated_at: string | null;
  tcggo: CardMarketStatsTcggoComparison | null;
}

interface TcggoScoreInput {
  score?: number | null;
  tier?: string | null;
  momentum?: number | null;
  stability?: number | null;
  liquidity?: number | null;
  gradePremium?: number | null;
  demand?: number | null;
  marketDepth?: number | null;
  rsi?: number | null;
  ath?: number | null;
  atl?: number | null;
  updatedAt?: Date | string | null;
}

interface EbaySoldGradedPriceInput {
  label: string;
  company?: string | null;
  grade?: string | null;
  median_price: number;
  currency: string;
  median_price_eur?: number | null;
  sample_size?: number | null;
  fetched_at?: Date | string | null;
}

interface CardMarketGradedPriceInput {
  label: string;
  price: number;
}

export interface BuildCardMarketStatsInput {
  history: CardPriceHistoryPoint[];
  currentLanguagePrices: Record<string, number | null | undefined>;
  rawPrice: number | null | undefined;
  gradedPrices: CardMarketGradedPriceInput[];
  ebaySoldGradedPrices: EbaySoldGradedPriceInput[];
  demand: EbayDemandPayload | null;
  updatedAt?: Date | string | null;
  tcggo?: TcggoScoreInput | null;
}

interface PriceObservation {
  date: string;
  timestamp: number;
  value: number;
}

interface GradedCandidate extends CardMarketStatsGradedComparison {
  gradeNumber: number;
  key: string;
}

const DAY_MS = 24 * 60 * 60 * 1_000;
const SCORE_WEIGHTS: Record<keyof CardMarketStatsMetrics, number> = {
  momentum: 0.27,
  stability: 0.16,
  liquidity: 0.17,
  grade_premium: 0.12,
  demand: 0.18,
  market_depth: 0.1,
};

function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, precision = 0): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function finitePositive(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) && value > 0 && value !== 9001
    ? value
    : null;
}

function finiteScore(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) ? round(clamp(value), 1) : null;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function latestIso(values: Array<Date | string | null | undefined>): string | null {
  let latest: Date | null = null;
  for (const value of values) {
    if (!value) continue;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) continue;
    if (!latest || date.getTime() > latest.getTime()) latest = date;
  }
  return latest?.toISOString() ?? null;
}

function buildObservations(history: CardPriceHistoryPoint[]): PriceObservation[] {
  const byDate = new Map<string, PriceObservation>();

  for (const point of history) {
    const value = finitePositive(point.cm_market_en ?? point.cm_market);
    const timestamp = new Date(`${point.date}T00:00:00.000Z`).getTime();
    if (value == null || Number.isNaN(timestamp)) continue;
    byDate.set(point.date, { date: point.date, timestamp, value });
  }

  return [...byDate.values()].sort((a, b) => a.timestamp - b.timestamp);
}

function calculateLookbackReturn(
  observations: PriceObservation[],
  lookbackDays: number
): number | null {
  const latest = observations.at(-1);
  const oldest = observations[0];
  if (!latest || !oldest || latest.timestamp <= oldest.timestamp) return null;

  const target = latest.timestamp - lookbackDays * DAY_MS;
  const atOrBeforeTarget = observations.filter(
    (observation) => observation.timestamp <= target
  );
  const baseline = atOrBeforeTarget.at(-1) ?? oldest;
  const elapsedDays = (latest.timestamp - baseline.timestamp) / DAY_MS;
  if (elapsedDays < 1 || elapsedDays < lookbackDays * 0.35) return null;

  const logReturn = Math.log(latest.value / baseline.value) * 100;
  const normalization = Math.min(1.5, lookbackDays / elapsedDays);
  return clamp(logReturn * normalization, -150, 150);
}

function calculateMomentum(observations: PriceObservation[]): number | null {
  if (observations.length < 2) return null;

  const windows = [
    { days: 7, weight: 0.5 },
    { days: 30, weight: 0.3 },
    { days: 90, weight: 0.2 },
  ];
  const returns = windows
    .map((window) => ({
      ...window,
      value: calculateLookbackReturn(observations, window.days),
    }))
    .filter((entry): entry is (typeof windows)[number] & { value: number } => entry.value != null);
  const weight = returns.reduce((sum, entry) => sum + entry.weight, 0);
  if (weight === 0) return null;

  const weightedReturn = returns.reduce(
    (sum, entry) => sum + entry.value * entry.weight,
    0
  ) / weight;
  return round(clamp(50 + 50 * Math.tanh(weightedReturn / 30)));
}

function buildDailyLogReturns(observations: PriceObservation[]): number[] {
  const returns: number[] = [];
  for (let index = 1; index < observations.length; index += 1) {
    const previous = observations[index - 1];
    const current = observations[index];
    const elapsedDays = Math.max(1, (current.timestamp - previous.timestamp) / DAY_MS);
    returns.push(Math.log(current.value / previous.value) / Math.sqrt(elapsedDays));
  }
  return returns.filter(Number.isFinite);
}

function calculateVolatility(observations: PriceObservation[]): number | null {
  const returns = buildDailyLogReturns(observations);
  if (returns.length < 2) return null;

  const average = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - average) ** 2, 0) /
    (returns.length - 1);
  return round(Math.sqrt(variance) * Math.sqrt(365) * 100, 1);
}

function calculateStability(volatility: number | null): number | null {
  return volatility == null ? null : round(clamp(100 * Math.exp(-volatility / 120)));
}

function calculateRsi(observations: PriceObservation[]): number | null {
  if (observations.length < 15) return null;

  const recent = observations.slice(-15);
  let gains = 0;
  let losses = 0;
  for (let index = 1; index < recent.length; index += 1) {
    const change = recent[index].value - recent[index - 1].value;
    if (change > 0) gains += change;
    if (change < 0) losses += Math.abs(change);
  }

  if (gains === 0 && losses === 0) return 50;
  if (losses === 0) return 100;
  if (gains === 0) return 0;
  return round(100 - 100 / (1 + gains / losses), 1);
}

function getRsiLabel(rsi: number | null): CardMarketStats["rsi_label"] {
  if (rsi == null) return null;
  if (rsi >= 70) return "Overbought";
  if (rsi <= 30) return "Oversold";
  return "Neutral";
}

function calculateEbayLiquidity(demand: EbayDemandPayload | null): number | null {
  if (!demand) return null;
  const activeCount = Math.max(demand.summary.activeCount, demand.sample.clean);
  return round(clamp(100 * (1 - Math.exp(-activeCount / 12))));
}

function calculateEbayDemand(demand: EbayDemandPayload | null): number | null {
  if (!demand || demand.history.length < 2) return null;

  const activeCount = Math.max(demand.summary.activeCount, 1);
  const removed = Math.max(0, demand.summary.removed7d);
  const added = Math.max(0, demand.summary.new7d);
  const pressure = clamp(demand.summary.removalPressure7d);
  const balance = 50 + 50 * Math.tanh((removed - added) / Math.max(activeCount * 0.5, 2));
  const velocity = 100 * (1 - Math.exp(-removed / Math.max(activeCount * 0.45, 1)));

  return round(clamp(pressure * 0.45 + balance * 0.35 + velocity * 0.2));
}

function calculateEbaySoldActivity(prices: EbaySoldGradedPriceInput[]): number | null {
  const sampleSize = prices.reduce((sum, price) => {
    const sample = price.sample_size;
    return sum + (sample != null && Number.isFinite(sample) && sample > 0 ? Math.floor(sample) : 0);
  }, 0);
  if (sampleSize === 0) return null;
  return round(clamp(100 * (1 - Math.exp(-sampleSize / 8))));
}

function calculateLiquidityMetric(input: {
  demand: EbayDemandPayload | null;
  ebaySoldGradedPrices: EbaySoldGradedPriceInput[];
  history: CardPriceHistoryPoint[];
  observations: PriceObservation[];
  languageCount: number;
}): {
  value: number;
  source: CardMarketStatsMetricSources["liquidity"];
} {
  const direct = calculateEbayLiquidity(input.demand);
  if (direct != null) return { value: direct, source: "ebay_inventory" };

  const recentHistory = input.history.slice(-30);
  const guideDays = recentHistory.filter(
    (point) => finitePositive(point.cm_avg_7d) != null || finitePositive(point.cm_avg_30d) != null
  ).length;
  const languageBreadth = input.languageCount > 0 ? (input.languageCount / 6) * 100 : null;
  const guideCoverage = recentHistory.length > 0 && guideDays > 0
    ? (guideDays / recentHistory.length) * 100
    : null;
  const historyContinuity = input.observations.length > 0
    ? 100 * (1 - Math.exp(-input.observations.length / 14))
    : null;
  const proxy = weightedAvailableScore([
    { value: languageBreadth, weight: 0.55 },
    { value: guideCoverage, weight: 0.3 },
    { value: historyContinuity, weight: 0.15 },
  ]);

  const soldActivity = calculateEbaySoldActivity(input.ebaySoldGradedPrices);
  if (soldActivity != null) {
    const soldProxy = weightedAvailableScore([
      { value: soldActivity, weight: 0.6 },
      { value: proxy == null ? null : 15 + proxy * 0.7, weight: 0.4 },
    ]) ?? soldActivity;
    return {
      value: round(clamp(soldProxy, 10, 90)),
      source: "ebay_sales_proxy",
    };
  }

  if (proxy == null) return { value: 50, source: "neutral_prior" };
  // Keep coverage-only estimates away from unsupported extremes.
  return { value: round(clamp(15 + proxy * 0.7)), source: "market_proxy" };
}

function calculatePriceGuideTrend(history: CardPriceHistoryPoint[]): number | null {
  const point = [...history].reverse().find(
    (candidate) =>
      finitePositive(candidate.cm_avg_7d) != null &&
      finitePositive(candidate.cm_avg_30d) != null
  );
  const average7d = finitePositive(point?.cm_avg_7d);
  const average30d = finitePositive(point?.cm_avg_30d);
  if (average7d == null || average30d == null) return null;

  const logSpreadPercent = Math.log(average7d / average30d) * 100;
  return round(clamp(50 + 50 * Math.tanh(logSpreadPercent / 20)));
}

function calculateDemandMetric(input: {
  demand: EbayDemandPayload | null;
  ebaySoldGradedPrices: EbaySoldGradedPriceInput[];
  history: CardPriceHistoryPoint[];
  momentum: number | null;
}): {
  value: number;
  source: CardMarketStatsMetricSources["demand"];
} {
  const direct = calculateEbayDemand(input.demand);
  if (direct != null) return { value: direct, source: "ebay_lifecycle" };

  const priceProxy = weightedAvailableScore([
    { value: input.momentum, weight: 0.65 },
    { value: calculatePriceGuideTrend(input.history), weight: 0.35 },
  ]);
  const soldActivity = calculateEbaySoldActivity(input.ebaySoldGradedPrices);
  if (soldActivity != null) {
    const soldProxy = weightedAvailableScore([
      { value: soldActivity, weight: 0.45 },
      { value: priceProxy, weight: 0.55 },
    ]) ?? soldActivity;
    return {
      value: round(clamp(50 + (soldProxy - 50) * 0.8)),
      source: "ebay_sales_proxy",
    };
  }
  if (priceProxy == null) return { value: 50, source: "neutral_prior" };

  // Price direction can indicate demand, but shrink it toward neutral until
  // verified listing lifecycle data confirms actual market pressure.
  return {
    value: round(clamp(50 + (priceProxy - 50) * 0.75)),
    source: "price_proxy",
  };
}

function normalizeCompany(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase() ?? "";
  if (normalized.includes("PSA")) return "PSA";
  if (normalized.includes("BGS") || normalized.includes("BECKETT")) return "BGS";
  if (normalized.includes("CGC")) return "CGC";
  if (normalized.includes("SGC")) return "SGC";
  if (normalized.includes("ACE")) return "ACE";
  return null;
}

function normalizeGrade(
  value: string | null | undefined,
  fallbackLabel: string
): { text: string; numeric: number } | null {
  const match = `${value ?? ""} ${fallbackLabel}`.match(/(?:^|[^0-9])(10|9\.5|9|8\.5|8|7\.5|7|6\.5|6|5\.5|5)(?:[^0-9]|$)/i);
  if (!match) return null;
  const numeric = Number(match[1]);
  return Number.isFinite(numeric) ? { text: String(numeric), numeric } : null;
}

function getReliability(
  source: CardMarketStatsGradedComparison["source"],
  sampleSize: number | null
): CardMarketStatsConfidence {
  if (source !== "ebay_sold") return "low";
  if ((sampleSize ?? 0) >= 5) return "high";
  if ((sampleSize ?? 0) >= 2) return "medium";
  return "low";
}

function getCandidateRank(candidate: GradedCandidate): number {
  const preferredOrder = [
    "PSA|10",
    "PSA|9",
    "BGS|9.5",
    "BGS|10",
    "CGC|10",
    "CGC|9.5",
    "SGC|10",
    "ACE|10",
  ];
  const preferredIndex = preferredOrder.indexOf(candidate.key);
  return preferredIndex >= 0 ? preferredIndex : 100 - candidate.gradeNumber;
}

function candidateEvidenceRank(candidate: GradedCandidate): number {
  if (candidate.source === "ebay_sold") return 100 + (candidate.sample_size ?? 0);
  return 1;
}

function buildGradedCandidates(input: BuildCardMarketStatsInput): GradedCandidate[] {
  const candidates = new Map<string, GradedCandidate>();
  const rawPrice = finitePositive(input.rawPrice);

  const addCandidate = (candidate: GradedCandidate) => {
    const existing = candidates.get(candidate.key);
    if (!existing || candidateEvidenceRank(candidate) > candidateEvidenceRank(existing)) {
      candidates.set(candidate.key, candidate);
    }
  };

  for (const price of input.gradedPrices) {
    const value = finitePositive(price.price);
    const company = normalizeCompany(price.label);
    const grade = normalizeGrade(null, price.label);
    if (value == null || !company || !grade) continue;
    const key = `${company}|${grade.text}`;
    addCandidate({
      key,
      gradeNumber: grade.numeric,
      label: `${company} ${grade.text}`,
      company,
      grade: grade.text,
      price_eur: round(value, 2),
      raw_multiple: rawPrice == null ? null : round(value / rawPrice, 1),
      source: "cardmarket",
      sample_size: null,
      reliability: "low",
    });
  }

  for (const price of input.ebaySoldGradedPrices) {
    const currency = price.currency.trim().toUpperCase();
    const value = finitePositive(
      price.median_price_eur ?? (currency === "EUR" ? price.median_price : null)
    );
    const company = normalizeCompany(price.company) ?? normalizeCompany(price.label);
    const grade = normalizeGrade(price.grade, price.label);
    if (value == null || !company || !grade) continue;
    const sampleSize = price.sample_size != null && price.sample_size >= 0
      ? Math.floor(price.sample_size)
      : null;
    const key = `${company}|${grade.text}`;
    addCandidate({
      key,
      gradeNumber: grade.numeric,
      label: `${company} ${grade.text}`,
      company,
      grade: grade.text,
      price_eur: round(value, 2),
      raw_multiple: rawPrice == null ? null : round(value / rawPrice, 1),
      source: "ebay_sold",
      sample_size: sampleSize,
      reliability: getReliability("ebay_sold", sampleSize),
    });
  }

  return [...candidates.values()].sort(
    (a, b) => getCandidateRank(a) - getCandidateRank(b) || b.price_eur - a.price_eur
  );
}

function calculateGradePremium(candidates: GradedCandidate[]): number | null {
  // BGS 9.5 is a gem-mint peer here; BGS 10 remains a separate pristine tier.
  const representativeKeys = ["PSA|10", "BGS|9.5", "CGC|10", "SGC|10", "ACE|10", "BGS|10"];
  const representative = representativeKeys
    .map((key) => candidates.find((candidate) => candidate.key === key))
    .find((candidate) => candidate?.raw_multiple != null);
  if (!representative?.raw_multiple) return null;

  const centeredPremium = Math.log(representative.raw_multiple / 1.5) / 1.2;
  return round(clamp(50 + 50 * Math.tanh(centeredPremium)));
}

function weightedAvailableScore(
  values: Array<{ value: number | null; weight: number }>
): number | null {
  const available = values.filter((entry): entry is { value: number; weight: number } =>
    entry.value != null
  );
  if (available.length === 0) return null;
  const weight = available.reduce((sum, entry) => sum + entry.weight, 0);
  return round(available.reduce((sum, entry) => sum + entry.value * entry.weight, 0) / weight);
}

function calculateMarketDepth(input: {
  languageCount: number;
  demand: EbayDemandPayload | null;
  gradedCandidateCount: number;
}): number | null {
  const languageDepth = input.languageCount > 0 ? (input.languageCount / 6) * 100 : null;
  const listingDepth = input.demand
    ? 100 * (1 - Math.exp(-Math.max(input.demand.summary.activeCount, 0) / 18))
    : null;
  const gradedDepth = input.gradedCandidateCount > 0
    ? 100 * (1 - Math.exp(-input.gradedCandidateCount / 4))
    : null;

  return weightedAvailableScore([
    { value: languageDepth, weight: 0.4 },
    { value: listingDepth, weight: 0.35 },
    { value: gradedDepth, weight: 0.25 },
  ]);
}

function calculateOverallScore(metrics: CardMarketStatsMetrics): number | null {
  const entries = (Object.keys(SCORE_WEIGHTS) as Array<keyof CardMarketStatsMetrics>)
    .map((key) => ({ value: metrics[key], weight: SCORE_WEIGHTS[key] }));
  if (entries.filter((entry) => entry.value != null).length < 2) return null;

  // Missing inputs stay neutral instead of making a sparse card look unusually strong or weak.
  return round(entries.reduce(
    (sum, entry) => sum + (entry.value ?? 50) * entry.weight,
    0
  ));
}

function getTier(score: number | null): CardMarketStatsTier {
  if (score == null) return "BUILDING";
  if (score >= 80) return "STRONG";
  if (score >= 65) return "POSITIVE";
  if (score >= 45) return "NEUTRAL";
  if (score >= 30) return "CAUTION";
  return "WEAK";
}

function getConfidence(input: {
  historyCount: number;
  languageCount: number;
  demand: EbayDemandPayload | null;
  candidates: GradedCandidate[];
  metrics: CardMarketStatsMetrics;
}): CardMarketStatsConfidence {
  let evidence = input.historyCount >= 30 ? 3 : input.historyCount >= 14 ? 2 : input.historyCount >= 3 ? 1 : 0;
  evidence += input.demand?.history.length && input.demand.history.length >= 7
    ? 2
    : input.demand?.history.length && input.demand.history.length >= 2
      ? 1
      : 0;
  evidence += input.candidates.some((candidate) => candidate.reliability === "high")
    ? 2
    : input.candidates.length > 0
      ? 1
      : 0;
  if (input.languageCount >= 3) evidence += 1;
  const availableMetrics = Object.values(input.metrics).filter((value) => value != null).length;
  evidence += availableMetrics >= 5 ? 2 : availableMetrics >= 3 ? 1 : 0;

  if (evidence >= 8) return "high";
  if (evidence >= 5) return "medium";
  return "low";
}

function normalizeTcggo(input: TcggoScoreInput | null | undefined): CardMarketStatsTcggoComparison | null {
  if (!input) return null;
  const comparison: CardMarketStatsTcggoComparison = {
    score: finiteScore(input.score),
    tier: input.tier?.trim().toUpperCase() || null,
    momentum: finiteScore(input.momentum),
    stability: finiteScore(input.stability),
    liquidity: finiteScore(input.liquidity),
    grade_premium: finiteScore(input.gradePremium),
    demand: finiteScore(input.demand),
    market_depth: finiteScore(input.marketDepth),
    rsi: finiteScore(input.rsi),
    ath: finitePositive(input.ath),
    atl: finitePositive(input.atl),
    updated_at: toIso(input.updatedAt),
  };
  const hasData = Object.entries(comparison).some(
    ([key, value]) => key !== "updated_at" && value != null
  );
  return hasData ? comparison : null;
}

export function buildCardMarketStats(input: BuildCardMarketStatsInput): CardMarketStats {
  const observations = buildObservations(input.history);
  const volatility = calculateVolatility(observations);
  const languageValues = Object.values(input.currentLanguagePrices)
    .map(finitePositive)
    .filter((value): value is number => value != null);
  const languageMinimum = languageValues.length >= 2 ? Math.min(...languageValues) : null;
  const languageMaximum = languageValues.length >= 2 ? Math.max(...languageValues) : null;
  const languageSpread = languageMinimum != null && languageMaximum != null
    ? round(languageMaximum - languageMinimum, 2)
    : null;
  const candidates = buildGradedCandidates(input);
  const rsi = calculateRsi(observations);
  const momentum = calculateMomentum(observations);
  const liquidity = calculateLiquidityMetric({
    demand: input.demand,
    ebaySoldGradedPrices: input.ebaySoldGradedPrices,
    history: input.history,
    observations,
    languageCount: languageValues.length,
  });
  const demand = calculateDemandMetric({
    demand: input.demand,
    ebaySoldGradedPrices: input.ebaySoldGradedPrices,
    history: input.history,
    momentum,
  });
  const metrics: CardMarketStatsMetrics = {
    momentum,
    stability: calculateStability(volatility),
    liquidity: liquidity.value,
    grade_premium: calculateGradePremium(candidates),
    demand: demand.value,
    market_depth: calculateMarketDepth({
      languageCount: languageValues.length,
      demand: input.demand,
      gradedCandidateCount: candidates.length,
    }),
  };
  const metricSources: CardMarketStatsMetricSources = {
    liquidity: liquidity.source,
    demand: demand.source,
  };
  // Proxy bars improve coverage in the UI but remain neutral in the weighted
  // total until verified eBay inventory or lifecycle evidence exists.
  const scoringMetrics: CardMarketStatsMetrics = {
    ...metrics,
    liquidity: liquidity.source === "ebay_inventory" ? liquidity.value : null,
    demand: demand.source === "ebay_lifecycle" ? demand.value : null,
  };
  const score = calculateOverallScore(scoringMetrics);

  return {
    model: "dustycards-market-v2",
    score,
    tier: getTier(score),
    confidence: getConfidence({
      historyCount: observations.length,
      languageCount: languageValues.length,
      demand: input.demand,
      candidates,
      metrics: scoringMetrics,
    }),
    metrics,
    metric_sources: metricSources,
    rsi,
    rsi_label: getRsiLabel(rsi),
    volatility_percent: volatility,
    ath: observations.length > 0
      ? round(Math.max(...observations.map((observation) => observation.value)), 2)
      : null,
    atl: observations.length > 0
      ? round(Math.min(...observations.map((observation) => observation.value)), 2)
      : null,
    language_spread: languageSpread,
    language_spread_percent: languageSpread != null && languageMinimum != null
      ? round((languageSpread / languageMinimum) * 100, 1)
      : null,
    data_points: observations.length,
    graded_comparisons: candidates.slice(0, 3).map((candidate) => ({
      label: candidate.label,
      company: candidate.company,
      grade: candidate.grade,
      price_eur: candidate.price_eur,
      raw_multiple: candidate.raw_multiple,
      source: candidate.source,
      sample_size: candidate.sample_size,
      reliability: candidate.reliability,
    })),
    updated_at: latestIso([
      input.updatedAt,
      input.demand?.updatedAt,
      ...input.ebaySoldGradedPrices.map((price) => price.fetched_at),
    ]),
    tcggo: normalizeTcggo(input.tcggo),
  };
}
