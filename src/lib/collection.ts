import { formatCurrency } from "@/lib/format";
import {
  convertUsdToEur,
  type CurrencyExchangeRate,
} from "@/lib/exchange-rates";
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
  "SGC",
  "ACE",
  "TAG",
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
  "#7C5CFF",
  "#9278FF",
  "#B39BFF",
  "#38BDF8",
  "#FBBF24",
  "#EC4899",
  "#6E4DFF",
  "#353C50",
] as const;


export type CollectionBinderType = "linked_set" | "custom";

export interface CollectionCardValueLike {
  prices?: Array<{
    cm_en_lowest_nm: number | null;
    cm_de_lowest_nm: number | null;
    cm_fr_lowest_nm: number | null;
    cm_es_lowest_nm: number | null;
    cm_it_lowest_nm: number | null;
    cm_jp_lowest_nm?: number | null;
  }>;
  gradedPrices?: Array<{
    label: string;
    price: number;
  }>;
  ebaySoldGradedPrices?: Array<{
    label: string;
    company: string;
    grade: string;
    median_price: number;
    currency: string;
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
  return formatCurrency(value, "EUR");
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
    usdToEurRate?: CurrencyExchangeRate | null;
  }
): { label: string; price: number; source: "ebay_sold_graded" | "cardmarket_graded" } | null {
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

  const normalizedCompany = options?.gradingCompany
    ? normalizeGradedLabelKey(options.gradingCompany)
    : null;
  const normalizedGrade = normalizeGradeToken(options?.gradingGrade);

  for (const gradedPrice of card?.gradedPrices ?? []) {
    const normalizedLabel = normalizeGradedLabelKey(gradedPrice.label);
    const compactLabel = normalizedLabel.replace(/\s+/g, "");

    if (
      exactCandidates.has(normalizedLabel) ||
      compactCandidates.has(compactLabel) ||
      prefixMatchers.some((matcher) => matcher.test(normalizedLabel))
    ) {
      return {
        ...gradedPrice,
        source: "cardmarket_graded",
      };
    }
  }

  for (const ebaySoldPrice of card?.ebaySoldGradedPrices ?? []) {
    const currency = ebaySoldPrice.currency.toUpperCase();
    const price =
      currency === "EUR"
        ? ebaySoldPrice.median_price
        : currency === "USD"
          ? convertUsdToEur(ebaySoldPrice.median_price, options?.usdToEurRate ?? null)
          : null;

    if (price == null) continue;

    const structuredMatch =
      normalizedCompany &&
      normalizedGrade &&
      normalizeGradedLabelKey(ebaySoldPrice.company) === normalizedCompany &&
      normalizeGradeToken(ebaySoldPrice.grade) === normalizedGrade;
    const normalizedLabel = normalizeGradedLabelKey(ebaySoldPrice.label);
    const compactLabel = normalizedLabel.replace(/\s+/g, "");
    const labelMatch =
      exactCandidates.has(normalizedLabel) ||
      compactCandidates.has(compactLabel) ||
      prefixMatchers.some((matcher) => matcher.test(normalizedLabel));

    if (structuredMatch || labelMatch) {
      return {
        label: `${ebaySoldPrice.label} eBay sold`,
        price,
        source: "ebay_sold_graded",
      };
    }
  }

  return null;
}

export interface CollectionCardValueInfo {
  value: number | null;
  label: string | null;
  source: "raw" | "raw_floor" | "cardmarket_graded" | "ebay_sold_graded" | "none";
  matchedGradedPrice:
    | { label: string; price: number; source: "ebay_sold_graded" | "cardmarket_graded" }
    | null;
}

