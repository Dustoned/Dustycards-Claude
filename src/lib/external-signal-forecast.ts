export type SignalOutcomeStatus = "pending" | "complete" | "insufficient";

export interface SignalDailyPrice {
  observedAt: Date | string;
  value: number | null;
}

export interface EvaluatedSignalOutcome {
  status: SignalOutcomeStatus;
  observedDays: number;
  coverageRatio: number;
  maxReferencePrice: number | null;
  maxMultiplier: number | null;
  endReferencePrice: number | null;
  hit15x: boolean | null;
  hit2x: boolean | null;
  hit3x: boolean | null;
}

export interface WilsonInterval {
  estimate: number;
  lower: number;
  upper: number;
  width: number;
}

export interface ForecastPublishGate {
  targetMultiplier: 1.5 | 2 | 3;
  minimumSamples: number;
  minimumUniqueCards: number;
  minimumHits: number;
  maximumIntervalWidth: number;
}

export interface ForecastCohortSummary {
  status: "learning" | "calibrated";
  hits: number;
  samples: number;
  uniqueCards: number;
  interval: WilsonInterval | null;
  reason: string | null;
}

export const FORECAST_PUBLISH_GATES: readonly ForecastPublishGate[] = [
  {
    targetMultiplier: 1.5,
    minimumSamples: 50,
    minimumUniqueCards: 30,
    minimumHits: 5,
    maximumIntervalWidth: 0.2,
  },
  {
    targetMultiplier: 2,
    minimumSamples: 100,
    minimumUniqueCards: 60,
    minimumHits: 5,
    maximumIntervalWidth: 0.15,
  },
  {
    targetMultiplier: 3,
    minimumSamples: 200,
    minimumUniqueCards: 100,
    minimumHits: 5,
    maximumIntervalWidth: 0.1,
  },
] as const;

const DAY_MS = 24 * 60 * 60_000;
const MINIMUM_COVERAGE_RATIO = 0.6;
const FINAL_WINDOW_DAYS = 7;
const WILSON_80_Z = 1.28155;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function toUtcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isValidPrice(value: number | null): value is number {
  return value != null && Number.isFinite(value) && value > 0;
}

/**
 * Collapses repeat refreshes to the last observation of each UTC day. That
 * keeps a busy refresh day from counting as many independent confirmations.
 */
export function collapseSignalPricesByUtcDay(
  prices: readonly SignalDailyPrice[]
): Array<{ observedAt: Date; value: number }> {
  const byDay = new Map<string, { observedAt: Date; value: number }>();

  for (const item of prices) {
    if (!isValidPrice(item.value)) continue;
    const observedAt = item.observedAt instanceof Date ? item.observedAt : new Date(item.observedAt);
    if (!Number.isFinite(observedAt.getTime())) continue;
    const key = toUtcDayKey(observedAt);
    const current = byDay.get(key);
    if (!current || current.observedAt < observedAt) {
      byDay.set(key, { observedAt, value: item.value });
    }
  }

  return [...byDay.values()].sort(
    (left, right) => left.observedAt.getTime() - right.observedAt.getTime()
  );
}

function hasSustainedThreshold(
  prices: readonly { observedAt: Date; value: number }[],
  threshold: number
): boolean {
  const qualifying = prices.filter((item) => item.value >= threshold);
  for (let index = 0; index < qualifying.length - 1; index += 1) {
    const first = qualifying[index];
    const second = qualifying[index + 1];
    if (second.observedAt.getTime() - first.observedAt.getTime() <= FINAL_WINDOW_DAYS * DAY_MS) {
      return true;
    }
  }
  return false;
}

