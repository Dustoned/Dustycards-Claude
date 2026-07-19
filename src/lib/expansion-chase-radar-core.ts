import type {
  ExternalCardSignal,
  ExternalPriceScenario,
} from "@/lib/external-signal-radar";
import { normalizeRarityLabel } from "@/lib/rarity";

const DAY_MS = 86_400_000;
const FRESH_PRICE_MAX_AGE_DAYS = 2;
const AGING_PRICE_MAX_AGE_DAYS = 7;
const LAUNCH_DISCOVERY_DAYS = 0.18 * 365.25;

export const DEFAULT_EXPANSION_CHASE_CANDIDATE_LIMIT = 10;
export const MAX_EXPANSION_CHASE_CANDIDATE_LIMIT = 12;

export type ExpansionChaseFreshness = "fresh" | "aging" | "stale" | "unknown";
export type ExpansionChaseReadiness =
  | "catalog_missing"
  | "prices_loading"
  | "price_discovery"
  | "ready"
  | "stale";
export type ExpansionChaseVerdictKey =
  | "strong_watch"
  | "building"
  | "price_discovery"
  | "stable"
  | "cooling"
  | "insufficient_data"
  | "data_stale";

export interface ExpansionChaseCandidateInput {
  id: string;
  name: string;
  imageUrl: string | null;
  cardNumber: string | null;
  printedCardNumber: string | null;
  rarity: string | null;
  currentPrice: number | null;
  priceFetchedAt: Date | string | null;
}

export interface ExpansionChaseReadinessInput {
  localCardCount: number;
  pricedCardCount: number;
  currentPricedCardCount: number;
  releaseDate: string | null;
  latestPriceAt: Date | string | null;
  now?: Date;
}

export interface ExpansionChaseReadinessSummary {
  readiness: ExpansionChaseReadiness;
  freshness: ExpansionChaseFreshness;
  priceCoveragePct: number;
  currentPriceCoveragePct: number;
  releaseAgeDays: number | null;
}

export interface ExpansionChaseVerdict {
  key: ExpansionChaseVerdictKey;
  label: string;
  summary: string;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function validDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function validPrice(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value) && value > 0 && value !== 9001;
}

function parsedCollectorNumbers(value: string | null | undefined): {
  numerator: number;
  denominator: number;
} | null {
  const match = value?.trim().match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!match) return null;
  const numerator = Number(match[1]);
  const denominator = Number(match[2]);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }
  return { numerator, denominator };
}

export function isSecretNumberedExpansionCard(
  card: Pick<ExpansionChaseCandidateInput, "cardNumber" | "printedCardNumber">
): boolean {
  const numbers =
    parsedCollectorNumbers(card.printedCardNumber) ?? parsedCollectorNumbers(card.cardNumber);
  return numbers != null && numbers.numerator > numbers.denominator;
}

/**
 * A deliberately broad rarity prior. New providers regularly introduce labels
 * before the shared normalizer knows them, so secret numbering and a small
 * top-price fallback remain independent candidate paths.
 */
export function getExpansionChaseRarityWeight(rarity: string | null | undefined): number {
  const value = (normalizeRarityLabel(rarity) ?? rarity ?? "").toLocaleLowerCase("en");
  if (!value) return 0;
  if (
    /manga|mega hyper|black white|special (?:illustration|art)|alternate art|treasure rare/.test(
      value
    )
  ) {
    return 100;
  }
  if (/hyper|secret|rainbow|shining|holo star|shiny ultra|special rare/.test(value)) {
    return 90;
  }
  if (/illustration rare|art rare|ultra rare|rare ultra|trainer gallery/.test(value)) {
    return 74;
  }
  if (/radiant|amazing|classic collection|legend/.test(value)) return 58;
  if (/double rare|super rare|leader|rare holo/.test(value)) return 34;
  if (/promo/.test(value)) return 24;
  return 0;
}

function candidatePriority(card: ExpansionChaseCandidateInput): number {
  const rarityWeight = getExpansionChaseRarityWeight(card.rarity);
  const secretNumbered = isSecretNumberedExpansionCard(card);
  const priceWeight = validPrice(card.currentPrice)
    ? Math.min(24, Math.log10(card.currentPrice + 1) * 9)
    : 0;
  return rarityWeight + (secretNumbered ? 18 : 0) + priceWeight;
}

