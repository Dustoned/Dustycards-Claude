import type { PriceHistoryValuePoint } from "@/components/PriceHistoryPanel";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface BasePredictionPoint {
  days: number;
  base: number;
}

function timestampFor(point: PriceHistoryValuePoint): number | null {
  const timestamp = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(point.date)
      ? `${point.date}T12:00:00.000Z`
      : point.date
  ).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function dateKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

/**
 * Builds a base-only prediction series that shares one exact seam with the
 * latest observed market point. Low/high ranges intentionally stay out of the
 * chart so the forecast cannot be mistaken for measured history.
 */
export function buildAttachedBasePrediction(input: {
  history: PriceHistoryValuePoint[];
  currentPrice: number | null | undefined;
  points: BasePredictionPoint[];
  modelDate?: Date | string;
}): PriceHistoryValuePoint[] {
  const latestHistory = [...input.history]
    .filter(
      (point) =>
        point.value != null &&
        point.value > 0 &&
        point.value !== 9001 &&
        timestampFor(point) != null
    )
    .sort((left, right) => (timestampFor(left) ?? 0) - (timestampFor(right) ?? 0))
    .at(-1);
  const observedTimestamp = latestHistory ? timestampFor(latestHistory) : null;
  const parsedModelTimestamp = input.modelDate
    ? new Date(input.modelDate).getTime()
    : Date.now();
  const modelTimestamp = Number.isFinite(parsedModelTimestamp)
    ? Math.max(observedTimestamp ?? parsedModelTimestamp, parsedModelTimestamp)
    : observedTimestamp;
  const observedValue = latestHistory?.value ?? input.currentPrice ?? null;
  const modelValue = input.currentPrice ?? observedValue;

  if (
    modelTimestamp == null ||
    observedValue == null ||
    observedValue <= 0 ||
    modelValue == null ||
    modelValue <= 0
  ) return [];

  const future = input.points
    .filter(
      (point) =>
        Number.isFinite(point.days) &&
        point.days > 0 &&
        Number.isFinite(point.base) &&
        point.base > 0
    )
    .sort((left, right) => left.days - right.days)
    .map((point) => ({
      date: dateKey(modelTimestamp + point.days * DAY_MS),
      label: `${point.days}d`,
      value: point.base,
    }));

  const seam = {
    date: dateKey(observedTimestamp ?? modelTimestamp),
    label: latestHistory?.label || "Now",
    value: observedValue,
  };
  const modelAnchor = {
    date: dateKey(modelTimestamp),
    label: "Now",
    value: modelValue,
  };

  return [
    seam,
    ...(modelAnchor.date !== seam.date ? [modelAnchor] : []),
    ...future,
  ];
}
