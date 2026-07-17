export type GradingTargetTier = "pristine" | "gem" | "mint" | "near-mint" | "lower";
export type GradingTargetSpreadRisk = "normal" | "wide" | "extreme" | null;
export type GradingTargetPriceStatus = "ok" | "thin_history" | "suspicious";

export interface GradingTargetPriceReference {
  label: string;
  price: number;
}

export interface ParsedGradingTargetLabel {
  company: string | null;
  grade: number | null;
  tier: GradingTargetTier;
  tierLabel: string;
  isGradeTenEquivalent: boolean;
}

export interface GradingTargetAssessment {
  marketPrice: number;
  targetPrice: number;
  priceAdjusted: boolean;
  priceStatus: GradingTargetPriceStatus;
  priceReason: string | null;
  tier: GradingTargetTier;
  tierLabel: string;
  fallbackLabel: string | null;
  fallbackPrice: number | null;
  equivalentLabel: string | null;
  equivalentPrice: number | null;
  gradeStepMultiplier: number | null;
  spreadRisk: GradingTargetSpreadRisk;
  estimatedHitRatePct: number;
  gradingCost: number;
  expectedValue: number;
  expectedGain: number;
  expectedMultiplier: number;
}

export const DEFAULT_GRADING_COST_EUR = 25;

const TIER_RANK: Record<GradingTargetTier, number> = {
  lower: 0,
  "near-mint": 1,
  mint: 2,
  gem: 3,
  pristine: 4,
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, decimals = 2): number {
  return Number(value.toFixed(decimals));
}

