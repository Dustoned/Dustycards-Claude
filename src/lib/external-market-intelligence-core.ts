import type {
  ExternalGradedIntelligence,
  ExternalGoldMineConfluence,
  ExternalMarketMode,
  ExternalPriceScenario,
  ExternalScarcityIntelligence,
  ExternalSealedIntelligence,
  ExternalSignalCatalyst,
} from "@/lib/external-signal-radar";
import { KNOWN_RARITY_ORDER, normalizeRarityLabel } from "@/lib/rarity";

const SCENARIO_DAYS = [30, 90, 180] as const;

export interface ExtendedPriceHistoryFeatures {
  volatilityDaily90Pct: number | null;
  athDistancePct: number | null;
  momentum365Pct: number | null;
  jpLeadLagPct: number | null;
  setRelativeStrength90Pct: number | null;
  avg30AnchorGapPct: number | null;
}

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
    ) ||
    (/\bbooster\s*$/.test(normalized) &&
      !/\(\s*\d+\s*cards?\s*\)\s*$/.test(normalized))
  ) {
    if (
      !/\b(?:box|bundle|display|case|collection|tin|elite trainer|etb)\b/.test(normalized)
    ) {
      return "pack";
    }
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
  lifecycleOopProbability?: number | null;
  lifecycleConfidence?: number | null;
}): Pick<ExternalSealedIntelligence, "pressureScore" | "pressureLabel"> {
  const ageScore =
    input.ageYears == null ? 0 : Math.min(30, Math.max(0, (input.ageYears - 1) * 3.5));
  const valueDensity =
    input.packPrice != null && input.packPrice > 0 && input.rawCardPrice != null
      ? input.rawCardPrice / input.packPrice
      : null;
  // Cheaper sealed relative to the value of the strongest raw cards is more
  // pressure-positive. Cap the ratio once it already represents a strong
  // chase: trophy-card prices are not extra evidence that sealed is actionable.
  const accessScore =
    valueDensity == null
      ? 0
      : Math.min(28, Math.max(0, Math.log2(Math.min(valueDensity, 8) + 1) * 7));
  const trend = input.trend30dPct ?? input.trend90dPct ?? 0;
  const trendScore = Math.min(25, Math.max(-18, trend * 0.7));
  const availabilityScore =
    input.packProductCount === 0 ? 7 : input.packProductCount === 1 ? 5 : input.packProductCount <= 3 ? 2 : 0;
  // A lifecycle observation is only allowed to change the market model after
  // the set-level evidence reaches the same confidence threshold used by the
  // UI. This prevents a single stock gap or stale product snapshot from
  // turning an in-print set into an apparent scarcity signal.
  const lifecycleAdjustment =
    input.lifecycleConfidence != null &&
    input.lifecycleConfidence >= 65 &&
    input.lifecycleOopProbability != null
      ? Math.min(22, Math.max(-12, (input.lifecycleOopProbability - 50) * 0.4))
      : 0;
  const score = clampMarketScore(
    28 +
      ageScore +
      accessScore +
      trendScore +
      availabilityScore +
      lifecycleAdjustment -
      (input.hasReprintRisk ? 28 : 0)
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
  verifiedActiveListings?: number | null;
  sealedPressureScore?: number | null;
  artistDemandScore: number | null;
  setRarityScore?: number | null;
}): Pick<ExternalScarcityIntelligence, "score" | "label"> {
  type WeightedEvidence = { score: number; weight: number };
  const evidence: WeightedEvidence[] = [];
  const addEvidence = (value: number | null | undefined, weight: number) => {
    if (value == null || !Number.isFinite(value)) return;
    evidence.push({ score: Math.min(100, Math.max(0, value)), weight });
  };

  // Age is a supply constraint, but it is deliberately non-linear. A card does
  // not become scarce merely because its launch window ended; most of the age
  // pressure arrives after products have been out of print for several years.
  const age = input.ageYears == null
    ? null
    : input.ageYears <= 1
      ? input.ageYears * 8
      : input.ageYears <= 3
        ? 8 + (input.ageYears - 1) * 16
        : input.ageYears <= 7
          ? 40 + (input.ageYears - 3) * 10
          : 80 + (input.ageYears - 7) * 2.5;
  addEvidence(age, 22);

  // Complete, exact raw-NM-English eBay inventory is the strongest observable
  // scarcity signal. The logarithmic curve distinguishes 1 from 10 listings,
  // while treating 100+ copies as genuinely abundant even for a difficult pull.
  if (input.verifiedActiveListings != null) {
    const listings = Math.max(0, input.verifiedActiveListings);
    addEvidence(100 - Math.log10(listings + 1) * 42, 38);
  }

  const pull = input.specificPullDenominator == null
    ? null
    : ((Math.log10(Math.max(1, input.specificPullDenominator)) - Math.log10(25)) /
        (Math.log10(2000) - Math.log10(25))) * 100;
  addEvidence(pull, 10);

  // Price-source breadth counts languages/feeds, not available copies, and a
  // set-level gem rate describes graded condition supply rather than raw-NM
  // inventory. Neither is allowed to inflate physical raw scarcity.
  // Sealed pressure's primary occurrence is here; set rarity's primary
  // occurrence is the opportunity-score rarity adjustment, so its evidence
  // weight here is halved to reduce double-counting.
  addEvidence(input.sealedPressureScore, 15);
  addEvidence(input.setRarityScore, 4.5);

  // Illustrator and character popularity are demand signals. They intentionally
  // do not make a plentiful card scarce; both remain part of confluence scoring.
  const totalWeight = evidence.reduce((sum, item) => sum + item.weight, 0);
  let score = clampMarketScore(
    totalWeight === 0
      ? 0
      : evidence.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight
  );
  if (input.verifiedActiveListings == null) {
    // Structural evidence can establish a strong watch, but "very scarce"
    // requires a current exact-inventory observation rather than an assumption.
    score = Math.min(score, 79);
  } else if (
    input.ageYears != null &&
    input.ageYears <= 1.5 &&
    input.verifiedActiveListings >= 100
  ) {
    score = Math.min(score, 35);
  } else if (
    input.ageYears != null &&
    input.ageYears <= 1 &&
    input.verifiedActiveListings >= 50
  ) {
    score = Math.min(score, 45);
  }
  return {
    score,
    label:
      score >= 80 ? "Very scarce" : score >= 63 ? "Scarce" : score >= 43 ? "Watch" : "Common supply",
  };
}

