import type { SealedModalProductData } from "@/components/sealed-modal/types";
import type { SealedCategory } from "@/lib/sealed-products";
import type { SetLifecycleStatus } from "@/lib/set-lifecycle-core";

export type SealedSignalHistoryStatus = "established" | "building" | "learning";
export type SealedSignalConfidence = "High" | "Medium" | "Emerging";
export type SealedSignalPressure = "Breakout" | "Strong" | "Watch";

export interface SealedSignalRadarScoreInput {
  currentPrice: number;
  category: SealedCategory;
  trend30dPct: number | null;
  trend90dPct: number | null;
  historyDays: number;
  historySpanDays: number;
  gapToPeakPct: number | null;
  changeFromLowPct: number | null;
  volatilityDaily90Pct: number | null;
  releaseAgeDays: number | null;
  staleDays: number;
  lifecycleStatus: SetLifecycleStatus | null;
  lifecycleConfidence: number | null;
  lifecycleOopProbability: number | null;
}

export interface SealedSignalRadarScore {
  score: number;
  pressureLabel: SealedSignalPressure;
  confidence: SealedSignalConfidence;
  historyStatus: SealedSignalHistoryStatus;
  outlook: "strong_up" | "modest_up" | "flat" | "down";
  reasons: string[];
  riskLabel: string | null;
}

export interface SealedSignalRadarItem extends SealedSignalRadarScore {
  rank: number;
  productId: string;
  game: string;
  name: string;
  imageUrl: string | null;
  episodeId: string;
  episodeName: string;
  episodeCode: string | null;
  category: SealedCategory;
  categoryLabel: string;
  currentPrice: number;
  currency: "EUR";
  latestObservedAt: string;
  trend30dPct: number | null;
  trend90dPct: number | null;
  historyDays: number;
  historySpanDays: number;
  gapToPeakPct: number | null;
  changeFromLowPct: number | null;
  lifecycleStatus: SetLifecycleStatus | null;
  lifecycleLabel: string | null;
  lifecycleConfidence: number | null;
  modalProduct: SealedModalProductData;
}

export interface SealedSignalRadarData {
  generatedAt: string;
  items: SealedSignalRadarItem[];
  trackedProducts: number;
  eligibleProducts: number;
  establishedProducts: number;
  buildingProducts: number;
  learningProducts: number;
  ready90dProducts: number;
  updatedAt: string | null;
}

