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

const COLLECTION_EUR_FORMATTER = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export type CollectionBinderType = "linked_set" | "custom";

export interface CollectionCardValueLike {
  prices?: Array<{
    cm_en_lowest_nm: number | null;
    cm_de_lowest_nm: number | null;
    cm_fr_lowest_nm: number | null;
    cm_es_lowest_nm: number | null;
    cm_it_lowest_nm: number | null;
  }>;
  gradedPrices?: Array<{
    label: string;
    price: number;
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

  return COLLECTION_EUR_FORMATTER.format(value);
}

function normalizeGradeToken(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase().replace(/\s+/g, " ") ?? "";
  if (!normalized) return null;

  if (/^\d+(?:\.0+)?$/.test(normalized)) {
    return String(Number(normalized));
  }

  return normalized;
}

function buildGradedLabelCandidates(
  gradingCompany: string | null | undefined,
  gradingGrade: string | null | undefined
): string[] {
  const company = gradingCompany?.trim().toUpperCase();
  const grade = normalizeGradeToken(gradingGrade);

  if (!company || !grade) return [];

  const candidates = new Set<string>([`${company} ${grade}`]);

  if (/^\d+(?:\.\d+)?$/.test(grade)) {
    candidates.add(`${company} ${Number(grade)}`);
    if (!grade.includes(".")) {
      candidates.add(`${company} ${grade}.0`);
    }
  }

  return [...candidates];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeGradedLabelKey(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getCollectionMatchedGradedPrice(
  card: CollectionCardValueLike | null | undefined,
  options?: {
    gradingCompany?: string | null;
    gradingGrade?: string | null;
  }
): { label: string; price: number } | null {
  const candidates = buildGradedLabelCandidates(
    options?.gradingCompany,
    options?.gradingGrade
  );
  if (candidates.length === 0) return null;

  const normalizedCandidates = candidates.map((candidate) => normalizeGradedLabelKey(candidate));
  const exactCandidates = new Set(normalizedCandidates);
  const compactCandidates = new Set(
    normalizedCandidates.map((candidate) => candidate.replace(/\s+/g, ""))
  );
  const prefixMatchers = normalizedCandidates.map(
    (candidate) =>
      new RegExp(
        `^${escapeRegExp(candidate).replace(/\\ /g, "\\s*")}(?![\\d.])(?:$|\\b|\\s|[-(/])`,
        "i"
      )
  );

  for (const gradedPrice of card?.gradedPrices ?? []) {
    const normalizedLabel = normalizeGradedLabelKey(gradedPrice.label);
    const compactLabel = normalizedLabel.replace(/\s+/g, "");

    if (
      exactCandidates.has(normalizedLabel) ||
      compactCandidates.has(compactLabel) ||
      prefixMatchers.some((matcher) => matcher.test(normalizedLabel))
    ) {
      return gradedPrice;
    }
  }

  return null;
}

export function getCollectionCardMarketValue(
  card: CollectionCardValueLike | null | undefined,
  options?: {
    gradingCompany?: string | null;
    gradingGrade?: string | null;
  }
): number | null {
  const matchedGradedPrice = getCollectionMatchedGradedPrice(card, options);
  if (matchedGradedPrice) {
    return matchedGradedPrice.price;
  }

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
  const sortedHistories = histories.map((history) =>
    [...history].sort((a, b) => a.date.localeCompare(b.date))
  );
  const dates = [
    ...new Set(sortedHistories.flatMap((history) => history.map((point) => point.date))),
  ].sort((a, b) => a.localeCompare(b));
  const indexes = sortedHistories.map(() => 0);
  const latestValues = sortedHistories.map<number | null>(() => null);
  const latestPricedCards = sortedHistories.map<number>(() => 0);

  return dates.map((date) => {
    for (const [historyIndex, history] of sortedHistories.entries()) {
      let index = indexes[historyIndex];

      while (index < history.length && history[index].date <= date) {
        latestValues[historyIndex] = history[index].total_market;
        latestPricedCards[historyIndex] = history[index].priced_cards;
        index += 1;
      }

      indexes[historyIndex] = index;
    }

    const totalMarket = latestValues.reduce<number>(
      (total, value) => total + (value ?? 0),
      0
    );

    return {
      date,
      label: new Intl.DateTimeFormat("nl-NL", {
        day: "numeric",
        month: "short",
      }).format(new Date(`${date}T00:00:00.000Z`)),
      total_market: Number(totalMarket.toFixed(2)),
      priced_cards: latestPricedCards.reduce((total, count) => total + count, 0),
    };
  });
}
