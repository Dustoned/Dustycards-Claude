export type MoverPriceQualityStatus = "ok" | "thin_history" | "suspicious";
export type MoverMarketKind = "raw" | "graded" | "sealed";
export type RawMoverSourceKey = "cardmarket" | "tcgplayer";

export interface MoverPriceQuality {
  status: MoverPriceQualityStatus;
  reason: string | null;
}

export interface MoverWindowLike {
  change: number;
  changePct: number | null;
  coveredDays: number;
}

export interface BuildMoverScoresInput {
  kind: MoverMarketKind;
  currentPrice: number;
  change7d: MoverWindowLike | null;
  change30d: MoverWindowLike | null;
  changeSinceTrackedPct?: number | null;
  changeFromLowPct?: number | null;
  gapToPeakPct?: number | null;
  historyPoints: number;
  lifetimeHistoryPoints: number;
  rarityWeight?: number;
  cheapnessWeight?: number;
  ageWeight?: number;
  comparisonPrice?: number | null;
}

export interface BuiltMoverScores {
  movementScore: number;
  opportunityScore: number;
  rankingScore: number;
  priceQuality: MoverPriceQuality;
}

export function chooseRawMoverSource(input: {
  preferred: RawMoverSourceKey;
  available: Record<RawMoverSourceKey, boolean>;
}): RawMoverSourceKey | null {
  if (input.available[input.preferred]) {
    return input.preferred;
  }

  const fallback: RawMoverSourceKey =
    input.preferred === "cardmarket" ? "tcgplayer" : "cardmarket";
  return input.available[fallback] ? fallback : null;
}