export function evaluateSignalOutcome(input: {
  entryPrice: number;
  entryAt: Date;
  horizonDays: number;
  prices: readonly SignalDailyPrice[];
  now?: Date;
}): EvaluatedSignalOutcome {
  const now = input.now ?? new Date();
  const horizonDays = Math.max(1, Math.floor(input.horizonDays));
  const horizonEndsAt = new Date(input.entryAt.getTime() + horizonDays * DAY_MS);
  const windowPrices = collapseSignalPricesByUtcDay(input.prices).filter(
    (item) => item.observedAt > input.entryAt && item.observedAt <= horizonEndsAt
  );
  const observedDays = windowPrices.length;
  const coverageRatio = clamp(observedDays / horizonDays, 0, 1);
  const maxReferencePrice = windowPrices.length
    ? Math.max(...windowPrices.map((item) => item.value))
    : null;
  const maxMultiplier =
    maxReferencePrice != null && isValidPrice(input.entryPrice)
      ? maxReferencePrice / input.entryPrice
      : null;
  const finalWindowStartsAt = new Date(horizonEndsAt.getTime() - FINAL_WINDOW_DAYS * DAY_MS);
  const finalWindowPrices = windowPrices.filter((item) => item.observedAt >= finalWindowStartsAt);
  const endReferencePrice = finalWindowPrices.at(-1)?.value ?? null;

  if (now < horizonEndsAt) {
    return {
      status: "pending",
      observedDays,
      coverageRatio,
      maxReferencePrice,
      maxMultiplier,
      endReferencePrice,
      hit15x: null,
      hit2x: null,
      hit3x: null,
    };
  }

  if (
    !isValidPrice(input.entryPrice) ||
    coverageRatio < MINIMUM_COVERAGE_RATIO ||
    finalWindowPrices.length === 0
  ) {
    return {
      status: "insufficient",
      observedDays,
      coverageRatio,
      maxReferencePrice,
      maxMultiplier,
      endReferencePrice,
      hit15x: null,
      hit2x: null,
      hit3x: null,
    };
  }

  return {
    status: "complete",
    observedDays,
    coverageRatio,
    maxReferencePrice,
    maxMultiplier,
    endReferencePrice,
    hit15x: hasSustainedThreshold(windowPrices, input.entryPrice * 1.5),
    hit2x: hasSustainedThreshold(windowPrices, input.entryPrice * 2),
    hit3x: hasSustainedThreshold(windowPrices, input.entryPrice * 3),
  };
}

export function calculateWilsonInterval(
  hits: number,
  samples: number,
  z = WILSON_80_Z
): WilsonInterval | null {
  if (!Number.isFinite(samples) || samples <= 0 || !Number.isFinite(hits)) return null;
  const n = Math.floor(samples);
  const k = clamp(Math.floor(hits), 0, n);
  const estimate = k / n;
  const zSquared = z * z;
  const denominator = 1 + zSquared / n;
  const center = (estimate + zSquared / (2 * n)) / denominator;
  const half =
    (z * Math.sqrt((estimate * (1 - estimate)) / n + zSquared / (4 * n * n))) /
    denominator;
  const lower = clamp(center - half, 0, 1);
  const upper = clamp(center + half, 0, 1);
  return { estimate, lower, upper, width: upper - lower };
}

export function summarizeForecastCohort(input: {
  targetMultiplier: 1.5 | 2 | 3;
  hits: number;
  samples: number;
  uniqueCards: number;
  holdoutSamples?: number;
  holdoutCalibrationError?: number | null;
}): ForecastCohortSummary {
  const gate = FORECAST_PUBLISH_GATES.find(
    (candidate) => candidate.targetMultiplier === input.targetMultiplier
  );
  if (!gate) throw new RangeError("Unsupported forecast target multiplier.");

  const hits = Math.max(0, Math.floor(input.hits));
  const samples = Math.max(0, Math.floor(input.samples));
  const uniqueCards = Math.max(0, Math.floor(input.uniqueCards));
  const interval = calculateWilsonInterval(hits, samples);
  const learningReason =
    samples < gate.minimumSamples
      ? `Needs ${gate.minimumSamples - samples} more completed comparable signals`
      : uniqueCards < gate.minimumUniqueCards
        ? `Needs ${gate.minimumUniqueCards - uniqueCards} more unique cards`
        : hits < gate.minimumHits
          ? `Needs ${gate.minimumHits - hits} more confirmed hits`
          : !interval || interval.width > gate.maximumIntervalWidth
            ? "The confidence range is still too wide"
            : (input.holdoutSamples ?? 0) < 30
              ? "The chronological validation set is still too small"
              : input.holdoutCalibrationError == null || input.holdoutCalibrationError > 0.1
                ? "The model has not passed its calibration check yet"
                : null;

  return {
    status: learningReason ? "learning" : "calibrated",
    hits,
    samples,
    uniqueCards,
    interval,
    reason: learningReason,
  };
}

export function getSignalPriceBand(price: number | null): string | null {
  if (!isValidPrice(price)) return null;
  if (price < 5) return "EUR 1-5";
  if (price < 25) return "EUR 5-25";
  if (price < 100) return "EUR 25-100";
  return "EUR 100+";
}