function compareCandidates(
  left: ExpansionChaseCandidateInput,
  right: ExpansionChaseCandidateInput
): number {
  return (
    candidatePriority(right) - candidatePriority(left) ||
    (right.currentPrice ?? 0) - (left.currentPrice ?? 0) ||
    left.name.localeCompare(right.name, "en") ||
    left.id.localeCompare(right.id)
  );
}

export function selectExpansionChaseCandidates(
  cards: readonly ExpansionChaseCandidateInput[],
  requestedLimit = DEFAULT_EXPANSION_CHASE_CANDIDATE_LIMIT
): ExpansionChaseCandidateInput[] {
  const limit = clamp(
    Math.floor(requestedLimit) || DEFAULT_EXPANSION_CHASE_CANDIDATE_LIMIT,
    1,
    MAX_EXPANSION_CHASE_CANDIDATE_LIMIT
  );
  const priced = cards.filter((card) => validPrice(card.currentPrice));
  const explicit = priced.filter(
    (card) =>
      getExpansionChaseRarityWeight(card.rarity) >= 58 ||
      isSecretNumberedExpansionCard(card)
  );
  // Preserve unusual or newly named chase rarities by always considering the
  // three most expensive set cards above the Radar's existing EUR 3 floor.
  const priceFallback = [...priced]
    .filter((card) => (card.currentPrice ?? 0) >= 3)
    .sort(
      (left, right) =>
        (right.currentPrice ?? 0) - (left.currentPrice ?? 0) ||
        left.id.localeCompare(right.id)
    )
    .slice(0, 3);
  const candidates = new Map<string, ExpansionChaseCandidateInput>();
  for (const card of [...explicit, ...priceFallback]) candidates.set(card.id, card);
  return [...candidates.values()].sort(compareCandidates).slice(0, limit);
}

export function calculateExpansionChaseSeedScore(
  card: ExpansionChaseCandidateInput
): number {
  const rarity = getExpansionChaseRarityWeight(card.rarity);
  const secretBonus = isSecretNumberedExpansionCard(card) ? 3 : 0;
  const priceEvidence = validPrice(card.currentPrice)
    ? Math.min(4, Math.log10(card.currentPrice + 1) * 1.5)
    : 0;
  return Math.round(clamp(45 + rarity * 0.22 + secretBonus + priceEvidence, 45, 72));
}

export function getExpansionChaseFreshness(
  priceFetchedAt: Date | string | null | undefined,
  now = new Date()
): ExpansionChaseFreshness {
  const fetchedAt = validDate(priceFetchedAt);
  if (!fetchedAt) return "unknown";
  const ageDays = Math.max(0, (now.getTime() - fetchedAt.getTime()) / DAY_MS);
  if (ageDays <= FRESH_PRICE_MAX_AGE_DAYS) return "fresh";
  if (ageDays <= AGING_PRICE_MAX_AGE_DAYS) return "aging";
  return "stale";
}

export function getExpansionChaseReadiness(
  input: ExpansionChaseReadinessInput
): ExpansionChaseReadinessSummary {
  const now = input.now ?? new Date();
  const localCardCount = Math.max(0, input.localCardCount);
  const pricedCardCount = clamp(input.pricedCardCount, 0, localCardCount);
  const currentPricedCardCount = clamp(input.currentPricedCardCount, 0, pricedCardCount);
  const priceCoveragePct =
    localCardCount === 0 ? 0 : Number(((pricedCardCount / localCardCount) * 100).toFixed(1));
  const currentPriceCoveragePct =
    localCardCount === 0
      ? 0
      : Number(((currentPricedCardCount / localCardCount) * 100).toFixed(1));
  const release = validDate(input.releaseDate);
  const releaseAgeDays = release
    ? Number(Math.max(0, (now.getTime() - release.getTime()) / DAY_MS).toFixed(1))
    : null;
  const freshness = getExpansionChaseFreshness(input.latestPriceAt, now);

  let readiness: ExpansionChaseReadiness;
  if (localCardCount === 0) readiness = "catalog_missing";
  else if (pricedCardCount === 0 || priceCoveragePct < 60) readiness = "prices_loading";
  else if (freshness === "stale" || currentPriceCoveragePct < 60) readiness = "stale";
  else if (releaseAgeDays != null && releaseAgeDays < LAUNCH_DISCOVERY_DAYS) {
    readiness = "price_discovery";
  } else readiness = "ready";

  return {
    readiness,
    freshness,
    priceCoveragePct,
    currentPriceCoveragePct,
    releaseAgeDays,
  };
}

