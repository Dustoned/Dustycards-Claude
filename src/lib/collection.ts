import {
  buildEpisodeSetPriceHistory,
  buildEpisodeSealedSetPriceHistory,
  getCardMarketValue,
  getSealedCardMarketValue,
  type EpisodePriceHistorySnapshot,
  type EpisodeSealedPriceHistorySnapshot,
  type EpisodeSetPriceHistoryPoint,
} from "@/lib/price-history";

export const COLLECTION_CONDITIONS = [
  "Mint",
  "Near Mint",
  "Excellent",
  "Good",
  "Light Played",
  "Played",
  "Poor",
] as const;

export const COLLECTION_LANGUAGES = [
  "English",
  "Japanese",
  "German",
  "French",
  "Spanish",
  "Italian",
  "Dutch",
  "Portuguese",
  "Korean",
  "Chinese",
] as const;

export const COLLECTION_GRADING_COMPANIES = [
  "PSA",
  "BGS",
  "CGC",
  "ACE",
  "SGC",
  "Other",
] as const;

export const COLLECTION_BINDER_ICONS = [
  "book",
  "star",
  "sparkles",
  "shield",
  "gem",
  "flame",
] as const;

export const COLLECTION_BINDER_COLORS = [
  "#2563eb",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#8b5cf6",
  "#06b6d4",
  "#f97316",
] as const;

export type CollectionBinderType = "linked_set" | "custom";

export interface CollectionCardValueLike {
  prices?: Array<{
    cm_en_lowest_nm: number | null;
    cm_de_lowest_nm: number | null;
    cm_fr_lowest_nm: number | null;
    cm_es_lowest_nm: number | null;
    cm_it_lowest_nm: number | null;
  }>;
}

export interface CollectionSealedValueLike {
  cm_lowest: number | null;
  cm_lowest_eu: number | null;
  cm_lowest_de: number | null;
  cm_lowest_fr: number | null;
  cm_lowest_es: number | null;
  cm_lowest_it: number | null;
}

export function parseCollectionTags(input: string): string[] {
  return [...new Set(
    input
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 12)
  )];
}

export function formatCollectionCurrency(value: number | null | undefined): string {
  if (value == null) return "--";

  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function getCollectionCardMarketValue(card: CollectionCardValueLike | null | undefined): number | null {
  return getCardMarketValue(card?.prices?.[0] ?? null);
}

export function getCollectionSealedMarketValue(
  product: CollectionSealedValueLike | null | undefined
): number | null {
  if (!product) return null;

  return (
    product.cm_lowest ??
    product.cm_lowest_eu ??
    product.cm_lowest_de ??
    product.cm_lowest_fr ??
    product.cm_lowest_es ??
    product.cm_lowest_it ??
    null
  );
}

export function sumCollectionPurchasePrices(
  values: Array<number | null | undefined>
): number {
  const total = values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  return Number(total.toFixed(2));
}

export function buildOwnedCardValueHistory(
  prices: EpisodePriceHistorySnapshot[],
  quantitiesByCardId: ReadonlyMap<string, number>
): EpisodeSetPriceHistoryPoint[] {
  if (quantitiesByCardId.size === 0) return [];

  const weighted: EpisodePriceHistorySnapshot[] = [];

  for (const price of prices) {
      const quantity = quantitiesByCardId.get(price.card_id) ?? 0;
      if (quantity <= 0) continue;

      const marketValue = getCardMarketValue(price);
      if (marketValue == null) continue;

      weighted.push({
        ...price,
        cm_en_lowest_nm: Number((marketValue * quantity).toFixed(2)),
        cm_de_lowest_nm: null,
        cm_fr_lowest_nm: null,
        cm_es_lowest_nm: null,
        cm_it_lowest_nm: null,
      });
  }

  return buildEpisodeSetPriceHistory(weighted);
}

export function buildOwnedSealedValueHistory(
  prices: EpisodeSealedPriceHistorySnapshot[],
  quantitiesByProductId: ReadonlyMap<string, number>
): EpisodeSetPriceHistoryPoint[] {
  if (quantitiesByProductId.size === 0) return [];

  const weighted: EpisodeSealedPriceHistorySnapshot[] = [];

  for (const price of prices) {
      const quantity = quantitiesByProductId.get(price.product_id) ?? 0;
      if (quantity <= 0) continue;

      const marketValue = getSealedCardMarketValue(price);
      if (marketValue == null) continue;

      weighted.push({
        ...price,
        cm_lowest: Number((marketValue * quantity).toFixed(2)),
        cm_lowest_eu: null,
        cm_lowest_de: null,
        cm_lowest_fr: null,
        cm_lowest_es: null,
        cm_lowest_it: null,
      });
  }

  return buildEpisodeSealedSetPriceHistory(weighted);
}

export function combineValueHistories(
  ...histories: EpisodeSetPriceHistoryPoint[][]
): EpisodeSetPriceHistoryPoint[] {
  const totalsByDate = new Map<string, number>();

  for (const history of histories) {
    for (const point of history) {
      totalsByDate.set(
        point.date,
        Number(((totalsByDate.get(point.date) ?? 0) + point.total_market).toFixed(2))
      );
    }
  }

  return [...totalsByDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, total_market]) => ({
      date,
      label: new Intl.DateTimeFormat("nl-NL", {
        day: "numeric",
        month: "short",
      }).format(new Date(`${date}T00:00:00.000Z`)),
      total_market,
      priced_cards: 0,
    }));
}