const LIFECYCLE_LABELS: Record<SetLifecycleStatus, string> = {
  upcoming: "Upcoming",
  launch_window: "Launch window",
  actively_supplied: "Actively supplied",
  supply_tightening: "Supply tightening",
  likely_out_of_print: "Likely out of print",
  confirmed_out_of_print: "Confirmed out of print",
  reprint_restock: "Reprint / restock",
  unknown_historical: "Lifecycle learning",
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function signedDeadband(value: number | null, deadband: number): number {
  if (value == null || Math.abs(value) < deadband) return 0;
  return value;
}

function historyStatus(input: SealedSignalRadarScoreInput): SealedSignalHistoryStatus {
  if (input.trend90dPct != null && input.historyDays >= 12 && input.historySpanDays >= 60) {
    return "established";
  }
  if (input.trend30dPct != null && input.historyDays >= 8 && input.historySpanDays >= 21) {
    return "building";
  }
  return "learning";
}

function lifecycleContribution(input: SealedSignalRadarScoreInput): number {
  if ((input.lifecycleConfidence ?? 0) < 45) return 0;
  switch (input.lifecycleStatus) {
    case "confirmed_out_of_print":
      return 14;
    case "likely_out_of_print":
      return 10;
    case "supply_tightening":
      return 7;
    case "actively_supplied":
      return -2;
    case "reprint_restock":
      return -14;
    case "launch_window":
      return -4;
    case "upcoming":
      return -6;
    default:
      return 0;
  }
}

function categoryContribution(category: SealedCategory): number {
  if (category === "booster_box") return 6;
  if (category === "elite_trainer_box") return 5;
  if (
    category === "booster_bundle" ||
    category === "ultra_premium_collection" ||
    category === "super_premium_collection"
  ) return 4;
  if (
    category === "premium_collection" ||
    category === "special_collection" ||
    category === "collection" ||
    category === "tin" ||
    category === "mini_tin"
  ) return 2;
  return 0;
}

function priceContribution(price: number): number {
  if (price <= 40) return 5;
  if (price <= 100) return 4;
  if (price <= 250) return 2;
  return 0;
}

function formatTrend(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function getSealedLifecycleLabel(status: SetLifecycleStatus | null): string | null {
  return status ? LIFECYCLE_LABELS[status] : null;
}

/**
 * Scores sealed products separately from singles. Thin histories stay visible
 * as learning candidates, but hard caps prevent them from outranking products
 * with trustworthy 30/90-day evidence. Price alone never creates a signal.
 */
export function buildSealedSignalRadarScore(
  input: SealedSignalRadarScoreInput
): SealedSignalRadarScore {
  const history = historyStatus(input);
  const momentum30 = clamp(signedDeadband(input.trend30dPct, 2) * 0.55, -14, 22);
  const momentum90 = clamp(signedDeadband(input.trend90dPct, 2.5) * 0.35, -12, 18);
  const confirmingTrend =
    input.trend30dPct != null &&
    input.trend90dPct != null &&
    input.trend30dPct >= 3 &&
    input.trend90dPct >= 3
      ? 6
      : input.trend90dPct != null && input.trend90dPct >= 3 && (input.trend30dPct ?? 0) >= -2
        ? 3
        : 0;
  const lifecycle = lifecycleContribution(input);
  const oopProbability =
    (input.lifecycleConfidence ?? 0) >= 45 && input.lifecycleOopProbability != null
      ? clamp((input.lifecycleOopProbability - 50) * 0.06, -3, 3)
      : 0;
  const ageContribution =
    input.releaseAgeDays == null
      ? 0
      : input.releaseAgeDays >= 3 * 365
        ? 6
        : input.releaseAgeDays >= 18 * 30
          ? 4
          : input.releaseAgeDays < 180
            ? -3
            : 0;
  const pullbackContribution =
    input.gapToPeakPct != null &&
    input.gapToPeakPct <= -10 &&
    input.gapToPeakPct >= -40 &&
    (input.trend90dPct ?? input.trend30dPct ?? 0) > 0
      ? 4
      : 0;
  const hotMovePenalty =
    (input.trend30dPct ?? 0) >= 35 && (input.gapToPeakPct ?? 0) > -5
      ? clamp(((input.trend30dPct ?? 35) - 35) * 0.25 + 4, 4, 12)
      : 0;
  const volatilityPenalty =
    input.volatilityDaily90Pct != null && input.volatilityDaily90Pct > 8
      ? clamp((input.volatilityDaily90Pct - 8) * 0.7, 0, 8)
      : 0;
  const stalePenalty = input.staleDays > 7 ? 10 : input.staleDays > 3 ? 4 : 0;
  const historyContribution = history === "established" ? 8 : history === "building" ? 2 : -5;

  let score =
    42 +
    momentum30 +
    momentum90 +
    confirmingTrend +
    lifecycle +
    oopProbability +
    ageContribution +
    pullbackContribution +
    categoryContribution(input.category) +
    priceContribution(input.currentPrice) +
    historyContribution -
    hotMovePenalty -
    volatilityPenalty -
    stalePenalty;
  if (history === "learning") score = Math.min(score, 58);
  if (history === "building") score = Math.min(score, 75);
  if (input.staleDays > 7) score = Math.min(score, 61);
  else if (input.staleDays > 3) score = Math.min(score, 77);
  score = Math.round(clamp(score, 0, 100));

  const pressureLabel: SealedSignalPressure =
    score >= 78 ? "Breakout" : score >= 62 ? "Strong" : "Watch";
  const confidence: SealedSignalConfidence =
    history === "established" && input.staleDays <= 3 && volatilityPenalty === 0
      ? "High"
      : history === "learning" || input.staleDays > 7
        ? "Emerging"
        : "Medium";
  const netTrend = (input.trend30dPct ?? 0) * 0.6 + (input.trend90dPct ?? 0) * 0.4;
  const outlook =
    netTrend >= 12 && lifecycle >= 0
      ? "strong_up"
      : netTrend >= 3 && lifecycle > -10
        ? "modest_up"
        : netTrend <= -5 || lifecycle <= -10
          ? "down"
          : "flat";
  const lifecycleLabel = getSealedLifecycleLabel(input.lifecycleStatus);
  const reasons = [
    input.trend30dPct != null || input.trend90dPct != null
      ? `${input.trend30dPct != null ? `30d ${formatTrend(input.trend30dPct)}` : "30d learning"} · ${input.trend90dPct != null ? `90d ${formatTrend(input.trend90dPct)}` : "90d learning"}`
      : `Price history is still building (${input.historyDays} observed days)`,
    lifecycleLabel && (input.lifecycleConfidence ?? 0) >= 45
      ? `${lifecycleLabel}${input.lifecycleOopProbability != null ? ` · ${Math.round(input.lifecycleOopProbability)}% OOP likelihood` : ""}`
      : "Set lifecycle evidence is still building",
    history === "established"
      ? `${input.historyDays} price days across ${input.historySpanDays} days`
      : history === "building"
        ? `30-day evidence ready · ${input.historyDays} observed days`
        : `Learning mode · ${input.historyDays} observed price days`,
  ];
  const riskLabel =
    stalePenalty >= 10
      ? "Price update overdue"
      : hotMovePenalty > 0
        ? "Recent move may be overheated"
        : volatilityPenalty > 0
          ? "Volatile price history"
          : input.lifecycleStatus === "reprint_restock" && (input.lifecycleConfidence ?? 0) >= 45
            ? "Reprint / restock pressure"
            : null;

  return {
    score,
    pressureLabel,
    confidence,
    historyStatus: history,
    outlook,
    reasons,
    riskLabel,
  };
}