function scenarioReturn180(scenario: ExternalPriceScenario | null | undefined): number {
  if (!scenario || scenario.currentPrice <= 0) return Number.NEGATIVE_INFINITY;
  if (scenario.expectedReturnPct180 != null) return scenario.expectedReturnPct180;
  const horizon = scenario.points.find((point) => point.days === 180) ?? scenario.points.at(-1);
  return horizon
    ? ((horizon.base - scenario.currentPrice) / scenario.currentPrice) * 100
    : Number.NEGATIVE_INFINITY;
}

export function rankExpansionChaseSignals<T extends ExternalCardSignal>(
  signals: readonly T[]
): T[] {
  return [...signals].sort((left, right) => {
    const leftMarket = left.marketIntelligence;
    const rightMarket = right.marketIntelligence;
    const scoreDelta =
      (rightMarket?.rawOpportunityScore ?? right.externalScore) -
      (leftMarket?.rawOpportunityScore ?? left.externalScore);
    if (scoreDelta !== 0) return scoreDelta;
    const returnDelta =
      scenarioReturn180(rightMarket?.rawScenario) - scenarioReturn180(leftMarket?.rawScenario);
    if (returnDelta !== 0) return returnDelta;
    const confluenceDelta =
      (rightMarket?.rawConfluence?.score ?? rightMarket?.confluence.score ?? 0) -
      (leftMarket?.rawConfluence?.score ?? leftMarket?.confluence.score ?? 0);
    if (confluenceDelta !== 0) return confluenceDelta;
    return left.cardId.localeCompare(right.cardId);
  });
}

export function getExpansionChaseVerdict(input: {
  scenario: ExternalPriceScenario | null | undefined;
  opportunityScore: number | null | undefined;
  freshness: ExpansionChaseFreshness;
  observedChange7dPct?: number | null;
}): ExpansionChaseVerdict {
  if (input.freshness === "stale") {
    return {
      key: "data_stale",
      label: "Data stale",
      summary: "Refresh prices before judging this chase.",
    };
  }
  const scenario = input.scenario;
  const launchMarket =
    scenario?.drivers.includes("launch price discovery") ||
    scenario?.drivers.includes("post-release stabilization");
  if (
    launchMarket &&
    input.observedChange7dPct != null &&
    Number.isFinite(input.observedChange7dPct) &&
    input.observedChange7dPct <= -8
  ) {
    return {
      key: "cooling",
      label: "Cooling",
      summary: "Below its 7-day baseline. Wait for a stable floor.",
    };
  }
  if (!scenario) {
    return {
      key: "insufficient_data",
      label: "Insufficient data",
      summary: "There is not enough price history for a directional read yet.",
    };
  }
  // A modeled downside is useful even while confidence is still forming: the
  // safest launch-market guidance is to avoid chasing the current ask.
  if (scenario.outlook === "down") {
    return {
      key: "cooling",
      label: "Cooling",
      summary: "The base case is down, so avoid chasing the current ask.",
    };
  }
  if (scenario.confidence === "Low" || input.freshness === "unknown") {
    return {
      key: "price_discovery",
      label: "Price discovery",
      summary: "The early market is still too uncertain for a firm call.",
    };
  }
  if (
    scenario.outlook === "strong_up" &&
    (input.opportunityScore ?? 0) >= 75
  ) {
    return {
      key: "strong_watch",
      label: "Strong watch",
      summary: "Upside and market evidence currently reinforce each other.",
    };
  }
  if (scenario.outlook === "strong_up" || scenario.outlook === "modest_up") {
    return {
      key: "building",
      label: "Building",
      summary: "The setup is positive, but confirmation is still developing.",
    };
  }
  return {
    key: "stable",
    label: "Stable - wait",
    summary: "The model sees no clear entry edge at the current price.",
  };
}
