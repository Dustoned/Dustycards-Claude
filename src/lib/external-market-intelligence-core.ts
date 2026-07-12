import type {
  ExternalGradedIntelligence,
  ExternalGoldMineConfluence,
  ExternalMarketMode,
  ExternalPriceScenario,
  ExternalScarcityIntelligence,
  ExternalSealedIntelligence,
} from "@/lib/external-signal-radar";

const SCENARIO_DAYS = [30, 90, 180] as const;

export function clampMarketScore(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)));
}

function roundMoney(value: number): number {
  return Number(value.toFixed(value >= 100 ? 0 : 2));
}

export function percentChange(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || previous <= 0) return null;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

export function classifySealedProduct(name: string): "pack" | "box" | "other" {
  const normalized = name.toLowerCase();
  if (/\b(?:booster box|booster display|display box)\b/.test(normalized)) return "box";
  if (
    /\b(?:booster pack|sleeved booster|single booster|checklane blister|blister pack)\b/.test(
      normalized
    ) &&
    !/\b(?:box|bundle|display|case|collection|tin|elite trainer|etb)\b/.test(normalized)
  ) {
    return "pack";
  }
  return "other";
}

export function calculateSealedPressure(input: {
  ageYears: number | null;
  packPrice: number | null;
  rawCardPrice: number | null;
  trend30dPct: number | null;
  trend90dPct: number | null;
  packProductCount: number;
  hasReprintRisk: boolean;
}): Pick<ExternalSealedIntelligence, "pressureScore" | "pressureLabel"> {
  const ageScore =
    input.ageYears == null ? 0 : Math.min(30, Math.max(0, (input.ageYears - 1) * 3.5));
  const ratio =
    input.packPrice != null && input.rawCardPrice != null && input.rawCardPrice > 0
      ? input.packPrice / input.rawCardPrice
      : null;
  const accessScore = ratio == null ? 0 : Math.min(26, Math.max(0, Math.log2(ratio + 1) * 8));
  const trend = input.trend30dPct ?? input.trend90dPct ?? 0;
  const trendScore = Math.min(25, Math.max(-18, trend * 0.7));
  const availabilityScore =
    input.packProductCount === 0 ? 7 : input.packProductCount === 1 ? 5 : input.packProductCount <= 3 ? 2 : 0;
  const score = clampMarketScore(
    28 + ageScore + accessScore + trendScore + availabilityScore - (input.hasReprintRisk ? 28 : 0)
  );
  return {
    pressureScore: score,
    pressureLabel:
      score >= 82 ? "Extreme" : score >= 66 ? "High" : score >= 45 ? "Building" : "Low",
  };
}

export function calculateScarcityScore(input: {
  ageYears: number | null;
  specificPullDenominator: number | null;
  gemRatePct: number | null;
  rawMarketBreadth: number;
  artistDemandScore: number | null;
}): Pick<ExternalScarcityIntelligence, "score" | "label"> {
  const age = input.ageYears == null ? 0 : Math.min(26, Math.max(0, (input.ageYears - 1) * 2.8));
  const pull =
    input.specificPullDenominator == null
      ? 0
      : Math.min(30, Math.max(0, Math.log10(Math.max(1, input.specificPullDenominator)) * 13 - 13));
  const gem =
    input.gemRatePct == null ? 0 : Math.min(20, Math.max(0, (55 - input.gemRatePct) * 0.45));
  const breadth = Math.min(14, Math.max(0, (4 - input.rawMarketBreadth) * 4.5));
  const artist = input.artistDemandScore == null ? 0 : Math.max(0, input.artistDemandScore - 55) * 0.18;
  const score = clampMarketScore(20 + age + pull + gem + breadth + artist);
  return {
    score,
    label:
      score >= 80 ? "Very scarce" : score >= 63 ? "Scarce" : score >= 43 ? "Watch" : "Common supply",
  };
}

export function calculateGoldMineConfluence(input: {
  artistDemandScore: number | null;
  collectorDemandScore: number;
  specificPullDenominator: number | null;
  scarcityScore: number;
  gemRatePct: number | null;
  hasFreshChaseCatalyst: boolean;
  ageYears: number | null;
}): ExternalGoldMineConfluence {
  const normalized = (value: number, floor: number, ceiling: number) =>
    Math.min(1, Math.max(0, (value - floor) / (ceiling - floor)));
  const artist = input.artistDemandScore == null ? 0.22 : normalized(input.artistDemandScore, 42, 92);
  const collector = normalized(input.collectorDemandScore, 42, 92);
  const pull =
    input.specificPullDenominator == null
      ? normalized(input.scarcityScore, 48, 92) * 0.62
      : normalized(Math.log10(Math.max(1, input.specificPullDenominator)), 1.7, 3.15);
  const scarcity = normalized(input.scarcityScore, 40, 92);
  const freshness = input.hasFreshChaseCatalyst
    ? 1
    : input.ageYears != null && input.ageYears <= 1.5
      ? 0.72
      : 0.18;
  const gradingScarcity =
    input.gemRatePct == null ? 0.35 : normalized(55 - input.gemRatePct, 0, 38);

  // A geometric mean deliberately punishes a missing leg: one fashionable
  // illustrator or one rare pull cannot create a "gold mine" by itself.
  const core = Math.pow(
    Math.max(0.04, artist) *
      Math.max(0.04, collector) *
      Math.max(0.04, pull) *
      Math.max(0.04, scarcity),
    0.25
  );
  const strongFactors = [artist, collector, pull, scarcity].filter((value) => value >= 0.58).length;
  let score = clampMarketScore(core * 76 + freshness * 16 + gradingScarcity * 8);
  if (strongFactors < 3) score = Math.min(score, 54);
  else if (strongFactors < 4) score = Math.min(score, 79);

  const drivers = [
    input.artistDemandScore != null && input.artistDemandScore >= 65
      ? `illustrator demand ${input.artistDemandScore}/100`
      : null,
    input.collectorDemandScore >= 65
      ? `collector demand ${input.collectorDemandScore}/100`
      : null,
    input.specificPullDenominator != null && input.specificPullDenominator >= 100
      ? `about 1/${Math.round(input.specificPullDenominator)} pull`
      : input.scarcityScore >= 65
        ? "scarce supply"
        : null,
    input.hasFreshChaseCatalyst ? "fresh chase catalyst" : null,
    input.gemRatePct != null && input.gemRatePct <= 35
      ? `${input.gemRatePct.toFixed(1)}% gem-rate`
      : null,
  ].filter((value): value is string => Boolean(value));

  return {
    score,
    label:
      score >= 85
        ? "Gold mine setup"
        : score >= 70
          ? "Strong setup"
          : score >= 50
            ? "Building"
            : "Single signal",
    drivers,
    freshChase: input.hasFreshChaseCatalyst,
  };
}