function round(value: number, decimals = 2): number {
  return Number(value.toFixed(decimals));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getWindowBaseline(metric: MoverWindowLike | null): number | null {
  if (!metric) return null;
  const baseline = metric.changePct != null
    ? metric.change / (metric.changePct / 100)
    : null;

  if (baseline != null && Number.isFinite(baseline) && baseline > 0) {
    return baseline;
  }

  return null;
}

function getWorstRecentWindow(
  change7d: MoverWindowLike | null,
  change30d: MoverWindowLike | null
): MoverWindowLike | null {
  const windows = [change7d, change30d].filter(
    (metric): metric is MoverWindowLike => Boolean(metric)
  );
  if (windows.length === 0) return null;

  return [...windows].sort((a, b) => {
    const aPct = Math.abs(a.changePct ?? 0);
    const bPct = Math.abs(b.changePct ?? 0);
    if (aPct !== bPct) return bPct - aPct;
    return Math.abs(b.change) - Math.abs(a.change);
  })[0];
}

function isSuspiciousRecentMove(input: BuildMoverScoresInput): boolean {
  const worst = getWorstRecentWindow(input.change7d, input.change30d);
  if (!worst || worst.changePct == null) {
    return false;
  }

  const absPct = Math.abs(worst.changePct);
  const absChange = Math.abs(worst.change);
  const baseline = getWindowBaseline(worst);

  if (baseline != null && baseline < 1 && input.currentPrice >= 50 && absPct >= 500) {
    return true;
  }

  if (absPct >= 1000 && absChange >= 25) {
    return true;
  }

  if (absPct >= 400 && absChange >= 100 && input.historyPoints < 6) {
    return true;
  }

  if (input.kind === "raw" && input.comparisonPrice != null && input.comparisonPrice >= 10) {
    const high = Math.max(input.currentPrice, input.comparisonPrice);
    const low = Math.min(input.currentPrice, input.comparisonPrice);
    if (high >= 500 && high / low >= 5 && absPct >= 120) {
      return true;
    }

    if (high >= 1000 && high / low >= 4 && absChange >= 1000 && absPct >= 60) {
      return true;
    }

    if (
      input.currentPrice < input.comparisonPrice &&
      input.comparisonPrice >= 5000 &&
      absChange >= 3000 &&
      absPct >= 50
    ) {
      return true;
    }
  }

  return false;
}

function buildPriceQuality(input: BuildMoverScoresInput): MoverPriceQuality {
  if (isSuspiciousRecentMove(input)) {
    return {
      status: "suspicious",
      reason: "Outlier ignored",
    };
  }

  if (input.historyPoints < 3 || input.lifetimeHistoryPoints < 3) {
    return {
      status: "thin_history",
      reason: "Thin history",
    };
  }

  return {
    status: "ok",
    reason: null,
  };
}

function getPercentCap(kind: MoverMarketKind): number {
  if (kind === "sealed") return 95;
  if (kind === "graded") return 130;
  return 120;
}

function getMovementScoreForWindow(
  metric: MoverWindowLike | null,
  kind: MoverMarketKind,
  desiredDays: number,
  pctWeight: number,
  absWeight: number
): number {
  if (!metric || metric.changePct == null) return 0;

  const coverage = clamp(metric.coveredDays / desiredDays, 0.25, 1);
  const cap = getPercentCap(kind);
  const pctComponent = clamp(metric.changePct, -85, cap) * pctWeight * coverage;
  const absoluteComponent =
    Math.sign(metric.change) * Math.log1p(Math.abs(metric.change)) * absWeight * coverage;

  return pctComponent + absoluteComponent;
}

function getOpportunityPriceCap(kind: MoverMarketKind): number {
  if (kind === "sealed") return 300;
  if (kind === "graded") return 0;
  return 120;
}

function getPriceOpportunity(currentPrice: number, kind: MoverMarketKind): number {
  if (kind === "graded") return 0;

  if (kind === "sealed") {
    if (currentPrice <= 35) return 13;
    if (currentPrice <= 75) return 11;
    if (currentPrice <= 150) return 7;
    if (currentPrice <= 300) return 4;
    return 0;
  }

  if (currentPrice <= 1) return 1;
  if (currentPrice <= 3) return 10;
  if (currentPrice <= 5) return 14;
  if (currentPrice <= 10) return 13;
  if (currentPrice <= 25) return 9;
  if (currentPrice <= 60) return 5;
  if (currentPrice <= 120) return 2;
  return 0;
}

function getOlderValueOpportunity(input: BuildMoverScoresInput): number {
  if (input.kind === "sealed") return 0;

  const ageWeight = clamp(input.ageWeight ?? 1, 1, 1.35);
  if (ageWeight <= 1.01) return 0;

  const priceCap = input.kind === "graded" ? 180 : 80;
  if (input.currentPrice > priceCap) return 0;

  const ageFactor = clamp((ageWeight - 1) / 0.35, 0, 1);
  const cheapFactor = clamp(((input.cheapnessWeight ?? 1) - 0.8) / 0.75, 0, 1);
  const maxOpportunity = input.kind === "graded" ? 8 : 10;

  return round(maxOpportunity * ageFactor * (0.45 + cheapFactor * 0.55), 2);
}

function buildOpportunityScore(input: BuildMoverScoresInput): number {
  const priceCap = getOpportunityPriceCap(input.kind);
  if (priceCap > 0 && input.currentPrice > priceCap) {
    return 0;
  }

  const priceOpportunity = getPriceOpportunity(input.currentPrice, input.kind);
  const offPeakOpportunity =
    input.gapToPeakPct != null && input.gapToPeakPct <= -20
      ? clamp(Math.abs(input.gapToPeakPct), 0, 65) * 0.08
      : 0;
  const reboundOpportunity =
    input.changeFromLowPct != null
      ? clamp(input.changeFromLowPct, 0, input.kind === "sealed" ? 80 : 100) * 0.025
      : 0;
  const olderValueOpportunity = getOlderValueOpportunity(input);

  return round(priceOpportunity + offPeakOpportunity + reboundOpportunity + olderValueOpportunity, 2);
}

export function buildMoverScores(input: BuildMoverScoresInput): BuiltMoverScores {
  const priceQuality = buildPriceQuality(input);

  if (priceQuality.status === "suspicious") {
    return {
      movementScore: 0,
      opportunityScore: 0,
      rankingScore: 0,
      priceQuality,
    };
  }

  const movementScore = round(
    getMovementScoreForWindow(input.change7d, input.kind, 7, 0.58, 1.5) +
      getMovementScoreForWindow(input.change30d, input.kind, 30, 0.34, 0.9)
  );
  const opportunityScore = buildOpportunityScore(input);
  const qualityMultiplier = priceQuality.status === "thin_history" ? 0.55 : 1;
  const rarityMultiplier = clamp(input.rarityWeight ?? 1, 0.75, 1.7);
  const lifetimeNudge =
    input.kind === "sealed"
      ? clamp(input.changeSinceTrackedPct ?? 0, -25, 80) * 0.015
      : clamp(input.changeSinceTrackedPct ?? 0, -60, 120) * 0.035;
  const rankingScore = round(
    Math.max(0, movementScore) * rarityMultiplier * qualityMultiplier +
      opportunityScore * rarityMultiplier * qualityMultiplier +
      lifetimeNudge * qualityMultiplier
  );

  return {
    movementScore,
    opportunityScore,
    rankingScore,
    priceQuality,
  };
}
