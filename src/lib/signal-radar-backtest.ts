import {
  buildPriceScenario,
  type ExtendedPriceHistoryFeatures,
} from "@/lib/external-market-intelligence-core";
import {
  calculateRobustPriceTrend,
  type DailyMarketValue,
} from "@/lib/robust-price-history";

/**
 * Offline backtest harness for the Signal Radar price scenario.
 *
 * v1 limitation: only the price-derived part of the model is replayed. The
 * external legs (catalysts, eBay demand, sealed pressure, lifecycle,
 * competitive and structural demand) are unknown at historical as-of points
 * and are held NEUTRAL, so hit-rates here measure the momentum/valuation core
 * of buildPriceScenario, not the full production scenario. The JP lead-lag,
 * set-relative-strength and avg30-anchor extended features stay null in v1
 * for the same reason.
 */

const DAY_MS = 86_400_000;
const REALIZED_WINDOW_DAYS = 7;
const MOMENTUM_365_COVERAGE = { spanDays: 240, uniqueDays: 24 } as const;

export type BacktestOutlook = "strong_up" | "modest_up" | "flat" | "down";

export interface BacktestInputs {
  asOfDay: Date;
  currentPrice: number;
  historyPoints: number;
  rawTrend30dPct: number | null;
  rawTrend90dPct: number | null;
  rawTrend180dPct: number | null;
  extendedHistory: ExtendedPriceHistoryFeatures;
}

export interface BacktestPrediction {
  asOfDay: string;
  horizonDays: 90 | 180;
  entryPrice: number;
  confidence: "High" | "Medium" | "Low";
  outlook: BacktestOutlook;
  predictedLow: number;
  predictedBase: number;
  predictedHigh: number;
  predictedBasePct: number;
  realizedPrice: number | null;
  realizedReturnPct: number | null;
  directionHit: boolean | null;
  bandWithin: boolean | null;
  absErrorPct: number | null;
}

export interface CardBacktestOptions {
  stepDays?: number;
  minPriorDays?: number;
  minFutureDays?: number;
  includeLowConfidence?: boolean;
}

export interface BacktestOutlookSummary {
  samples: number;
  directionHitRate: number | null;
  bandCoverage: number | null;
  meanAbsErrorPct: number | null;
  meanPredictedPct: number | null;
  meanRealizedPct: number | null;
}

export interface BacktestSummary {
  totalPredictions: number;
  scoredPredictions: number;
  byOutlook: Record<BacktestOutlook, BacktestOutlookSummary>;
}

const OUTLOOK_CLASSES: readonly BacktestOutlook[] = [
  "strong_up",
  "modest_up",
  "flat",
  "down",
];

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function calculateVolatilityDaily90Pct(
  truncated: readonly DailyMarketValue[]
): number | null {
  if (truncated.length < 2) return null;
  const latest = truncated[truncated.length - 1].day.getTime();
  const cutoff = latest - 90 * DAY_MS;
  const window = truncated.filter((point) => point.day.getTime() >= cutoff);
  const returns: number[] = [];
  for (let index = 1; index < window.length; index++) {
    const previous = window[index - 1];
    const gapDays = (window[index].day.getTime() - previous.day.getTime()) / DAY_MS;
    // Only near-adjacent observations produce a meaningful day-over-day
    // return; a wide gap would count a multi-week move as one daily step.
    if (gapDays < 1 || gapDays > 3 || previous.value <= 0) continue;
    returns.push(((window[index].value - previous.value) / previous.value) * 100);
  }
  if (returns.length < 10) return null;
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance =
    returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / returns.length;
  return Number(Math.sqrt(variance).toFixed(2));
}

function calculateAthDistancePct(
  truncated: readonly DailyMarketValue[]
): number | null {
  if (truncated.length === 0) return null;
  let high = 0;
  for (const point of truncated) {
    if (point.value > high) high = point.value;
  }
  const current = truncated[truncated.length - 1].value;
  if (high <= 0 || current <= 0) return null;
  return Math.min(0, Number((((current - high) / high) * 100).toFixed(1)));
}