export function calculateOpportunityScores(input: {
  externalScore: number;
  sealedPressureScore: number;
  scarcityScore: number;
  confluenceScore: number;
  rawTrend90dPct: number | null;
  gradePremiumPct: number | null;
  gemRatePct: number | null;
  gradedAvailable: boolean;
  riskScore: number;
}): { raw: number; graded: number | null } {
  const sealedAdjustment = (input.sealedPressureScore - 50) * 0.16;
  const scarcityAdjustment = (input.scarcityScore - 50) * 0.18;
  const trendAdjustment = Math.min(6, Math.max(-6, (input.rawTrend90dPct ?? 0) * 0.08));
  const confluenceAdjustment = Math.min(13, Math.max(0, input.confluenceScore - 55) * 0.3);
  const riskAdjustment = Math.max(0, input.riskScore) * 15;
  const raw = clampMarketScore(
    input.externalScore + sealedAdjustment + scarcityAdjustment + trendAdjustment + confluenceAdjustment - riskAdjustment
  );
  if (!input.gradedAvailable) return { raw, graded: null };
  const premium = Math.min(8, Math.max(-4, (input.gradePremiumPct ?? 0) * 0.035));
  const gemScarcity =
    input.gemRatePct == null ? 0 : Math.min(8, Math.max(-2, (45 - input.gemRatePct) * 0.16));
  return { raw, graded: clampMarketScore(raw + premium + gemScarcity) };
}

export function buildPriceScenario(input: {
  marketMode: ExternalMarketMode;
  currentPrice: number | null;
  currency: "EUR" | "USD";
  opportunityScore: number | null;
  sealedTrendPct: number | null;
  rawTrend90dPct: number | null;
  scarcityScore: number;
  gemRatePct: number | null;
  riskScore: number;
  evidenceCount: number;
  historyPoints: number;
}): ExternalPriceScenario | null {
  if (
    input.currentPrice == null ||
    input.currentPrice <= 0 ||
    input.opportunityScore == null
  ) {
    return null;
  }
  const currentPrice = input.currentPrice;
  const scoreMonthly = (input.opportunityScore - 50) * 0.00115;
  const sealedMonthly = Math.min(0.02, Math.max(-0.015, (input.sealedTrendPct ?? 0) / 100 / 5));
  const rawMomentumMonthly = Math.min(0.018, Math.max(-0.018, (input.rawTrend90dPct ?? 0) / 100 / 7));
  const scarcityMonthly = Math.max(0, input.scarcityScore - 50) * 0.00022;
  const gemMonthly =
    input.marketMode === "graded" && input.gemRatePct != null
      ? Math.max(0, 45 - input.gemRatePct) * 0.00018
      : 0;
  const riskMonthly = Math.max(0, input.riskScore) * 0.025;
  const monthlyRate = Math.min(
    0.075,
    Math.max(-0.05, scoreMonthly + sealedMonthly + rawMomentumMonthly + scarcityMonthly + gemMonthly - riskMonthly)
  );
  const confidence: ExternalPriceScenario["confidence"] =
    input.evidenceCount >= 3 && input.historyPoints >= 8
      ? "High"
      : input.evidenceCount >= 2 || input.historyPoints >= 5
        ? "Medium"
        : "Low";
  const uncertaintyMultiplier = confidence === "High" ? 0.75 : confidence === "Medium" ? 1 : 1.3;
  const points = SCENARIO_DAYS.map((days) => {
    const months = days / 30;
    const base = currentPrice * (1 + monthlyRate) ** months;
    const spread = Math.min(0.48, (0.055 + Math.sqrt(months) * 0.045) * uncertaintyMultiplier);
    return {
      days,
      low: roundMoney(Math.max(currentPrice * 0.35, base * (1 - spread))),
      base: roundMoney(base),
      high: roundMoney(base * (1 + spread * 1.15)),
    };
  });
  const drivers = [
    input.sealedTrendPct != null ? "sealed trend" : null,
    input.rawTrend90dPct != null ? "market history" : null,
    input.scarcityScore >= 60 ? "structural scarcity" : null,
    input.marketMode === "graded" && input.gemRatePct != null ? "gem-rate" : null,
  ].filter((value): value is string => Boolean(value));
  return {
    marketMode: input.marketMode,
    currentPrice,
    currency: input.currency,
    confidence,
    points,
    drivers,
  };
}

export function getGradedSupplyLabel(sampleSize: number | null): ExternalGradedIntelligence["supplyLabel"] {
  if (sampleSize == null) return "Unknown";
  if (sampleSize <= 3) return "Thin";
  if (sampleSize <= 10) return "Balanced";
  return "Deep";
}