export function calculateSetRarityPosition(
  rarity: string | null | undefined,
  setRarities: Array<string | null | undefined>
): Pick<ExternalScarcityIntelligence, "setRarityScore" | "setRarityLabel"> {
  const normalized = normalizeRarityLabel(rarity);
  const rarityWeight = (value: string): number => {
    const lower = value.toLowerCase();
    if (/manga|shining|rare holo star|special illustration|special art|mega hyper|hyper rare|black white rare/.test(lower)) return 100;
    if (/alternate art|secret rare|rare ultra|ultra rare|rare rainbow|shiny ultra|rare shiny gx|treasure rare/.test(lower)) return 85;
    if (/illustration rare|art rare|holo ex|holo gx|holo v|vstar|lv\.x|prime|radiant|amazing|legend/.test(lower)) return 60;
    if (/double rare|super rare|leader|rare holo|ace spec|rare break|prism star/.test(lower)) return 25;
    if (/promo/.test(lower)) return 40;
    if (/common|uncommon|^rare$/.test(lower)) return 10;
    const knownIndex = KNOWN_RARITY_ORDER.indexOf(value as (typeof KNOWN_RARITY_ORDER)[number]);
    return knownIndex < 0 ? 30 : Math.min(75, 15 + knownIndex * 2);
  };
  const cardWeight = normalized == null ? null : rarityWeight(normalized);
  const setWeights = [...new Set(
    setRarities
      .map((value) => normalizeRarityLabel(value))
      .map((value) => (value == null ? undefined : rarityWeight(value)))
      .filter((value): value is number => value != null)
  )];

  const highestWeight = Math.max(...setWeights, 0);
  if (cardWeight == null || highestWeight <= 0) {
    return { setRarityScore: null, setRarityLabel: "Unknown" };
  }

  const score = Math.round(Math.min(1, cardWeight / highestWeight) * 100);
  return {
    setRarityScore: score,
    setRarityLabel:
      score >= 85 ? "Chase tier" : score >= 60 ? "Upper tier" : score >= 35 ? "Mid tier" : "Entry tier",
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
    label: confluenceLabel(score),
    drivers,
    freshChase: input.hasFreshChaseCatalyst,
  };
}

