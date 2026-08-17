import { normalizeRarityLabel } from "@/lib/rarity";

export const OLDER_HIGH_RARITY_VALUE_KIND = "older-high-rarity-value" as const;
export const OLDER_HIGH_RARITY_MIN_AGE_YEARS = 5;
export const OLDER_HIGH_RARITY_MIN_PRICE_EUR = 15;
export const OLDER_HIGH_RARITY_MAX_PRICE_EUR = 600;
export const OLDER_HIGH_RARITY_MAX_SET_COHORT = 20;
export const OLDER_HIGH_RARITY_MIN_HISTORY_POINTS = 5;

export const STRICT_OLDER_HIGH_RARITIES = [
  "Rare Ultra",
  "Ultra Rare",
  "Secret Rare",
  "Rare Rainbow",
  "Rare Holo EX",
  "Rare Holo GX",
  "Rare Holo LV.X",
  "Rare Holo Star",
  "Rare Prime",
  "Rare Shiny GX",
  "Rare Shining",
  "LEGEND",
  "Alternate Art",
  "Manga Rare",
  "Special Rare",
  "Special Illustration Rare",
  "Special Art Rare",
  "Shiny Ultra Rare",
  "Hyper Rare",
  "Black White Rare",
  "Mega Hyper Rare",
  "Treasure Rare",
] as const;

const STRICT_OLDER_HIGH_RARITY_SET = new Set<string>(STRICT_OLDER_HIGH_RARITIES);

export interface OlderHighRarityValueInput {
  game: string;
  rarity: string | null | undefined;
  ageYears: number;
  currentPrice: number;
  rarityCohortSize: number;
  historyPoints: number;
}

export interface OlderHighRarityValueProfile {
  kind: typeof OLDER_HIGH_RARITY_VALUE_KIND;
  ageYears: number;
  rarityCohortSize: number;
  historyPoints: number;
}

export type OlderHighRarityPriceSource = "cardmarket" | "tcgplayer";

export interface OlderHighRarityMarketPrices {
  cardmarketEur: number | null;
  tcgplayerUsd: number | null;
  tcgplayerEur: number | null;
  usdToEurRate: number | null;
  usdToEurRateDate: string | null;
}

export interface OlderHighRarityDisplayPrice {
  value: number;
  currency: "EUR" | "USD";
  convertedEur: number | null;
}

export function getOlderHighRarityDisplayPrice(
  prices: OlderHighRarityMarketPrices | null | undefined,
  source: OlderHighRarityPriceSource,
): OlderHighRarityDisplayPrice | null {
  if (source === "tcgplayer") {
    if (
      prices?.tcgplayerUsd == null ||
      !Number.isFinite(prices.tcgplayerUsd) ||
      prices.tcgplayerUsd <= 0 ||
      prices.tcgplayerUsd === 9001
    ) {
      return null;
    }

    return {
      value: prices.tcgplayerUsd,
      currency: "USD",
      convertedEur: prices.tcgplayerEur,
    };
  }

  if (
    prices?.cardmarketEur == null ||
    !Number.isFinite(prices.cardmarketEur) ||
    prices.cardmarketEur <= 0 ||
    prices.cardmarketEur === 9001
  ) {
    return null;
  }

  return {
    value: prices.cardmarketEur,
    currency: "EUR",
    convertedEur: prices.cardmarketEur,
  };
}

export function isStrictOlderHighRarity(
  rarity: string | null | undefined,
): boolean {
  const normalized = normalizeRarityLabel(rarity);
  return normalized != null && STRICT_OLDER_HIGH_RARITY_SET.has(normalized);
}

export function getOlderHighRarityValueProfile(
  input: OlderHighRarityValueInput,
): OlderHighRarityValueProfile | null {
  if (
    input.game !== "pokemon" ||
    !isStrictOlderHighRarity(input.rarity) ||
    !Number.isFinite(input.ageYears) ||
    input.ageYears < OLDER_HIGH_RARITY_MIN_AGE_YEARS ||
    !Number.isFinite(input.currentPrice) ||
    input.currentPrice < OLDER_HIGH_RARITY_MIN_PRICE_EUR ||
    input.currentPrice > OLDER_HIGH_RARITY_MAX_PRICE_EUR ||
    !Number.isInteger(input.rarityCohortSize) ||
    input.rarityCohortSize < 1 ||
    input.rarityCohortSize > OLDER_HIGH_RARITY_MAX_SET_COHORT ||
    input.historyPoints < OLDER_HIGH_RARITY_MIN_HISTORY_POINTS
  ) {
    return null;
  }

  return {
    kind: OLDER_HIGH_RARITY_VALUE_KIND,
    ageYears: Number(input.ageYears.toFixed(1)),
    rarityCohortSize: input.rarityCohortSize,
    historyPoints: input.historyPoints,
  };
}

export function isOlderHighRarityValueSignal(signal: {
  olderHighRarityValue?: OlderHighRarityValueProfile | null;
}): boolean {
  return signal.olderHighRarityValue?.kind === OLDER_HIGH_RARITY_VALUE_KIND;
}

export function isOlderHighRarityValueSignalAtLeastAge(
  signal: {
    olderHighRarityValue?: OlderHighRarityValueProfile | null;
  },
  minimumAgeYears: number,
): boolean {
  return (
    isOlderHighRarityValueSignal(signal) &&
    Number.isFinite(minimumAgeYears) &&
    (signal.olderHighRarityValue?.ageYears ?? 0) >=
      Math.max(OLDER_HIGH_RARITY_MIN_AGE_YEARS, minimumAgeYears)
  );
}
