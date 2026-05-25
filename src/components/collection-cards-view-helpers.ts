import { type CardSize, type PriceSource, type SortBy, type SortDir } from "@/components/SettingsProvider";
import {
  normalizeGradingCompanyLabel,
  normalizeGradingGradeLabel,
} from "@/lib/graded-slabs";
import { CARD_NUMBER_FALLBACK, cardNumberCollator } from "@/lib/card-number-sort";
import { formatCurrency, type CurrencyCode } from "@/lib/format";
import { rarityBadge } from "@/lib/rarity-styles";
import type { CollectionCardViewItem } from "@/types/collection-view";

export { CARD_NUMBER_FALLBACK, cardNumberCollator };

export const KNOWN_SUPERTYPE_ORDER = ["pokemon", "trainer", "energy"] as const;

export interface FilterOption {
  value: string;
  count: number;
}

export interface PreparedCollectionEntry {
  item: CollectionCardViewItem;
  selectionKey: string;
  normalizedRarity: string | null;
  isPriced: boolean;
  isGraded: boolean;
}

export function buildFilterOptions(
  values: Array<string | null | undefined>,
  preferredOrder: readonly string[],
  normalizeValue?: (value: string | null | undefined) => string | null
): FilterOption[] {
  const counts = new Map<string, number>();

  for (const rawValue of values) {
    const value = normalizeValue ? normalizeValue(rawValue) : rawValue?.trim() ?? null;
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  const rankByValue = new Map(
    preferredOrder.map((value, index) => [value.trim().toLowerCase(), index])
  );

  return [...counts.entries()]
    .sort(([a], [b]) => {
      const aRank = rankByValue.get(a.toLowerCase());
      const bRank = rankByValue.get(b.toLowerCase());

      if (aRank != null || bRank != null) {
        if (aRank == null) return 1;
        if (bRank == null) return -1;
        if (aRank !== bRank) return aRank - bRank;
      }

      return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
    })
    .map(([value, count]) => ({ value, count }));
}

export function rarityFilterChip(rarity: string | null, active: boolean): string {
  const palette = rarityBadge(rarity);

  if (active) {
    return `${palette} border-black/22 dark:border-white/22 opacity-100`;
  }

  return `${palette} border-black/8 dark:border-white/8 opacity-80 hover:opacity-100 hover:border-black/15 dark:hover:border-white/16`;
}

export function neutralFilterChip(active: boolean): string {
  if (active) {
    return "border-violet-400/40 bg-violet-600 text-white opacity-100";
  }

  return "border-white/8 text-white/55 opacity-85 hover:border-white/16 hover:opacity-100 hover:text-white";
}

export function selectionToggleTextClass(active: boolean): string {
  if (active) {
    return "shrink-0 text-xs font-semibold text-violet-200 transition-colors hover:text-violet-100";
  }

  return "shrink-0 text-xs font-medium text-white/45 transition-colors hover:text-white/75";
}

export function isGradedCollectionCard(item: CollectionCardViewItem): boolean {
  return Boolean(
    item.owned &&
      normalizeGradingCompanyLabel(item.grading_company) &&
      normalizeGradingGradeLabel(item.grading_grade)
  );
}

export function formatMarketCurrency(
  value: number | null | undefined,
  currency: CurrencyCode = "EUR"
): string {
  return formatCurrency(value, currency);
}

export function getCollectionItemPrice(
  item: CollectionCardViewItem,
  source: PriceSource
): number | null {
  if (item.current_value_label) {
    return item.current_value;
  }

  return source === "tcp"
    ? item.tcp_value ?? item.cm_value ?? item.current_value
    : item.cm_value ?? item.tcp_value ?? item.current_value;
}

export function getCollectionItemPriceCurrency(
  item: CollectionCardViewItem,
  source: PriceSource
): CurrencyCode {
  if (item.current_value_label) {
    return "EUR";
  }

  return source === "tcp" && item.tcp_value != null ? "USD" : "EUR";
}

export function getCollectionSortPrice(
  item: CollectionCardViewItem,
  sortBy: SortBy
): number | null {
  if (item.current_value_label) {
    return item.current_value;
  }

  if (sortBy === "tcp") {
    return item.tcp_value ?? item.cm_value ?? item.current_value;
  }

  return item.cm_value ?? item.tcp_value ?? item.current_value;
}

export function hasAnyVisiblePrice(item: CollectionCardViewItem): boolean {
  return [item.current_value, item.cm_value, item.tcp_value].some((value) => value != null);
}

export function getCollectionItemCostBasis(item: CollectionCardViewItem): number | null {
  return item.cost_basis_value ?? item.purchase_price ?? null;
}

export function getCollectionItemCostBasisLabel(item: CollectionCardViewItem): string {
  return item.cost_basis_label ?? "Paid";
}

export function comparePriceValues(
  a: number | null,
  b: number | null,
  sortDir: SortDir
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return sortDir === "asc" ? a - b : b - a;
}

export function compareCollectionCardNumbers(
  a: CollectionCardViewItem,
  b: CollectionCardViewItem
): number {
  const diff = cardNumberCollator.compare(
    a.card_number?.trim() || CARD_NUMBER_FALLBACK,
    b.card_number?.trim() || CARD_NUMBER_FALLBACK
  );
  if (diff !== 0) return diff;
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

export function getSortLabel(sortBy: SortBy): string {
  if (sortBy === "number") return "Number";
  return sortBy === "cm_en" ? "CardMarket" : "TCGPlayer";
}

export function getDefaultSortDir(sortBy: SortBy): SortDir {
  return sortBy === "number" ? "asc" : "desc";
}

export function formatSortSummary(sortBy: SortBy, sortDir: SortDir): string {
  const direction = sortDir === "asc" ? "low-high" : "high-low";
  return `${getSortLabel(sortBy)} ${direction}`;
}

export function compareCollectionCardItems(
  a: CollectionCardViewItem,
  b: CollectionCardViewItem,
  sortBy: SortBy,
  sortDir: SortDir
): number {
  if (sortBy === "number") {
    const diff = compareCollectionCardNumbers(a, b);
    return sortDir === "asc" ? diff : -diff;
  }

  const priceDiff = comparePriceValues(
    getCollectionSortPrice(a, sortBy),
    getCollectionSortPrice(b, sortBy),
    sortDir
  );
  if (priceDiff !== 0) return priceDiff;
  return compareCollectionCardNumbers(a, b);
}

export function collectionMetaBadge(
  cardSize: CardSize,
  tone: "neutral" | "positive" | "negative" = "neutral"
): string {
  const scale =
    cardSize === "large"
      ? "inline-flex h-[38px] shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-[11px] text-[13px] font-medium leading-none shadow-sm shadow-black/5 dark:shadow-black/20"
      : cardSize === "medium"
        ? "inline-flex h-[33px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-[13px] text-[11px] font-medium leading-none shadow-sm shadow-black/5 dark:shadow-black/20"
        : "inline-flex h-[29px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-[12px] text-[10px] font-medium leading-none shadow-sm shadow-black/5 dark:shadow-black/20";

  if (tone === "positive") {
    return `${scale} border-emerald-200/60 bg-emerald-50/90 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-900/25 dark:text-emerald-300`;
  }

  if (tone === "negative") {
    return `${scale} border-rose-200/60 bg-rose-50/90 text-rose-700 dark:border-rose-500/20 dark:bg-rose-900/25 dark:text-rose-300`;
  }

  return `${scale} border-black/8 bg-black/[0.035] text-gray-600 dark:border-white/8 dark:bg-white/[0.05] dark:text-white/60`;
}

export function collectionMetaLabelClass(cardSize: CardSize): string {
  if (cardSize === "large") {
    return "text-[10px] font-semibold uppercase tracking-[0.12em]";
  }

  if (cardSize === "medium") {
    return "text-[9px] font-semibold uppercase tracking-[0.12em]";
  }

  return "text-[8px] font-semibold uppercase tracking-[0.12em]";
}

export function collectionMetaWrapClass(cardSize: CardSize): string {
  if (cardSize === "large") {
    return "mt-3 flex min-h-[86px] flex-wrap content-start items-center gap-1 max-[640px]:hidden";
  }

  if (cardSize === "medium") {
    return "mt-2.5 flex min-h-[72px] flex-wrap content-start items-center gap-1.5 max-[640px]:hidden";
  }

  return "mt-2 flex min-h-[62px] flex-wrap content-start items-center gap-1.5 max-[640px]:hidden";
}

export function collectionMissingMetaClass(cardSize: CardSize): string {
  if (cardSize === "large") {
    return "text-xs font-medium text-gray-400 dark:text-gray-500";
  }

  if (cardSize === "medium") {
    return "text-[11px] font-medium text-gray-400 dark:text-gray-500";
  }

  return "text-[10px] font-medium text-gray-400 dark:text-gray-500";
}

export function collectionOverlayBadgeClass(cardSize: CardSize): string {
  if (cardSize === "large") {
    return "rounded-full bg-black/70 px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white/80 backdrop-blur";
  }

  if (cardSize === "medium") {
    return "rounded-full bg-black/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/80 backdrop-blur";
  }

  return "rounded-full bg-black/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/80 backdrop-blur";
}

export function collectionTileInfoClass(cardSize: CardSize): string {
  if (cardSize === "large") {
    return "mt-2 flex flex-1 flex-col px-1";
  }

  if (cardSize === "medium") {
    return "mt-1.5 flex flex-1 flex-col px-1";
  }

  return "mt-1.5 flex flex-1 flex-col px-0.5";
}

export function collectionTileTitleClass(cardSize: CardSize): string {
  if (cardSize === "large") {
    return "line-clamp-2 text-[15px] font-bold leading-tight text-white max-[640px]:text-[14px]";
  }

  if (cardSize === "medium") {
    return "line-clamp-2 text-[13px] font-bold leading-tight text-white max-[640px]:text-[12px]";
  }

  if (cardSize === "xsmall") {
    return "line-clamp-3 text-[11px] font-bold leading-tight text-white max-[640px]:text-[10px]";
  }

  return "line-clamp-2 text-[12px] font-bold leading-tight text-white max-[640px]:text-[11px]";
}

export function collectionTileMetaLineClass(cardSize: CardSize): string {
  if (cardSize === "large") {
    return "mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] font-semibold max-[640px]:text-[10px]";
  }

  if (cardSize === "medium") {
    return "mt-0.5 flex min-w-0 items-center gap-1 text-[11px] font-semibold max-[640px]:text-[9px]";
  }

  return "mt-0.5 flex min-w-0 items-center gap-1 text-[11px] font-semibold max-[640px]:text-[9px]";
}

export function collectionTilePriceClass(cardSize: CardSize): string {
  if (cardSize === "large") {
    return "whitespace-nowrap text-[16px] font-bold tabular-nums leading-tight text-white max-[640px]:text-[14px]";
  }

  if (cardSize === "medium") {
    return "whitespace-nowrap text-[14px] font-bold tabular-nums leading-tight text-white max-[640px]:text-[12px]";
  }

  if (cardSize === "xsmall") {
    return "max-w-full whitespace-nowrap text-[11px] font-bold tabular-nums leading-tight text-white max-[640px]:text-[clamp(9px,2.85vw,11px)]";
  }

  return "whitespace-nowrap text-[13px] font-bold tabular-nums leading-tight text-white max-[640px]:text-[11px]";
}

export function collectionTileNoPriceClass(cardSize: CardSize): string {
  if (cardSize === "large") {
    return "text-[13px] text-white/35";
  }

  if (cardSize === "medium") {
    return "text-xs text-white/35";
  }

  if (cardSize === "xsmall") {
    return "text-[10px] leading-tight text-white/35 max-[640px]:text-[9px]";
  }

  return "text-[11px] text-white/35";
}

export function collectionTilePriceRowClass(cardSize: CardSize): string {
  if (cardSize === "xsmall") {
    return "mt-auto flex min-w-0 flex-col items-start gap-0.5 pt-1";
  }

  return "mt-auto flex min-w-0 flex-wrap items-end justify-between gap-x-1.5 gap-y-0.5 pt-1";
}

export function collectionTileTrendClass(
  cardSize: CardSize,
  positive: boolean
): string {
  const toneClass = positive ? "text-emerald-300" : "text-rose-300";

  if (cardSize === "xsmall") {
    return `inline-flex max-w-full items-center justify-start gap-0.5 whitespace-nowrap text-left text-[8.5px] font-bold tabular-nums leading-tight ${toneClass}`;
  }

  return `inline-flex shrink-0 items-center justify-end gap-0.5 whitespace-nowrap text-right text-[11px] font-bold tabular-nums max-[640px]:text-[9px] ${toneClass}`;
}

export function collectionTileTrendIconClass(cardSize: CardSize): string {
  if (cardSize === "xsmall") {
    return "h-2.5 w-2.5 shrink-0";
  }

  return "h-3 w-3 shrink-0 max-[640px]:h-2.5 max-[640px]:w-2.5";
}

export function collectionTileActionButtonClass(cardSize: CardSize): string {
  const size =
    cardSize === "large"
      ? "h-[30px] w-[30px] rounded-xl max-[640px]:h-[28px] max-[640px]:w-[28px]"
      : cardSize === "medium"
        ? "h-[28px] w-[28px] rounded-xl max-[640px]:h-[26px] max-[640px]:w-[26px]"
        : "h-[26px] w-[26px] rounded-lg max-[640px]:h-[24px] max-[640px]:w-[24px]";

  return `inline-flex ${size} shrink-0 items-center justify-center border border-violet-300/24 bg-violet-600/24 text-violet-50 shadow-sm shadow-black/30 backdrop-blur transition-colors hover:border-violet-200/42 hover:bg-violet-500/34 hover:text-white disabled:cursor-not-allowed disabled:opacity-50`;
}

export function collectionTileActionIconClass(cardSize: CardSize): string {
  if (cardSize === "large") {
    return "h-4 w-4";
  }

  if (cardSize === "medium") {
    return "h-4 w-4";
  }

  return "h-3.5 w-3.5";
}

export function normalizeConditionLabel(condition: string | null | undefined): string | null {
  if (!condition) return null;

  const normalized = condition.trim().toLowerCase();

  if (normalized === "mint") return "Mint";
  if (normalized === "near mint") return "Near Mint";
  if (normalized === "excellent") return "Excellent";
  if (normalized === "good") return "Good";
  if (normalized === "light played") return "Light Played";
  if (normalized === "played") return "Played";
  if (normalized === "poor") return "Poor";

  return condition.trim() || null;
}

export function getConditionBadge(
  condition: string | null | undefined,
  cardSize: CardSize
): {
  label: string;
  title: string;
  className: string;
} | null {
  const normalized = normalizeConditionLabel(condition);
  if (!normalized) return null;

  const scale =
    cardSize === "large"
      ? "inline-flex h-[38px] min-w-[44px] shrink-0 items-center justify-center whitespace-nowrap rounded-full border px-[11px] text-[13px] font-semibold leading-none shadow-sm shadow-black/5 dark:shadow-black/20"
      : cardSize === "medium"
        ? "inline-flex h-[33px] min-w-[46px] shrink-0 items-center justify-center whitespace-nowrap rounded-full border px-[13px] text-[11px] font-semibold leading-none shadow-sm shadow-black/5 dark:shadow-black/20"
        : "inline-flex h-[29px] min-w-[42px] shrink-0 items-center justify-center whitespace-nowrap rounded-full border px-[12px] text-[10px] font-semibold leading-none shadow-sm shadow-black/5 dark:shadow-black/20";

  const palette: Record<string, { label: string; toneClass: string }> = {
    Mint: {
      label: "M",
      toneClass:
        "border-emerald-200/70 bg-emerald-50/90 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-900/25 dark:text-emerald-300",
    },
    "Near Mint": {
      label: "NM",
      toneClass:
        "border-green-200/70 bg-green-50/90 text-green-700 dark:border-green-500/20 dark:bg-green-900/25 dark:text-green-300",
    },
    Excellent: {
      label: "EX",
      toneClass:
        "border-sky-200/70 bg-sky-50/90 text-sky-700 dark:border-sky-500/20 dark:bg-sky-900/25 dark:text-sky-300",
    },
    Good: {
      label: "GD",
      toneClass:
        "border-amber-200/70 bg-amber-50/90 text-amber-700 dark:border-amber-500/20 dark:bg-amber-900/25 dark:text-amber-300",
    },
    "Light Played": {
      label: "LP",
      toneClass:
        "border-orange-200/70 bg-orange-50/90 text-orange-700 dark:border-orange-500/20 dark:bg-orange-900/25 dark:text-orange-300",
    },
    Played: {
      label: "PL",
      toneClass:
        "border-rose-200/70 bg-rose-50/90 text-rose-700 dark:border-rose-500/20 dark:bg-rose-900/25 dark:text-rose-300",
    },
    Poor: {
      label: "PR",
      toneClass:
        "border-red-200/70 bg-red-50/90 text-red-700 dark:border-red-500/20 dark:bg-red-900/25 dark:text-red-300",
    },
  };

  const match = palette[normalized];

  return {
    label: match?.label ?? normalized.slice(0, 3).toUpperCase(),
    title: normalized,
    className: match
      ? `${scale} ${match.toneClass}`
      : collectionMetaBadge(cardSize),
  };
}
