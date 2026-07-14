export type SetLifecycleStatus =
  | "upcoming"
  | "launch_window"
  | "actively_supplied"
  | "supply_tightening"
  | "likely_out_of_print"
  | "confirmed_out_of_print"
  | "reprint_restock"
  | "unknown_historical";

export type SetLifecycleConfidence = "low" | "medium" | "high";

export interface SetLifecycleAssessmentInput {
  /** Date on which the assessment is made. Defaults to now. */
  asOf?: Date | string;
  /** Original set release date. */
  releaseDate?: Date | string | null;
  /** Most recent product release tied to this set, if later than the set itself. */
  latestProductReleaseDate?: Date | string | null;
  /** Only this flag is allowed to produce confirmed_out_of_print. */
  officialExplicitOop?: boolean;
  /** Credible but non-official evidence that printing or distribution has ended. */
  explicitOopEvidence?: boolean;
  /** Verified set-level availability contraction from a real supply source. */
  explicitSupplyContraction?: boolean;
  /** A reprint or meaningful restock observed recently. */
  recentReprintOrRestock?: boolean;
  reprintOrRestockObservedAt?: Date | string | null;
  /** Date of the newest set-level supply observation. */
  supplyDataAsOf?: Date | string | null;
  /** Number of distinct set-level supply observations, not individual price points. */
  observationCount?: number;
  /** Products currently observed for sale through the monitored sources. */
  activeProductCount?: number | null;
  /** Products with usable current market data. */
  pricedProductCount?: number | null;
  /** Known sealed products tied to the set. */
  totalProductCount?: number | null;
  /** Change in observed available supply; negative means contraction. */
  supplyChange90dPct?: number | null;
  /** Consecutive observations that showed supply contraction. */
  consecutiveSupplyContractionObservations?: number;
  /** Set-level sealed price changes. Price is supporting context, never OOP proof. */
  priceTrend30dPct?: number | null;
  priceTrend90dPct?: number | null;
}

export interface SetLifecycleAssessment {
  status: SetLifecycleStatus;
  label: string;
  summary: string;
  reasons: string[];
  oopProbability: number;
  confidence: number;
  confidenceLabel: SetLifecycleConfidence;
  ageDays: number | null;
  supplyDataFresh: boolean;
  modelVersion: 1;
}

const DAY_MS = 24 * 60 * 60 * 1_000;
const LAUNCH_WINDOW_DAYS = 365;
const MIN_LIKELY_OOP_AGE_DAYS = 3 * 365;
const MIN_SUPPORT_AGE_DAYS = 18 * 30;
const FRESH_SUPPLY_DAYS = 60;
const RECENT_REPRINT_DAYS = 180;
const MIN_OBSERVATIONS = 3;

function parseDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function daysBetween(later: Date, earlier: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / DAY_MS);
}

function finiteOrNull(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) ? value : null;
}

function nonNegativeInteger(value: number | null | undefined): number {
  return Math.max(0, Math.floor(finiteOrNull(value) ?? 0));
}

function clampScore(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)));
}

function confidenceLabel(confidence: number): SetLifecycleConfidence {
  return confidence >= 75 ? "high" : confidence >= 45 ? "medium" : "low";
}

function labelForStatus(status: SetLifecycleStatus): string {
  switch (status) {
    case "upcoming":
      return "Upcoming";
    case "launch_window":
      return "Launch window";
    case "actively_supplied":
      return "Actively supplied";
    case "supply_tightening":
      return "Supply tightening";
    case "likely_out_of_print":
      return "Likely out of print";
    case "confirmed_out_of_print":
      return "Confirmed out of print";
    case "reprint_restock":
      return "Reprint / restock";
    case "unknown_historical":
      return "Historical status unknown";
  }
}

function buildAssessment(
  status: SetLifecycleStatus,
  summary: string,
  reasons: string[],
  oopProbability: number,
  confidence: number,
  ageDays: number | null,
  supplyDataFresh: boolean
): SetLifecycleAssessment {
  const normalizedConfidence = clampScore(confidence);
  return {
    status,
    label: labelForStatus(status),
    summary,
    reasons: [...new Set(reasons)].slice(0, 5),
    oopProbability: clampScore(oopProbability),
    confidence: normalizedConfidence,
    confidenceLabel: confidenceLabel(normalizedConfidence),
    ageDays,
    supplyDataFresh,
    modelVersion: 1,
  };
}

/**
 * Assesses a set's printing/supply lifecycle from set-level observations.
 *
 * The result is deliberately conservative. Price appreciation can support an
 * assessment, but it cannot establish out-of-print status. A likely OOP result
 * needs an old set, recent supply data, repeated observations and either a
 * credible explicit signal or measured supply contraction.
 */