export function hasActiveReprintRisk(
  catalysts: Array<Pick<ExternalSignalCatalyst, "kind" | "direction">>
): boolean {
  // Catalyst direction describes the effect on card scarcity. A negative
  // reprint/restock signal increases supply and is therefore the actual risk.
  // Positive reprint catalysts represent explicit no-reprint/OOP evidence.
  return catalysts.some(
    (catalyst) => catalyst.kind === "reprint" && catalyst.direction === "negative"
  );
}

export function calculateOpportunityScores(input: {
  externalScore: number;
  sealedPressureScore: number;
  scarcityScore: number;
  confluenceScore: number;
  rawEbayDemandAdjustment?: number;
  gradedEbayDemandAdjustment?: number;
  rawTrend90dPct: number | null;
  gradePremiumPct: number | null;
  gemRatePct: number | null;
  gradedAvailable: boolean;
  riskScore: number;
  setRarityScore?: number | null;
}): { raw: number; graded: number | null } {
  // Sealed pressure's primary weight lives inside the scarcity score (which
  // already feeds this sum via scarcityAdjustment); this direct occurrence is
  // half-weighted to avoid double-counting the same signal.
  const sealedAdjustment = (input.sealedPressureScore - 50) * 0.08;
  const scarcityAdjustment = (input.scarcityScore - 50) * 0.18;
  const trendAdjustment = Math.min(6, Math.max(-6, (input.rawTrend90dPct ?? 0) * 0.08));
  const confluenceAdjustment = Math.min(13, Math.max(0, input.confluenceScore - 55) * 0.3);
  const riskAdjustment = Math.max(0, input.riskScore) * 15;
  // This is set rarity's primary occurrence; its other entries (scarcity
  // evidence, scenario quality amplifier) are half-weighted.
  const rarityAdjustment = input.setRarityScore == null ? 0 : (input.setRarityScore - 50) * 0.18;
  // eBay demand's primary occurrence is the price-scenario direction evidence;
  // this ranking modifier is half-weighted to avoid double-counting.
  const rawEbayDemandAdjustment =
    Math.min(6, Math.max(-4, input.rawEbayDemandAdjustment ?? 0)) * 0.5;
  const gradedEbayDemandAdjustment =
    Math.min(6, Math.max(-4, input.gradedEbayDemandAdjustment ?? 0)) * 0.5;
  const baseScore =
    input.externalScore +
    sealedAdjustment +
    scarcityAdjustment +
    trendAdjustment +
    confluenceAdjustment +
    rarityAdjustment -
    riskAdjustment;
  const raw = clampMarketScore(
    baseScore + rawEbayDemandAdjustment
  );
  if (!input.gradedAvailable) return { raw, graded: null };
  const premium = Math.min(8, Math.max(-4, (input.gradePremiumPct ?? 0) * 0.035));
  const gemScarcity =
    input.gemRatePct == null ? 0 : Math.min(8, Math.max(-2, (45 - input.gemRatePct) * 0.16));
  return {
    raw,
    graded: clampMarketScore(
      baseScore + gradedEbayDemandAdjustment + premium + gemScarcity
    ),
  };
}

export function isActionablePriceScenario(scenario: ExternalPriceScenario | null | undefined): boolean {
  if (!scenario || scenario.currentPrice <= 0) return false;
  const horizon = scenario.points.find((point) => point.days === 180) ?? scenario.points.at(-1);
  if (!horizon) return false;

  const absoluteGain = horizon.base - scenario.currentPrice;
  const gainPct = (absoluteGain / scenario.currentPrice) * 100;
  const minimum =
    scenario.currentPrice < 5
      ? { absolute: 0.5, percent: 20 }
      : scenario.currentPrice < 25
        ? { absolute: 1.5, percent: 15 }
        : scenario.currentPrice < 100
          ? { absolute: 5, percent: 12 }
          : { absolute: 10, percent: 10 };

  return absoluteGain >= minimum.absolute && gainPct >= minimum.percent;
}

function scenarioHorizon(
  scenario: ExternalPriceScenario | null | undefined
): ExternalPriceScenario["points"][number] | null {
  return scenario?.points.find((point) => point.days === 180) ?? scenario?.points.at(-1) ?? null;
}