// Mirrors calculateRobustPriceTrend for a 365d horizon, which the shared
// helper does not support. Coverage requirements extend its 30/90/180 scale.
function calculateMomentum365Pct(
  truncated: readonly DailyMarketValue[]
): number | null {
  if (truncated.length < MOMENTUM_365_COVERAGE.uniqueDays) return null;
  const latest = truncated[truncated.length - 1].day.getTime();
  const cutoff = latest - 365 * DAY_MS;
  const window = truncated.filter((point) => point.day.getTime() >= cutoff);
  if (window.length < MOMENTUM_365_COVERAGE.uniqueDays) return null;
  const spanDays = Math.round((latest - window[0].day.getTime()) / DAY_MS);
  if (spanDays < MOMENTUM_365_COVERAGE.spanDays) return null;
  const endpointSize = Math.min(5, Math.max(2, Math.floor(window.length / 4)));
  const startValue = median(window.slice(0, endpointSize).map((point) => point.value));
  const endValue = median(window.slice(-endpointSize).map((point) => point.value));
  if (startValue == null || endValue == null || startValue <= 0) return null;
  const percent = ((endValue - startValue) / startValue) * 100;
  if (!Number.isFinite(percent) || Math.abs(percent) > 300) return null;
  return Number(percent.toFixed(1));
}

/**
 * Computes the model inputs that would have been available on the day at
 * asOfIndex: the series is truncated there, so no future data can leak into
 * trends or extended features.
 */
export function buildBacktestInputsAt(
  dailyHistory: readonly DailyMarketValue[],
  asOfIndex: number
): BacktestInputs | null {
  if (asOfIndex < 0 || asOfIndex >= dailyHistory.length) return null;
  const truncated = dailyHistory.slice(0, asOfIndex + 1);
  const last = truncated[truncated.length - 1];
  if (last.value <= 0) return null;

  const extendedHistory: ExtendedPriceHistoryFeatures = {
    volatilityDaily90Pct: calculateVolatilityDaily90Pct(truncated),
    athDistancePct: calculateAthDistancePct(truncated),
    momentum365Pct: calculateMomentum365Pct(truncated),
    // Unavailable in the single-series backtest (see file header).
    jpLeadLagPct: null,
    setRelativeStrength90Pct: null,
    avg30AnchorGapPct: null,
  };

  return {
    asOfDay: last.day,
    currentPrice: last.value,
    historyPoints: truncated.length,
    rawTrend30dPct: calculateRobustPriceTrend(truncated, 30)?.percent ?? null,
    rawTrend90dPct: calculateRobustPriceTrend(truncated, 90)?.percent ?? null,
    rawTrend180dPct: calculateRobustPriceTrend(truncated, 180)?.percent ?? null,
    extendedHistory,
  };
}

/**
 * Same direction semantics as the pinned scoreForecastOutcome in
 * external-signal-forecast.ts. Kept local so the harness stays importable
 * without pulling any forecast-store machinery into the offline tool.
 */
export function backtestDirectionHit(
  outlook: BacktestOutlook | null,
  realizedReturnPct: number | null
): boolean | null {
  if (outlook == null || realizedReturnPct == null) return null;
  if (outlook === "strong_up" || outlook === "modest_up") return realizedReturnPct > 2;
  if (outlook === "down") return realizedReturnPct < -2;
  return Math.abs(realizedReturnPct) <= 7;
}

// Median of observed values around the target day; a single day would make
// the realized outcome hostage to one noisy listing floor.
function realizedValueAround(
  sorted: readonly DailyMarketValue[],
  targetTime: number
): number | null {
  const values: number[] = [];
  for (const point of sorted) {
    if (Math.abs(point.day.getTime() - targetTime) <= REALIZED_WINDOW_DAYS * DAY_MS) {
      values.push(point.value);
    }
  }
  return median(values);
}

function buildNeutralScenario(inputs: BacktestInputs) {
  const evidenceCount = [
    inputs.rawTrend30dPct,
    inputs.rawTrend90dPct,
    inputs.rawTrend180dPct,
  ].filter((value) => value != null).length;
  // Assigned to a variable (not passed as a literal) so the harness stays
  // tolerant of optional fields the scenario input may gain or drop.
  const scenarioInput = {
    marketMode: "raw" as const,
    currentPrice: inputs.currentPrice,
    currency: "EUR" as const,
    // Unknown at historical as-of points; null keeps the release-phase
    // penalties and uncertainty multipliers neutral.
    ageYears: null,
    opportunityScore: 50,
    sealedTrendPct: null,
    rawTrend30dPct: inputs.rawTrend30dPct,
    rawTrend90dPct: inputs.rawTrend90dPct,
    rawTrend180dPct: inputs.rawTrend180dPct,
    scarcityScore: 50,
    gemRatePct: null,
    riskScore: 0,
    // Each robust horizon acts as one evidence leg; with all three present
    // the price-only scenario reaches the same High confidence tier the
    // production model needs before its predictions are scored.
    evidenceCount,
    historyPoints: inputs.historyPoints,
    extendedHistory: inputs.extendedHistory,
  };
  return buildPriceScenario(scenarioInput);
}

