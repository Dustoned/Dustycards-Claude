const DAY_MS = 86_400_000;

export interface PriceHistoryObservation {
  observedAt: Date;
  primaryValue: number | null | undefined;
  fallbackValues?: ReadonlyArray<number | null | undefined>;
}

export interface DailyMarketValue {
  day: Date;
  value: number;
}

export interface RobustPriceTrend {
  percent: number;
  startValue: number;
  endValue: number;
  spanDays: number;
  uniqueDays: number;
}

const MINIMUM_COVERAGE: Record<30 | 90 | 180, { spanDays: number; uniqueDays: number }> = {
  30: { spanDays: 21, uniqueDays: 8 },
  90: { spanDays: 60, uniqueDays: 12 },
  180: { spanDays: 120, uniqueDays: 18 },
};

function validMarketValue(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value) && value > 0 && value !== 9_001;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/**
 * Collapses refresh rows into one UTC-day market observation. A daily primary
 * value wins whenever it is present; fallback values are only used for a day
 * without a primary observation. This prevents repeated refreshes from
 * inflating history confidence.
 */
export function buildDailyMarketHistory(
  observations: readonly PriceHistoryObservation[]
): DailyMarketValue[] {
  const byDay = new Map<
    string,
    { timestamp: number; primary: number[]; fallback: number[] }
  >();

  for (const observation of observations) {
    const timestamp = observation.observedAt.getTime();
    if (!Number.isFinite(timestamp)) continue;
    const dayKey = observation.observedAt.toISOString().slice(0, 10);
    const bucket = byDay.get(dayKey) ?? {
      timestamp: Date.parse(`${dayKey}T00:00:00.000Z`),
      primary: [],
      fallback: [],
    };
    if (validMarketValue(observation.primaryValue)) {
      bucket.primary.push(observation.primaryValue);
    }
    for (const fallback of observation.fallbackValues ?? []) {
      if (validMarketValue(fallback)) bucket.fallback.push(fallback);
    }
    byDay.set(dayKey, bucket);
  }

  return [...byDay.values()]
    .map((bucket) => {
      const value = median(bucket.primary.length > 0 ? bucket.primary : bucket.fallback);
      return value == null
        ? null
        : { day: new Date(bucket.timestamp), value } satisfies DailyMarketValue;
    })
    .filter((point): point is DailyMarketValue => point != null)
    .sort((left, right) => left.day.getTime() - right.day.getTime());
}

/**
 * Calculates a horizon trend from daily observations with median-smoothed
 * endpoints. A horizon is returned only when both the calendar span and the
 * number of distinct observed days are sufficient.
 */
export function calculateRobustPriceTrend(
  dailyHistory: readonly DailyMarketValue[],
  horizonDays: 30 | 90 | 180
): RobustPriceTrend | null {
  const coverage = MINIMUM_COVERAGE[horizonDays];
  const valid = dailyHistory
    .filter((point) => Number.isFinite(point.day.getTime()) && validMarketValue(point.value))
    .sort((left, right) => left.day.getTime() - right.day.getTime());
  if (valid.length < coverage.uniqueDays) return null;

  const latestTimestamp = valid[valid.length - 1].day.getTime();
  const cutoff = latestTimestamp - horizonDays * DAY_MS;
  const withinHorizon = valid.filter((point) => point.day.getTime() >= cutoff);
  if (withinHorizon.length < coverage.uniqueDays) return null;

  const spanDays = Math.round(
    (latestTimestamp - withinHorizon[0].day.getTime()) / DAY_MS
  );
  if (spanDays < coverage.spanDays) return null;

  const endpointSize = Math.min(5, Math.max(2, Math.floor(withinHorizon.length / 4)));
  const startValue = median(withinHorizon.slice(0, endpointSize).map((point) => point.value));
  const endValue = median(withinHorizon.slice(-endpointSize).map((point) => point.value));
  if (startValue == null || endValue == null || startValue <= 0) return null;

  const percent = ((endValue - startValue) / startValue) * 100;
  if (!Number.isFinite(percent) || Math.abs(percent) > 300) return null;
  return {
    percent: Number(percent.toFixed(1)),
    startValue: Number(startValue.toFixed(2)),
    endValue: Number(endValue.toFixed(2)),
    spanDays,
    uniqueDays: withinHorizon.length,
  };
}