function confluenceLabel(score: number): ExternalGoldMineConfluence["label"] {
  return score >= 85
    ? "Gold mine setup"
    : score >= 70
      ? "Strong setup"
      : score >= 50
        ? "Building"
        : "Single signal";
}

/**
 * Converts structural potential into a market-timed opportunity score.
 *
 * Artist, character, rarity and supply can identify an excellent card, but
 * they cannot make a bearish or statistically weak 180-day base case a
 * "Breakout". The underlying structural score still drives the scenario and
 * remains visible in the detail panels; only the actionable opportunity tier
 * is capped until the price model confirms a material move.
 */
export function alignOpportunityScoreWithScenario(
  opportunityScore: number,
  scenario: ExternalPriceScenario | null | undefined
): number {
  const horizon = scenarioHorizon(scenario);
  // Without a usable base case there is not enough directional evidence for
  // the actionable Breakout tier (or its email threshold).
  if (!scenario || !horizon || scenario.currentPrice <= 0) {
    return Math.min(opportunityScore, 79);
  }

  const confirmedActionable =
    scenario.confidence !== "Low" && isActionablePriceScenario(scenario);
  if (confirmedActionable) return opportunityScore;

  // A bearish base case is a watch, irrespective of how attractive the
  // long-term structural ingredients are. A flat/small-up case may remain a
  // strong watch, but not a breakout opportunity.
  return Math.min(opportunityScore, horizon.base < scenario.currentPrice ? 59 : 79);
}

/**
 * Keeps the Gold-mine label consistent with the selected raw price scenario.
 * The drivers are deliberately preserved so a cooling card can still show why
 * its long-term setup is interesting without presenting it as an immediate
 * Gold-mine opportunity.
 */
export function alignConfluenceWithScenario(
  confluence: ExternalGoldMineConfluence,
  scenario: ExternalPriceScenario | null | undefined
): ExternalGoldMineConfluence {
  const horizon = scenarioHorizon(scenario);
  if (!scenario || !horizon || scenario.currentPrice <= 0) {
    if (confluence.score <= 84) return confluence;
    return { ...confluence, score: 84, label: confluenceLabel(84) };
  }

  const confirmedActionable =
    scenario.confidence !== "Low" && isActionablePriceScenario(scenario);
  if (confirmedActionable) return confluence;

  const cap = horizon.base < scenario.currentPrice ? 69 : 84;
  if (confluence.score <= cap) return confluence;
  const score = Math.min(confluence.score, cap);
  return { ...confluence, score, label: confluenceLabel(score) };
}

/**
 * Keeps a structurally strong card visible while its honest base case is flat
 * or mildly negative, provided the upside case is still material. This avoids
 * turning Radar membership itself into a hidden guarantee that the base line
 * must rise.
 */
export function isWatchablePriceScenario(
  scenario: ExternalPriceScenario | null | undefined,
  opportunityScore: number | null | undefined
): boolean {
  if (
    !scenario ||
    scenario.currentPrice <= 0 ||
    scenario.confidence === "Low"
  ) {
    return false;
  }
  if (isActionablePriceScenario(scenario)) return true;
  if (opportunityScore == null || opportunityScore < 72) return false;
  const horizon = scenario.points.find((point) => point.days === 180) ?? scenario.points.at(-1);
  if (!horizon) return false;

  const basePct = ((horizon.base - scenario.currentPrice) / scenario.currentPrice) * 100;
  const highGain = horizon.high - scenario.currentPrice;
  const highPct = (highGain / scenario.currentPrice) * 100;
  const minimum =
    scenario.currentPrice < 5
      ? { absolute: 0.5, percent: 20 }
      : scenario.currentPrice < 25
        ? { absolute: 1.5, percent: 15 }
        : scenario.currentPrice < 100
          ? { absolute: 5, percent: 12 }
          : { absolute: 10, percent: 10 };
  const strongSetup =
    opportunityScore >= 82 &&
    basePct >= -10 &&
    highGain >= minimum.absolute &&
    highPct >= minimum.percent;
  const asymmetricUpside =
    basePct >= -5 &&
    highGain >= minimum.absolute * 1.5 &&
    highPct >= Math.max(20, minimum.percent + 8);

  return strongSetup || asymmetricUpside;
}