/**
 * Slides as-of points across one card's daily EN-NM history, builds the
 * neutral-external scenario at each point and scores the +90d/+180d
 * predictions against the realized values.
 */
export function runCardBacktest(
  dailyHistory: readonly DailyMarketValue[],
  options: CardBacktestOptions = {}
): BacktestPrediction[] {
  const stepDays = options.stepDays ?? 14;
  const minPriorDays = options.minPriorDays ?? 240;
  const minFutureDays = options.minFutureDays ?? 180;
  const sorted = [...dailyHistory].sort(
    (left, right) => left.day.getTime() - right.day.getTime()
  );
  if (sorted.length === 0) return [];
  const firstTime = sorted[0].day.getTime();
  const lastTime = sorted[sorted.length - 1].day.getTime();

  const predictions: BacktestPrediction[] = [];
  let nextEligibleTime = -Infinity;
  for (let index = 0; index < sorted.length; index++) {
    const asOfTime = sorted[index].day.getTime();
    if (asOfTime - firstTime < minPriorDays * DAY_MS) continue;
    if (lastTime - asOfTime < minFutureDays * DAY_MS) break;
    if (asOfTime < nextEligibleTime) continue;
    nextEligibleTime = asOfTime + stepDays * DAY_MS;

    const inputs = buildBacktestInputsAt(sorted, index);
    if (!inputs) continue;
    const scenario = buildNeutralScenario(inputs);
    if (!scenario) continue;
    if (!options.includeLowConfidence && scenario.confidence === "Low") continue;
    const outlook: BacktestOutlook = scenario.outlook ?? "flat";
    const entryPrice = scenario.currentPrice;

    for (const horizonDays of [90, 180] as const) {
      const point = scenario.points.find((item) => item.days === horizonDays);
      if (!point) continue;
      const realizedPrice = realizedValueAround(sorted, asOfTime + horizonDays * DAY_MS);
      const realizedReturnPct =
        realizedPrice == null
          ? null
          : Number((((realizedPrice - entryPrice) / entryPrice) * 100).toFixed(2));
      const predictedBasePct = Number(
        (((point.base - entryPrice) / entryPrice) * 100).toFixed(2)
      );
      predictions.push({
        asOfDay: inputs.asOfDay.toISOString().slice(0, 10),
        horizonDays,
        entryPrice,
        confidence: scenario.confidence,
        outlook,
        predictedLow: point.low,
        predictedBase: point.base,
        predictedHigh: point.high,
        predictedBasePct,
        realizedPrice,
        realizedReturnPct,
        directionHit: backtestDirectionHit(outlook, realizedReturnPct),
        bandWithin:
          realizedPrice == null
            ? null
            : realizedPrice >= point.low && realizedPrice <= point.high,
        absErrorPct:
          realizedReturnPct == null
            ? null
            : Number(Math.abs(predictedBasePct - realizedReturnPct).toFixed(2)),
      });
    }
  }
  return predictions;
}

function meanOf(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

function rateOf(values: readonly boolean[]): number | null {
  if (values.length === 0) return null;
  return Number(
    (values.filter(Boolean).length / values.length).toFixed(3)
  );
}

/**
 * Aggregates per-card backtest results into a per-outlook scoreboard.
 * "samples" counts predictions with a realized outcome; the rates and means
 * are computed over those scored samples only.
 */
export function summarizeBacktest(
  cardResults: ReadonlyArray<readonly BacktestPrediction[]>
): BacktestSummary {
  const all = cardResults.flat();
  const scored = all.filter((prediction) => prediction.realizedReturnPct != null);
  const byOutlook = {} as Record<BacktestOutlook, BacktestOutlookSummary>;
  for (const outlook of OUTLOOK_CLASSES) {
    const group = scored.filter((prediction) => prediction.outlook === outlook);
    byOutlook[outlook] = {
      samples: group.length,
      directionHitRate: rateOf(
        group
          .map((prediction) => prediction.directionHit)
          .filter((value): value is boolean => value != null)
      ),
      bandCoverage: rateOf(
        group
          .map((prediction) => prediction.bandWithin)
          .filter((value): value is boolean => value != null)
      ),
      meanAbsErrorPct: meanOf(
        group
          .map((prediction) => prediction.absErrorPct)
          .filter((value): value is number => value != null)
      ),
      meanPredictedPct: meanOf(group.map((prediction) => prediction.predictedBasePct)),
      meanRealizedPct: meanOf(
        group
          .map((prediction) => prediction.realizedReturnPct)
          .filter((value): value is number => value != null)
      ),
    };
  }
  return {
    totalPredictions: all.length,
    scoredPredictions: scored.length,
    byOutlook,
  };
}
