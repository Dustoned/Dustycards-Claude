export function getComparableRadarPrice(quote: {
  currentPrice: number | null;
  currency: "EUR" | "USD";
  currentPriceEur?: number | null;
}): number | null {
  const value = quote.currency === "EUR" ? quote.currentPrice : quote.currentPriceEur;
  return value != null && Number.isFinite(value) && value > 0 ? value : null;
}

export type SignalRadarSortKey =
  | "opportunity"
  | "price_asc"
  | "price_desc"
  | "release_newest"
  | "release_oldest"
  | "rarity_cohort"
  | "history"
  | "confluence"
  | "signal"
  | "sealed"
  | "scarcity"
  | "meta"
  | "reach";

export interface SignalRadarSortOption {
  value: SignalRadarSortKey;
  label: string;
}

export const SIGNAL_RADAR_SORT_OPTIONS: readonly SignalRadarSortOption[] = [
  { value: "opportunity", label: "Best match" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "release_newest", label: "Newest release" },
  { value: "release_oldest", label: "Oldest release" },
  { value: "confluence", label: "Setup" },
  { value: "signal", label: "Signal" },
  { value: "sealed", label: "Sealed pressure" },
  { value: "scarcity", label: "Scarcity" },
  { value: "meta", label: "Meta share" },
  { value: "reach", label: "Archetype reach" },
] as const;

export const OLDER_HIGH_RARITY_SORT_OPTIONS: readonly SignalRadarSortOption[] = [
  { value: "opportunity", label: "Best value fit" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "release_oldest", label: "Oldest cards first" },
  { value: "release_newest", label: "Newest cards first" },
  { value: "rarity_cohort", label: "Smallest rarity tier" },
  { value: "history", label: "Most price evidence" },
] as const;

export function getSignalRadarSortOptions(
  olderHighRarity: boolean,
): readonly SignalRadarSortOption[] {
  return olderHighRarity
    ? OLDER_HIGH_RARITY_SORT_OPTIONS
    : SIGNAL_RADAR_SORT_OPTIONS;
}

export function resolveSignalRadarSortKey(
  requested: SignalRadarSortKey,
  olderHighRarity: boolean,
): SignalRadarSortKey {
  const options = getSignalRadarSortOptions(olderHighRarity);
  return options.some((option) => option.value === requested)
    ? requested
    : "opportunity";
}
