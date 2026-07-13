const DAY_MS = 24 * 60 * 60 * 1_000;
const MIN_COMPLETE_DAYS = 7;
const MAX_READY_AGE_MS = 72 * 60 * 60 * 1_000;

export type EbayDemandSignalStatus =
  | "unavailable"
  | "learning"
  | "capped"
  | "stale"
  | "ready";

export interface EbayDemandSignalSnapshot {
  snapshotDate: Date;
  updatedAt: Date;
  capped: boolean;
  observedCount: number;
  cleanCount: number;
  activeCount: number;
  newCount: number;
  removedCount: number;
  medianAskEur: number | null;
  lowestAskEur: number | null;
}

export interface ExternalEbayDemandIntelligence {
  marketplaceId: string;
  status: EbayDemandSignalStatus;
  label: string;
  reason: string | null;
  scoreAdjustment: number;
  confidence: "None" | "Low" | "Medium";
  updatedAt: string | null;
  completeDays: number;
  observedCount: number;
  cleanCount: number;
  capped: boolean;
  activeCount: number | null;
  new7d: number;
  removed7d: number;
  removalPressure7d: number | null;
  baselinePressure: number | null;
  pressureChangePoints: number | null;
  inventoryChangePercent: number | null;
  medianAskEur: number | null;
  lowestAskEur: number | null;
  askVsMarketPercent: number | null;
  drivers: string[];
}

function round(value: number, precision = 1): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function utcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function pressureForSnapshots(snapshots: readonly EbayDemandSignalSnapshot[]): number | null {
  if (snapshots.length === 0) return null;
  const removed = snapshots.reduce((sum, snapshot) => sum + snapshot.removedCount, 0);
  const averageActive =
    snapshots.reduce((sum, snapshot) => sum + snapshot.activeCount, 0) / snapshots.length;
  const denominator = removed + averageActive;
  return denominator > 0 ? round((removed / denominator) * 100) : 0;
}

function baseResult(input: {
  marketplaceId: string;
  latest?: EbayDemandSignalSnapshot;
  status: EbayDemandSignalStatus;
  label: string;
  reason: string | null;
  completeDays: number;
}): ExternalEbayDemandIntelligence {
  return {
    marketplaceId: input.marketplaceId,
    status: input.status,
    label: input.label,
    reason: input.reason,
    scoreAdjustment: 0,
    confidence: "None",
    updatedAt: input.latest?.updatedAt.toISOString() ?? null,
    completeDays: input.completeDays,
    observedCount: input.latest?.observedCount ?? 0,
    cleanCount: input.latest?.cleanCount ?? 0,
    capped: input.latest?.capped ?? false,
    activeCount: input.latest?.activeCount ?? null,
    new7d: 0,
    removed7d: 0,
    removalPressure7d: null,
    baselinePressure: null,
    pressureChangePoints: null,
    inventoryChangePercent: null,
    medianAskEur: input.latest?.medianAskEur ?? null,
    lowestAskEur: input.latest?.lowestAskEur ?? null,
    askVsMarketPercent: null,
    drivers: [],
  };
}

/**
 * Converts strict raw NM-English eBay snapshots into a deliberately small
 * corroborating factor. A removed listing is not treated as a confirmed sale.
 * Capped, stale and short histories stay visible but are always score-neutral.
 */