export function buildPriceScenario(input: {
  marketMode: ExternalMarketMode;
  currentPrice: number | null;
  currency: "EUR" | "USD";
  ageYears: number | null;
  opportunityScore: number | null;
  sealedTrendPct: number | null;
  rawTrend30dPct?: number | null;
  rawTrend90dPct: number | null;
  rawTrend180dPct?: number | null;
  scarcityScore: number;
  gemRatePct: number | null;
  riskScore: number;
  evidenceCount: number;
  historyPoints: number;
  ebayDemandAdjustment?: number;
  competitiveScore?: number | null;
  catalystScore?: number | null;
  hypeScore?: number | null;
  setRarityScore?: number | null;
  confluenceScore?: number | null;
  artistDemandScore?: number | null;
  collectorDemandScore?: number | null;
  lifecycleStatus?: ExternalSealedIntelligence["lifecycleStatus"];
  lifecycleConfidence?: number | null;
  lifecycleOopProbability?: number | null;
  currentVsEnglishNmAverage30dPct?: number | null;
  extendedHistory?: ExtendedPriceHistoryFeatures | null;
}): ExternalPriceScenario | null {
  if (
    input.currentPrice == null ||
    input.currentPrice <= 0 ||
    input.opportunityScore == null
  ) {
    return null;
  }
  const currentPrice = input.currentPrice;
  const clamp = (value: number, minimum: number, maximum: number) =>
    Math.min(maximum, Math.max(minimum, value));
  const signedDeadband = (value: number, band: number) =>
    Math.abs(value) < band ? 0 : value;

  // Build momentum from genuinely available horizons. Missing long history is
  // not silently replaced with a short spike; the history loader enforces the
  // minimum date coverage for every supplied horizon.
  const momentumInputs = [
    { value: input.rawTrend30dPct, weight: 0.2 },
    { value: input.rawTrend90dPct, weight: 0.55 },
    { value: input.rawTrend180dPct, weight: 0.25 },
  ].filter(
    (item): item is { value: number; weight: number } =>
      item.value != null && Number.isFinite(item.value)
  );
  const weightedMomentumPct =
    momentumInputs.length === 0
      ? 0
      : momentumInputs.reduce((sum, item) => sum + item.value * item.weight, 0) /
        momentumInputs.reduce((sum, item) => sum + item.weight, 0);
  const extended = input.extendedHistory ?? null;
  const volatility = extended?.volatilityDaily90Pct ?? null;
  // A +20% move on a stable card is more meaningful than on a hyper-volatile
  // one; normalize the momentum contribution by daily dispersion when known.
  const momentumVolatilityScale =
    volatility == null ? 1 : clamp(1.8 / Math.max(0.6, volatility), 0.55, 1.4);
  const momentumContribution = clamp(
    signedDeadband(weightedMomentumPct, 2.5) * 0.6 * momentumVolatilityScale,
    -30,
    30
  );
  const sealedContribution = clamp(
    signedDeadband(input.sealedTrendPct ?? 0, 2) * 0.2,
    -12,
    18
  );
  const ebayContribution = clamp(
    signedDeadband(input.ebayDemandAdjustment ?? 0, 0.75) * 1.5,
    -7,
    9
  );
  const competitiveContribution =
    input.competitiveScore == null
      ? 0
      : clamp((input.competitiveScore - 50) * 0.08, -4, 4);
  const catalystContribution = clamp(
    (input.catalystScore ?? 0) * 10 + (input.hypeScore ?? 0) * 4,
    -12,
    12
  );

  const lifecycleTrusted = (input.lifecycleConfidence ?? 0) >= 65;
  const lifecycleContribution = lifecycleTrusted
    ? input.lifecycleStatus === "confirmed_out_of_print"
      ? 10
      : input.lifecycleStatus === "likely_out_of_print"
        ? 7
        : input.lifecycleStatus === "supply_tightening"
          ? 4
          : input.lifecycleStatus === "actively_supplied"
            ? -3
            : input.lifecycleStatus === "reprint_restock"
              ? -12
              : 0
    : 0;
  const oopProbabilityContribution =
    lifecycleTrusted && input.lifecycleOopProbability != null
      ? clamp((input.lifecycleOopProbability - 50) * 0.06, -3, 3)
      : 0;

  const positiveConfirmations = [
    momentumContribution >= 3,
    ebayContribution >= 2,
    sealedContribution + lifecycleContribution >= 4,
    catalystContribution >= 3,
    competitiveContribution >= 2,
  ].filter(Boolean).length;
  const negativeConfirmations = [
    momentumContribution <= -3,
    ebayContribution <= -2,
    sealedContribution + lifecycleContribution <= -4,
    catalystContribution <= -3,
    competitiveContribution <= -2,
  ].filter(Boolean).length;

  // Rarity, scarcity, artist demand and grading potential amplify confirmed
  // demand. They never manufacture a bullish direction on their own. Set
  // rarity's primary occurrence is the opportunity-score rarity adjustment,
  // so it is half-weighted here to reduce double-counting.
  const qualityInputs = [
    { value: input.setRarityScore, weight: 0.5 },
    { value: input.confluenceScore, weight: 1 },
    { value: input.scarcityScore, weight: 1 },
    { value: input.artistDemandScore, weight: 1 },
    { value: input.collectorDemandScore, weight: 1 },
  ].filter(
    (item): item is { value: number; weight: number } =>
      item.value != null && Number.isFinite(item.value)
  );
  const qualityAverage =
    qualityInputs.length === 0
      ? 0
      : qualityInputs.reduce((sum, item) => sum + item.value * item.weight, 0) /
        qualityInputs.reduce((sum, item) => sum + item.weight, 0);
  const raritySupportsUpside =
    (input.setRarityScore ?? input.scarcityScore) >= 70 && input.scarcityScore >= 60;
  const strongPositiveEvidence =
    momentumContribution >= 8 ||
    ebayContribution >= 5 ||
    sealedContribution + lifecycleContribution >= 8 ||
    catalystContribution >= 5;
  const qualityContribution =
    strongPositiveEvidence &&
    positiveConfirmations >= 1 &&
    positiveConfirmations > negativeConfirmations &&
    raritySupportsUpside
      ? clamp((qualityAverage - 65) * 0.22, 0, positiveConfirmations >= 2 ? 10 : 5)
      : 0;
  // Mirror of the quality bonus: a structurally weak card with strong
  // negative evidence deserves the same magnitude of downside expression.
  const strongNegativeEvidence =
    momentumContribution <= -8 ||
    ebayContribution <= -5 ||
    sealedContribution + lifecycleContribution <= -8 ||
    catalystContribution <= -5;
  const qualityPenalty =
    strongNegativeEvidence &&
    negativeConfirmations >= 1 &&
    negativeConfirmations > positiveConfirmations &&
    qualityInputs.length > 0 &&
    qualityAverage < 40
      ? clamp((qualityAverage - 40) * 0.22, negativeConfirmations >= 2 ? -10 : -5, 0)
      : 0;

  // With full history loaded the anchor gap (EN-NM floor vs cm 30d average)
  // replaces the hand-rolled 30d-mean valuation anchor: a floor far below the
  // 30d average signals thin listings ripe for mild repricing, a floor far
  // above it signals an already-stretched ask.
  const anchorGapPct = extended?.avg30AnchorGapPct ?? null;
  const valuationContribution =
    anchorGapPct != null
      ? clamp(signedDeadband(anchorGapPct, 10) * -0.12, -3, 3)
      : input.currentVsEnglishNmAverage30dPct == null
        ? 0
        : input.currentVsEnglishNmAverage30dPct >= 40
          ? -14
          : input.currentVsEnglishNmAverage30dPct >= 20
            ? -7
            : input.currentVsEnglishNmAverage30dPct <= -20 && positiveConfirmations >= 1
              ? 4
              : 0;

  // Full-window valuation: overextension near the all-time high on a hot 90d
  // trend, and a recovery bonus deep below the ATH once the trend turns.
  const athDistancePct = extended?.athDistancePct ?? null;
  let athContribution = 0;
  if (athDistancePct != null && input.rawTrend90dPct != null) {
    if (athDistancePct >= -8 && input.rawTrend90dPct > 25) {
      athContribution = -clamp(
        (athDistancePct + 8) * 0.6 + (input.rawTrend90dPct - 25) * 0.08,
        0,
        8
      );
    } else if (athDistancePct <= -45 && input.rawTrend90dPct > 3) {
      athContribution = clamp(
        (-athDistancePct - 45) * 0.1 + (input.rawTrend90dPct - 3) * 0.05,
        0,
        5
      );
    }
  }

  const momentum365Contribution =
    extended?.momentum365Pct == null ? 0 : clamp(extended.momentum365Pct * 0.04, -4, 5);
  const jpLeadLagContribution =
    extended?.jpLeadLagPct == null ? 0 : clamp(extended.jpLeadLagPct * 0.15, -4, 6);
  const setStrengthContribution =
    extended?.setRelativeStrength90Pct == null
      ? 0
      : clamp(extended.setRelativeStrength90Pct * 0.12, -4, 6);

  let releasePhaseContribution = 0;
  if (input.ageYears != null && input.ageYears < 0.18) {
    releasePhaseContribution =
      positiveConfirmations >= 2 && input.opportunityScore >= 80 ? 4 : -4;
  } else if (input.ageYears != null && input.ageYears < 0.5) {
    releasePhaseContribution = positiveConfirmations >= 2 ? -8 : -10;
  } else if (input.ageYears != null && input.ageYears < 1) {
    releasePhaseContribution = positiveConfirmations >= 2 ? -6 : -9;
  } else if (input.ageYears != null && input.ageYears < 1.5) {
    releasePhaseContribution = -3;
  }

  const riskContribution = Math.max(0, input.riskScore) * 30;
  // Backtest (4,284 historical predictions): pure-momentum "down" calls on
  // structurally healthy cards mean-reverted (+19% realized on average) — a
  // dip without corroborating negative evidence is historically closer to a
  // buying window than a decline. Dampen momentum's downside weight in that
  // specific case; corroborated declines keep the full contribution.
  const momentumOnlyDip =
    momentumContribution < 0 &&
    momentumContribution >= -9 &&
    negativeConfirmations <= 1 &&
    catalystContribution >= 0 &&
    Math.max(0, input.riskScore) <= 0.1 &&
    qualityAverage >= 55;
  const effectiveMomentumContribution = momentumOnlyDip
    ? momentumContribution * 0.45
    : momentumContribution;
  // Same backtest: the tracked market drifts upward (~+6% realized per 180d
  // even on "flat" calls). A conservative fraction of that base rate keeps the
  // model from structurally under-predicting in a gently rising market.
  const baseRateDriftContribution = 2.5;
  const rawReturn180 = clamp(
    effectiveMomentumContribution +
      baseRateDriftContribution +
      sealedContribution +
      ebayContribution +
      competitiveContribution +
      catalystContribution +
      lifecycleContribution +
      oopProbabilityContribution +
      qualityContribution +
      qualityPenalty +
      valuationContribution +
      athContribution +
      momentum365Contribution +
      jpLeadLagContribution +
      setStrengthContribution +
      releasePhaseContribution -
      riskContribution,
    -60,
    80
  );
  // High confidence additionally requires calm daily dispersion; extreme
  // dispersion makes any point forecast unreliable regardless of evidence.
  const calculatedConfidence: ExternalPriceScenario["confidence"] =
    input.evidenceCount >= 3 &&
    input.historyPoints >= 8 &&
    (volatility == null || volatility <= 4.5)
      ? "High"
      : input.evidenceCount >= 2 || input.historyPoints >= 5
        ? "Medium"
        : "Low";
  const confidence: ExternalPriceScenario["confidence"] =
    volatility != null && volatility > 8
      ? "Low"
      : input.ageYears != null && input.ageYears < 1 && calculatedConfidence === "High"
        ? "Medium"
        : calculatedConfidence;
  const confidenceShrinkage = confidence === "High" ? 0.9 : confidence === "Medium" ? 0.68 : 0.4;
  const noiseFloorPct =
    currentPrice < 5 ? 3 : currentPrice < 25 ? 2.5 : currentPrice < 100 ? 2 : 1.5;
  const shrunkReturn180 = rawReturn180 * confidenceShrinkage;
  const provisionalReturnPct180 =
    Math.abs(shrunkReturn180) < noiseFloorPct ? 0 : Number(shrunkReturn180.toFixed(1));
  const visibleMove =
    currentPrice < 5
      ? { absolute: 1, percent: 20 }
      : currentPrice < 25
        ? { absolute: 2, percent: 15 }
        : currentPrice < 100
          ? { absolute: 5, percent: 12 }
          : { absolute: 10, percent: 10 };
  const expectedAbsoluteMove = Math.abs((currentPrice * provisionalReturnPct180) / 100);
  const outlook: NonNullable<ExternalPriceScenario["outlook"]> =
    provisionalReturnPct180 >= 20 && expectedAbsoluteMove >= visibleMove.absolute
      ? "strong_up"
      : provisionalReturnPct180 >= 4 && expectedAbsoluteMove >= Math.min(visibleMove.absolute, currentPrice * 0.04)
        ? "modest_up"
        : provisionalReturnPct180 <= -Math.max(2.5, visibleMove.percent * 0.25) &&
            expectedAbsoluteMove >= Math.min(visibleMove.absolute, currentPrice * 0.025)
          ? "down"
          : "flat";
  // A flat classification must also produce a truly horizontal base line.
  // Otherwise a €300 card still appears to be a prediction when the model only
  // found a few euros of ordinary market drift.
  const expectedReturnPct180 = outlook === "flat" ? 0 : provisionalReturnPct180;
  const uncertaintyMultiplier = confidence === "High" ? 0.75 : confidence === "Medium" ? 1 : 1.3;
  const releaseUncertaintyMultiplier =
    input.ageYears == null || input.ageYears >= 1
      ? 1
      : input.ageYears < 0.18
        ? 1.65
        : input.ageYears < 0.5
          ? 1.2
        : 1.1;
  // Observed daily dispersion widens or narrows the band around the pure
  // time-based spread when volatility is known.
  const volatilitySpreadMultiplier =
    volatility == null ? 1 : clamp(volatility / 1.8, 0.7, 1.9);
  // Symmetry: a bearish outlook gets the same widening on the low band that
  // bullish scenarios already get on the high band. Backtest: down calls that
  // missed did so UPWARD (mean-reverting dips), so the high side of a down
  // scenario gets the strongest widening.
  const lowSpreadFactor = outlook === "down" ? 1.35 : 1;
  const highSpreadFactor = outlook === "down" ? 1.5 : 1.15;
  const points = SCENARIO_DAYS.map((days) => {
    const months = days / 30;
    const horizonFactor =
      expectedReturnPct180 === 0
        ? 0
        : expectedReturnPct180 > 0
          ? input.ageYears != null && input.ageYears < 0.18
            ? days === 30
              ? 0.55
              : days === 90
                ? 0.82
                : 1
            : days === 30
              ? 0.35
              : days === 90
                ? 0.67
                : 1
          : days === 30
            ? 0.45
            : days === 90
              ? 0.75
              : 1;
    const base = currentPrice * (1 + (expectedReturnPct180 * horizonFactor) / 100);
    // Base spread widened after the backtest measured 56-74% band coverage
    // against the ~80% an honest 80%-style band should hit.
    const spread = Math.min(
      0.55,
      (0.07 + Math.sqrt(months) * 0.058) *
        uncertaintyMultiplier *
        releaseUncertaintyMultiplier *
        volatilitySpreadMultiplier
    );
    return {
      days,
      low: roundMoney(Math.max(currentPrice * 0.35, base * (1 - spread * lowSpreadFactor))),
      base: roundMoney(base),
      high: roundMoney(base * (1 + spread * highSpreadFactor)),
    };
  });
  const drivers = [
    input.sealedTrendPct != null ? "sealed trend" : null,
    input.rawTrend90dPct != null ? "market history" : null,
    input.scarcityScore >= 60 ? "structural scarcity" : null,
    input.marketMode === "graded" && input.gemRatePct != null ? "gem-rate" : null,
    input.ebayDemandAdjustment != null && input.ebayDemandAdjustment !== 0
      ? "eBay demand"
      : null,
    lifecycleContribution > 0
      ? "out-of-print pressure"
      : lifecycleContribution < 0
        ? "active supply or reprint"
        : null,
    catalystContribution !== 0 ? "fresh catalyst" : null,
    valuationContribution < 0 || athContribution < 0 ? "price overextension" : null,
    athContribution > 0 ? "recovery below all-time high" : null,
    momentumOnlyDip ? "uncorroborated dip (historically mean-reverts)" : null,
    input.ageYears != null && input.ageYears < 0.18
      ? "launch price discovery"
      : input.ageYears != null && input.ageYears < 1
        ? "post-release stabilization"
        : null,
  ].filter((value): value is string => Boolean(value));
  return {
    marketMode: input.marketMode,
    currentPrice,
    currency: input.currency,
    confidence,
    outlook,
    expectedReturnPct180,
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