export function assessSetLifecycle(
  input: SetLifecycleAssessmentInput
): SetLifecycleAssessment {
  const asOf = parseDate(input.asOf) ?? new Date();
  const releaseDate = parseDate(input.releaseDate);
  const latestProductReleaseDate = parseDate(input.latestProductReleaseDate);
  const supplyDataAsOf = parseDate(input.supplyDataAsOf);
  const reprintObservedAt = parseDate(input.reprintOrRestockObservedAt);
  const ageDays = releaseDate == null ? null : daysBetween(asOf, releaseDate);
  const supportAgeDays = latestProductReleaseDate == null
    ? ageDays
    : daysBetween(asOf, latestProductReleaseDate);
  const supplyAgeDays = supplyDataAsOf == null ? null : daysBetween(asOf, supplyDataAsOf);
  const observationCount = nonNegativeInteger(input.observationCount);
  const activeProductCount = finiteOrNull(input.activeProductCount);
  const pricedProductCount = finiteOrNull(input.pricedProductCount);
  const totalProductCount = finiteOrNull(input.totalProductCount);
  const supplyChange90dPct = finiteOrNull(input.supplyChange90dPct);
  const contractionStreak = nonNegativeInteger(
    input.consecutiveSupplyContractionObservations
  );
  const hasSupplyMeasurement =
    activeProductCount != null ||
    supplyChange90dPct != null ||
    input.explicitSupplyContraction === true;
  const supplyDataFresh =
    hasSupplyMeasurement &&
    supplyAgeDays != null &&
    supplyAgeDays >= 0 &&
    supplyAgeDays <= FRESH_SUPPLY_DAYS;
  const recentReprint =
    input.recentReprintOrRestock === true ||
    (reprintObservedAt != null &&
      daysBetween(asOf, reprintObservedAt) >= 0 &&
      daysBetween(asOf, reprintObservedAt) <= RECENT_REPRINT_DAYS);

  const activeRatio =
    activeProductCount != null && totalProductCount != null && totalProductCount > 0
      ? Math.min(1, Math.max(0, activeProductCount / totalProductCount))
      : null;
  const pricedRatio =
    pricedProductCount != null && totalProductCount != null && totalProductCount > 0
      ? Math.min(1, Math.max(0, pricedProductCount / totalProductCount))
      : null;
  const measuredContraction =
    supplyChange90dPct != null && supplyChange90dPct <= -15 && contractionStreak >= 2;
  const contractionEvidence =
    input.explicitOopEvidence === true ||
    input.explicitSupplyContraction === true ||
    measuredContraction;

  let confidence = 8;
  if (releaseDate != null) confidence += 20;
  if (latestProductReleaseDate != null) confidence += 5;
  if (supplyDataFresh) confidence += 25;
  if (observationCount >= MIN_OBSERVATIONS) confidence += 20;
  else if (observationCount > 0) confidence += observationCount * 4;
  if (pricedRatio != null) confidence += Math.round(pricedRatio * 12);
  if (activeRatio != null) confidence += 5;
  if (input.explicitOopEvidence) confidence += 8;
  if (recentReprint) confidence += 10;

  if (recentReprint) {
    return buildAssessment(
      "reprint_restock",
      "A recent reprint or restock resets the out-of-print watch.",
      [
        "Recent reprint or meaningful restock observed",
        "Fresh supply takes priority over older scarcity signals",
      ],
      4,
      Math.max(confidence, 70),
      ageDays,
      supplyDataFresh
    );
  }

  if (input.officialExplicitOop === true) {
    return buildAssessment(
      "confirmed_out_of_print",
      "An authoritative source explicitly says production has ended.",
      ["Official out-of-print statement found"],
      100,
      100,
      ageDays,
      supplyDataFresh
    );
  }

  if (ageDays != null && ageDays < 0) {
    return buildAssessment(
      "upcoming",
      "This set has not reached its announced release date.",
      ["Release date is still upcoming"],
      0,
      Math.max(confidence, 75),
      ageDays,
      supplyDataFresh
    );
  }

  if (ageDays != null && ageDays <= LAUNCH_WINDOW_DAYS) {
    return buildAssessment(
      "launch_window",
      "Launch supply is still settling; out-of-print conclusions are premature.",
      [
        "Set is within its first year",
        contractionEvidence
          ? "Early supply movement is treated as launch volatility"
          : "No mature supply cycle exists yet",
      ],
      Math.min(8, ageDays <= 90 ? 2 : 8),
      Math.max(confidence, 65),
      ageDays,
      supplyDataFresh
    );
  }

  let oopProbability = 12;
  if (ageDays == null) oopProbability = 10;
  else if (ageDays < 2 * 365) oopProbability = 16;
  else if (ageDays < 3 * 365) oopProbability = 28;
  else if (ageDays < 5 * 365) oopProbability = 43;
  else if (ageDays < 8 * 365) oopProbability = 56;
  else oopProbability = 68;

  const reasons: string[] = [];
  if (ageDays != null) {
    reasons.push(`Set is ${Math.max(1, Math.round(ageDays / 365))} years old`);
  }

  if (supportAgeDays != null && supportAgeDays < MIN_SUPPORT_AGE_DAYS) {
    oopProbability -= 25;
    reasons.push("A recent set-linked product extends active supply support");
  } else if (supportAgeDays != null && supportAgeDays < 2 * 365) {
    oopProbability -= 12;
    reasons.push("Set-linked products were released within the last two years");
  }

  if (activeRatio != null) {
    if (activeRatio >= 0.6) {
      oopProbability -= 20;
      reasons.push("Most known products remain actively available");
    } else if (activeRatio >= 0.35) {
      oopProbability -= 10;
      reasons.push("A meaningful share of products remains available");
    } else if (activeRatio <= 0.15) {
      oopProbability += 14;
      reasons.push("Very few known products remain available");
    } else {
      oopProbability += 7;
      reasons.push("Observed product availability is limited");
    }
  }

  if (supplyChange90dPct != null) {
    if (supplyChange90dPct <= -50) oopProbability += 20;
    else if (supplyChange90dPct <= -30) oopProbability += 15;
    else if (supplyChange90dPct <= -15) oopProbability += 8;
    else if (supplyChange90dPct >= 20) oopProbability -= 14;

    if (supplyChange90dPct <= -15) {
      reasons.push(`Observed supply contracted ${Math.abs(supplyChange90dPct).toFixed(0)}% in 90 days`);
    } else if (supplyChange90dPct >= 20) {
      reasons.push("Observed supply expanded in the last 90 days");
    }
  }

  if (contractionStreak >= 3) {
    oopProbability += 8;
    reasons.push("Supply tightened across multiple observations");
  }
  if (input.explicitSupplyContraction) {
    oopProbability += 10;
    reasons.push("A verified supply source shows contracting availability");
  }
  if (input.explicitOopEvidence) {
    oopProbability += 24;
    reasons.push("A credible source reports that supply or printing has ended");
  }

  // Price can modestly strengthen an already supply-backed pattern. It is never
  // considered contraction evidence and cannot unlock an OOP classification.
  const priceTrend = finiteOrNull(input.priceTrend90dPct) ?? finiteOrNull(input.priceTrend30dPct);
  if (priceTrend != null && contractionEvidence) {
    if (priceTrend >= 20) {
      oopProbability += 5;
      reasons.push("Sealed prices rose alongside the supply contraction");
    } else if (priceTrend <= -15) {
      oopProbability -= 5;
      reasons.push("Falling sealed prices weaken the supply signal");
    }
  }

  oopProbability = clampScore(oopProbability);
  const oldEnoughForLikelyOop =
    ageDays != null &&
    ageDays >= MIN_LIKELY_OOP_AGE_DAYS &&
    (supportAgeDays == null || supportAgeDays >= MIN_SUPPORT_AGE_DAYS);
  const enoughEvidence = observationCount >= MIN_OBSERVATIONS;

  if (
    oldEnoughForLikelyOop &&
    supplyDataFresh &&
    enoughEvidence &&
    contractionEvidence &&
    oopProbability >= 65
  ) {
    return buildAssessment(
      "likely_out_of_print",
      "Repeated, recent supply evidence indicates that normal distribution has likely ended.",
      reasons,
      oopProbability,
      confidence,
      ageDays,
      supplyDataFresh
    );
  }

  const isHistorical = ageDays == null || ageDays >= 2 * 365;
  if (isHistorical && (!supplyDataFresh || !enoughEvidence || !hasSupplyMeasurement)) {
    const missingReasons = [
      !hasSupplyMeasurement
        ? "No measured product-availability or listing-supply evidence"
        : !supplyDataFresh
          ? "No recent set-level supply observation"
          : null,
      !enoughEvidence ? `Only ${observationCount} comparable supply observations` : null,
      "Price movement alone cannot establish out-of-print status",
    ].filter((value): value is string => value != null);
    return buildAssessment(
      "unknown_historical",
      "There is not enough current supply evidence to classify this historical set safely.",
      missingReasons,
      Math.min(oopProbability, 54),
      Math.min(confidence, 39),
      ageDays,
      supplyDataFresh
    );
  }

  if (contractionEvidence && supplyDataFresh) {
    return buildAssessment(
      "supply_tightening",
      "Available supply is tightening, but the out-of-print threshold has not been met.",
      reasons,
      Math.min(oopProbability, 64),
      confidence,
      ageDays,
      supplyDataFresh
    );
  }

  return buildAssessment(
    "actively_supplied",
    "Current evidence still points to an active or broadly available supply cycle.",
    reasons.length > 0 ? reasons : ["No sustained supply contraction is established"],
    Math.min(oopProbability, 44),
    confidence,
    ageDays,
    supplyDataFresh
  );
}