export function deriveEbayDemandIntelligence(input: {
  marketplaceId: string;
  snapshots: readonly EbayDemandSignalSnapshot[];
  currentMarketPriceEur: number | null;
  now?: Date;
}): ExternalEbayDemandIntelligence {
  const now = input.now ?? new Date();
  const byDay = new Map<number, EbayDemandSignalSnapshot>();
  for (const snapshot of input.snapshots) {
    const day = utcDay(snapshot.snapshotDate).getTime();
    const existing = byDay.get(day);
    if (!existing || snapshot.updatedAt > existing.updatedAt) byDay.set(day, snapshot);
  }
  const ordered = [...byDay.values()].sort(
    (left, right) => left.snapshotDate.getTime() - right.snapshotDate.getTime()
  );
  const latest = ordered.at(-1);
  if (!latest) {
    return baseResult({
      marketplaceId: input.marketplaceId,
      status: "unavailable",
      label: "No eBay baseline",
      reason: null,
      completeDays: 0,
    });
  }

  const complete = ordered.filter((snapshot) => !snapshot.capped);
  if (latest.capped) {
    return baseResult({
      marketplaceId: input.marketplaceId,
      latest,
      status: "capped",
      label: "Capped eBay sample",
      reason: "The eBay result is a sample, so it does not change the Radar score.",
      completeDays: complete.length,
    });
  }
  if (now.getTime() - latest.updatedAt.getTime() > MAX_READY_AGE_MS) {
    return baseResult({
      marketplaceId: input.marketplaceId,
      latest,
      status: "stale",
      label: "eBay refresh due",
      reason: "The last complete eBay observation is too old to affect the Radar score.",
      completeDays: complete.length,
    });
  }
  if (complete.length < MIN_COMPLETE_DAYS) {
    return baseResult({
      marketplaceId: input.marketplaceId,
      latest,
      status: "learning",
      label: "Learning eBay demand",
      reason: `${complete.length}/${MIN_COMPLETE_DAYS} complete daily observations collected.`,
      completeDays: complete.length,
    });
  }

  const latestDay = utcDay(latest.snapshotDate).getTime();
  const recentStart = latestDay - 6 * DAY_MS;
  const priorStart = latestDay - 29 * DAY_MS;
  const recent = complete.filter((snapshot) => utcDay(snapshot.snapshotDate).getTime() >= recentStart);
  const prior = complete.filter((snapshot) => {
    const day = utcDay(snapshot.snapshotDate).getTime();
    return day >= priorStart && day < recentStart;
  });
  const new7d = recent.reduce((sum, snapshot) => sum + snapshot.newCount, 0);
  const removed7d = recent.reduce((sum, snapshot) => sum + snapshot.removedCount, 0);
  const removalPressure7d = pressureForSnapshots(recent);
  const baselinePressure = pressureForSnapshots(prior);
  const pressureChangePoints =
    removalPressure7d != null && baselinePressure != null
      ? round(removalPressure7d - baselinePressure)
      : null;
  const firstRecent = recent[0] ?? latest;
  const inventoryChangePercent =
    firstRecent.activeCount > 0
      ? round(((latest.activeCount - firstRecent.activeCount) / firstRecent.activeCount) * 100)
      : latest.activeCount > 0
        ? 100
        : 0;
  const askVsMarketPercent =
    latest.medianAskEur != null &&
    input.currentMarketPriceEur != null &&
    input.currentMarketPriceEur > 0
      ? round(
          ((latest.medianAskEur - input.currentMarketPriceEur) /
            input.currentMarketPriceEur) *
            100
        )
      : null;
  const activity = latest.activeCount + new7d + removed7d;

  if (recent.length < MIN_COMPLETE_DAYS || activity < 4) {
    const result = baseResult({
      marketplaceId: input.marketplaceId,
      latest,
      status: "learning",
      label: "Thin eBay sample",
      reason: "The complete NM-English sample is still too small to influence the score.",
      completeDays: complete.length,
    });
    return {
      ...result,
      new7d,
      removed7d,
      removalPressure7d,
      baselinePressure,
      pressureChangePoints,
      inventoryChangePercent,
      askVsMarketPercent,
    };
  }

  let adjustment = 0;
  if (removed7d >= 2 && removalPressure7d != null) {
    adjustment +=
      removalPressure7d >= 50
        ? 4
        : removalPressure7d >= 35
          ? 3
          : removalPressure7d >= 20
            ? 2
            : removalPressure7d >= 10
              ? 1
              : 0;
  }
  const netRemovals = removed7d - new7d;
  if (netRemovals >= 2) adjustment += Math.min(2, netRemovals / 2);
  if (netRemovals <= -2) {
    adjustment -= Math.min(3, Math.abs(netRemovals) / Math.max(2, latest.activeCount) * 2);
  }
  if (inventoryChangePercent <= -35) adjustment += 2;
  else if (inventoryChangePercent <= -15) adjustment += 1;
  else if (inventoryChangePercent >= 50) adjustment -= 2;
  else if (inventoryChangePercent >= 20) adjustment -= 1;
  if (pressureChangePoints != null && pressureChangePoints >= 15) adjustment += 1;
  else if (pressureChangePoints != null && pressureChangePoints <= -15) adjustment -= 1;
  // Asking prices are not sold prices. A materially lower median can challenge
  // the reference, but a high ask never creates an upside bonus by itself.
  if (askVsMarketPercent != null && askVsMarketPercent <= -35) adjustment -= 1;
  adjustment = Math.round(clamp(adjustment, -4, 6));

  const drivers = [
    removed7d > 0 || new7d > 0
      ? `${removed7d} removed vs ${new7d} new listing${new7d === 1 ? "" : "s"} over 7 days`
      : null,
    inventoryChangePercent !== 0
      ? `active NM-English supply ${inventoryChangePercent > 0 ? "+" : ""}${inventoryChangePercent.toFixed(0)}%`
      : null,
    pressureChangePoints != null && Math.abs(pressureChangePoints) >= 5
      ? `removal pressure ${pressureChangePoints > 0 ? "+" : ""}${pressureChangePoints.toFixed(0)} points vs baseline`
      : null,
    askVsMarketPercent != null && askVsMarketPercent <= -20
      ? `median eBay ask ${Math.abs(askVsMarketPercent).toFixed(0)}% below the NM-English reference`
      : null,
  ].filter((value): value is string => Boolean(value)).slice(0, 3);
  const label =
    adjustment >= 3
      ? "Demand tightening"
      : adjustment > 0
        ? "Demand support"
        : adjustment <= -3
          ? "Supply building"
          : adjustment < 0
            ? "Soft demand"
            : "Balanced eBay demand";

  return {
    marketplaceId: input.marketplaceId,
    status: "ready",
    label,
    reason: drivers[0] ?? "Complete eBay demand history is balanced.",
    scoreAdjustment: adjustment,
    confidence: complete.length >= 14 && activity >= 10 ? "Medium" : "Low",
    updatedAt: latest.updatedAt.toISOString(),
    completeDays: complete.length,
    observedCount: latest.observedCount,
    cleanCount: latest.cleanCount,
    capped: false,
    activeCount: latest.activeCount,
    new7d,
    removed7d,
    removalPressure7d,
    baselinePressure,
    pressureChangePoints,
    inventoryChangePercent,
    medianAskEur: latest.medianAskEur,
    lowestAskEur: latest.lowestAskEur,
    askVsMarketPercent,
    drivers,
  };
}