export function getCollectionCardValueInfo(
  card: CollectionCardValueLike | null | undefined,
  options?: {
    gradingCompany?: string | null;
    gradingGrade?: string | null;
    usdToEurRate?: CurrencyExchangeRate | null;
  }
): CollectionCardValueInfo {
  const rawValue = getCardMarketValue(card?.prices?.[0] ?? null);
  const matchedGradedPrice = getCollectionMatchedGradedPrice(card, options);

  if (!matchedGradedPrice) {
    return {
      value: rawValue,
      label: null,
      source: rawValue == null ? "none" : "raw",
      matchedGradedPrice: null,
    };
  }

  if (
    matchedGradedPrice.source === "ebay_sold_graded" &&
    rawValue != null &&
    rawValue > matchedGradedPrice.price
  ) {
    return {
      value: rawValue,
      label: "CardMarket raw floor",
      source: "raw_floor",
      matchedGradedPrice,
    };
  }

  return {
    value: matchedGradedPrice.price,
    label: matchedGradedPrice.label,
    source: matchedGradedPrice.source,
    matchedGradedPrice,
  };
}

export function getCollectionCardMarketValue(
  card: CollectionCardValueLike | null | undefined,
  options?: {
    gradingCompany?: string | null;
    gradingGrade?: string | null;
    usdToEurRate?: CurrencyExchangeRate | null;
  }
): number | null {
  return getCollectionCardValueInfo(card, options).value;
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

export type CollectionCostBasisLabel = "Paid" | "Overall Spend";
export type CollectionCostBasisSource = "direct" | "linked_binder_allocation";

export interface CollectionCostBasis {
  value: number;
  label: CollectionCostBasisLabel;
  source: CollectionCostBasisSource;
}

export interface LinkedBinderCostBasisItem {
  itemId: string;
  episodeId: string | null;
  directPurchasePrice?: number | null;
  currentValue?: number | null;
}

function toCentValue(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100);
}

function fromCentValue(value: number): number {
  return Number((value / 100).toFixed(2));
}

export function buildLinkedBinderCostBasis({
  binderType,
  binderEpisodeId,
  binderBasePurchasePrice,
  items,
}: {
  binderType: string | null | undefined;
  binderEpisodeId: string | null | undefined;
  binderBasePurchasePrice?: number | null;
  items: LinkedBinderCostBasisItem[];
}): Map<string, CollectionCostBasis> {
  const result = new Map<string, CollectionCostBasis>();

  if (binderType !== "linked_set" || !binderEpisodeId) {
    return result;
  }

  const eligibleItems = items.filter((item) => item.episodeId === binderEpisodeId);
  if (eligibleItems.length === 0) {
    return result;
  }

  const poolCents =
    toCentValue(binderBasePurchasePrice) +
    eligibleItems.reduce((total, item) => total + toCentValue(item.directPurchasePrice), 0);

  if (poolCents <= 0) {
    return result;
  }

  const positiveValues = eligibleItems
    .map((item) => item.currentValue)
    .filter((value): value is number => value != null && Number.isFinite(value) && value > 0);
  const fallbackWeight = positiveValues.length > 0 ? Math.min(...positiveValues) : 1;
  const weightedItems = eligibleItems.map((item, index) => ({
    item,
    index,
    weight:
      item.currentValue != null && Number.isFinite(item.currentValue) && item.currentValue > 0
        ? item.currentValue
        : fallbackWeight,
  }));
  const totalWeight = weightedItems.reduce((total, item) => total + item.weight, 0);

  if (totalWeight <= 0) {
    return result;
  }

  const allocations = weightedItems.map((item) => {
    const rawCents = (poolCents * item.weight) / totalWeight;
    return {
      ...item,
      cents: Math.floor(rawCents),
    };
  });
  let remainder =
    poolCents - allocations.reduce((total, allocation) => total + allocation.cents, 0);

  for (const allocation of [...allocations].sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    return a.index - b.index;
  })) {
    if (remainder <= 0) break;
    allocation.cents += 1;
    remainder -= 1;
  }

  for (const allocation of allocations) {
    result.set(allocation.item.itemId, {
      value: fromCentValue(allocation.cents),
      label: "Overall Spend",
      source: "linked_binder_allocation",
    });
  }

  return result;
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
      label: new Intl.DateTimeFormat("en-US", {
        day: "numeric",
        month: "short",
      }).format(new Date(`${date}T00:00:00.000Z`)),
      total_market: Number(totalMarket.toFixed(2)),
      priced_cards: latestPricedCards.reduce((total, count) => total + count, 0),
    };
  });
}