function normalizeLabel(value: string): string {
  return value
    .toUpperCase()
    .replace(/BECKETT/g, "BGS")
    .replace(/[^A-Z0-9.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tierLabel(tier: GradingTargetTier): string {
  if (tier === "pristine") return "BGS 10 pristine tier";
  if (tier === "gem") return "PSA 10 / BGS 9.5 tier";
  if (tier === "mint") return "Grade 9 tier";
  if (tier === "near-mint") return "Grade 8 tier";
  return "Lower grade tier";
}

export function parseGradingTargetLabel(label: string | null | undefined): ParsedGradingTargetLabel {
  const normalized = normalizeLabel(label ?? "");
  const companyMatch = normalized.match(/\b(PSA|BGS|CGC|SGC|ACE|TAG|AOG|AIGRAD|GRADED|GMA|MNT|KSA|ARS)\b/);
  const gradeMatch = normalized.match(/\b(10(?:\.0)?|9\.5|9(?:\.0)?|8\.5|8(?:\.0)?|7\.5|7(?:\.0)?|6\.5|6(?:\.0)?|5\.5|5(?:\.0)?|4\.5|4(?:\.0)?|3\.5|3(?:\.0)?|2\.5|2(?:\.0)?|1\.5|1(?:\.0)?)\b/);
  const company = companyMatch?.[1] ?? null;
  const grade = gradeMatch ? Number(gradeMatch[1]) : null;

  let tier: GradingTargetTier = "lower";
  if (
    grade === 10 &&
    (company === "BGS" || /\b(?:BLACK|PRISTINE|PERFECT)\b/.test(normalized))
  ) {
    tier = "pristine";
  } else if (grade === 10 || (company === "BGS" && grade === 9.5)) {
    tier = "gem";
  } else if (grade != null && grade >= 9) {
    tier = "mint";
  } else if (grade != null && grade >= 8) {
    tier = "near-mint";
  }

  return {
    company,
    grade,
    tier,
    tierLabel: tierLabel(tier),
    isGradeTenEquivalent: tier === "gem" || tier === "pristine",
  };
}

function medianReference(
  references: readonly GradingTargetPriceReference[]
): GradingTargetPriceReference | null {
  const sorted = references
    .filter((reference) => Number.isFinite(reference.price) && reference.price > 0)
    .sort((left, right) => left.price - right.price || left.label.localeCompare(right.label));
  if (sorted.length === 0) return null;
  return sorted[Math.floor((sorted.length - 1) / 2)] ?? null;
}

function normalizeGemRate(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return value <= 1 ? value * 100 : value;
}

function defaultGemRate(ageYears: number | null): number {
  if (ageYears == null) return 25;
  if (ageYears >= 20) return 10;
  if (ageYears >= 12) return 14;
  if (ageYears >= 7) return 19;
  if (ageYears >= 3) return 27;
  return 36;
}

function estimatedHitRate(input: {
  tier: GradingTargetTier;
  ageYears: number | null;
  gemRatePct: number | null | undefined;
  spreadRisk: GradingTargetSpreadRisk;
}): number {
  if (input.tier === "pristine") return 2;

  let rate =
    input.tier === "gem"
      ? clamp(normalizeGemRate(input.gemRatePct) ?? defaultGemRate(input.ageYears), 5, 70)
      : input.tier === "mint"
        ? input.ageYears != null && input.ageYears >= 15
          ? 55
          : 68
        : input.tier === "near-mint"
          ? 84
          : 90;

  if (input.tier === "gem" && input.spreadRisk === "wide") rate *= 0.78;
  if (input.tier === "gem" && input.spreadRisk === "extreme") rate *= 0.45;
  return round(clamp(rate, 2, 90), 1);
}

export function buildGradingTargetAssessment(input: {
  label: string;
  marketPrice: number;
  rawPrice: number;
  peerPrices: readonly GradingTargetPriceReference[];
  ageYears: number | null;
  gemRatePct?: number | null;
  gradingCost?: number;
}): GradingTargetAssessment {
  const parsed = parseGradingTargetLabel(input.label);
  const normalizedTargetLabel = normalizeLabel(input.label);
  const parsedPeers = input.peerPrices
    .filter((peer) => peer.price > 0 && normalizeLabel(peer.label) !== normalizedTargetLabel)
    .map((peer) => ({ peer, parsed: parseGradingTargetLabel(peer.label) }));
  const targetRank = TIER_RANK[parsed.tier];
  const equivalent = medianReference(
    parsedPeers
      .filter(({ parsed: peer }) => TIER_RANK[peer.tier] === targetRank)
      .map(({ peer }) => peer)
  );
  const fallbackCandidate = medianReference(
    parsedPeers
      .filter(({ parsed: peer }) => TIER_RANK[peer.tier] === targetRank - 1)
      .map(({ peer }) => peer)
  );

  const equivalentCapMultiplier = parsed.tier === "gem" ? 3 : 4;
  const equivalentCap = equivalent ? equivalent.price * equivalentCapMultiplier : null;
  const equivalentAdjustedPrice =
    equivalentCap == null ? input.marketPrice : Math.min(input.marketPrice, equivalentCap);
  const fallbackIsInverted =
    fallbackCandidate != null && fallbackCandidate.price > equivalentAdjustedPrice * 1.05;
  const fallback = fallbackIsInverted ? null : fallbackCandidate;
  const maxGradeStep =
    parsed.tier === "pristine"
      ? null
      : parsed.tier === "gem"
        ? 25
        : parsed.tier === "mint"
          ? 10
          : parsed.tier === "near-mint"
            ? 6
            : 4;
  const fallbackCap =
    fallback && maxGradeStep != null ? fallback.price * maxGradeStep : null;
  const targetPrice = round(
    fallbackCap == null
      ? equivalentAdjustedPrice
      : Math.min(equivalentAdjustedPrice, fallbackCap)
  );
  const priceAdjusted = targetPrice < input.marketPrice * 0.98;
  const gradeStepMultiplier =
    fallback && fallback.price > 0 ? round(targetPrice / fallback.price, 2) : null;
  const spreadRisk =
    gradeStepMultiplier == null
      ? null
      : gradeStepMultiplier > 10
        ? "extreme"
        : gradeStepMultiplier > 3
          ? "wide"
          : "normal";
  const rawMultiplier = targetPrice / input.rawPrice;

  let priceStatus: GradingTargetPriceStatus = "ok";
  let priceReason: string | null = null;
  if (
    (input.rawPrice < 0.25 && input.marketPrice >= 20) ||
    (input.rawPrice < 0.5 && rawMultiplier >= 150)
  ) {
    priceStatus = "suspicious";
    priceReason = "Raw price is too small to support this slab comparison";
  } else if (
    parsed.tier !== "pristine" &&
    fallback == null &&
    ((equivalent == null && rawMultiplier >= 300 && targetPrice >= 250) ||
      (rawMultiplier >= 100 && targetPrice >= 1_000))
  ) {
    priceStatus = "suspicious";
    priceReason = "Extreme grade premium has no reliable lower-grade support";
  } else if (fallbackCap != null && fallbackCap < equivalentAdjustedPrice * 0.98) {
    priceStatus = "thin_history";
    priceReason = `Conservative value capped by the ${fallback?.label ?? "lower-grade"} spread`;
  } else if (equivalentCap != null && equivalentCap < input.marketPrice * 0.98) {
    priceStatus = "thin_history";
    priceReason = `Conservative value capped by ${equivalent?.label ?? "equivalent grades"}`;
  } else if (fallbackIsInverted) {
    priceStatus = "thin_history";
    priceReason = "Lower-grade asking price exceeds the target grade";
  } else if (fallback == null && parsed.tier !== "lower") {
    priceStatus = "thin_history";
    priceReason = "No lower-grade fallback is available";
  }

  const estimatedHitRatePct = estimatedHitRate({
    tier: parsed.tier,
    ageYears: input.ageYears,
    gemRatePct: input.gemRatePct,
    spreadRisk,
  });
  const hitRate = estimatedHitRatePct / 100;
  const fallbackValue = fallback?.price ?? input.rawPrice;
  const gradingCost = input.gradingCost ?? DEFAULT_GRADING_COST_EUR;
  const expectedValue = round(targetPrice * hitRate + fallbackValue * (1 - hitRate));
  const investment = input.rawPrice + gradingCost;
  const expectedGain = round(expectedValue - investment);

  return {
    marketPrice: round(input.marketPrice),
    targetPrice,
    priceAdjusted,
    priceStatus,
    priceReason,
    tier: parsed.tier,
    tierLabel: parsed.tierLabel,
    fallbackLabel: fallback?.label ?? null,
    fallbackPrice: fallback ? round(fallback.price) : null,
    equivalentLabel: equivalent?.label ?? null,
    equivalentPrice: equivalent ? round(equivalent.price) : null,
    gradeStepMultiplier,
    spreadRisk,
    estimatedHitRatePct,
    gradingCost,
    expectedValue,
    expectedGain,
    expectedMultiplier: round(expectedValue / Math.max(investment, 0.01), 2),
  };
}
