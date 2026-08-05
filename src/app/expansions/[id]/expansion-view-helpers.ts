import type { PriceSource, SortBy, SortDir } from "@/components/SettingsProvider";
import { CARD_NUMBER_FALLBACK, cardNumberCollator } from "@/lib/card-number-sort";
import type { CurrencyCode } from "@/lib/format";
import { rarityBadge } from "@/lib/rarity-styles";
import type { CardData } from "@/types/card-data";

export { CARD_NUMBER_FALLBACK, cardNumberCollator };

export function getCardMarketPrice(card: CardData): number | null {
  return card.price?.cm_en_lowest_nm ?? null;
}

export function getSortPrice(card: CardData, sortBy: SortBy): number | null {
  return sortBy === "tcp" ? card.price?.tcp_market ?? null : getCardMarketPrice(card);
}

export function getPriceBySource(card: CardData, source: PriceSource): number | null {
  return source === "tcp" ? card.price?.tcp_market ?? null : getCardMarketPrice(card);
}

export function hasAnyVisiblePrice(card: CardData): boolean {
  const price = card.price;
  if (!price) return false;

  return [
    price.cm_en_lowest_nm,
    price.cm_de_lowest_nm,
    price.cm_fr_lowest_nm,
    price.cm_es_lowest_nm,
    price.cm_it_lowest_nm,
    price.cm_jp_lowest_nm,
    price.cm_en_avg_7d,
    price.cm_en_avg_30d,
    price.tcp_market,
    price.tcp_mid,
    price.tcp_low,
  ].some((value) => value != null);
}

export function getPriceSourceCurrency(source: PriceSource): CurrencyCode {
  return source === "tcp" ? "USD" : "EUR";
}

export function getSortLabel(sortBy: SortBy): string {
  if (sortBy === "number") return "Number";
  if (sortBy === "release") return "Release date";
  return sortBy === "cm_en" ? "CardMarket" : "TCGPlayer";
}

export function getDefaultSortDir(sortBy: SortBy): SortDir {
  return sortBy === "number" ? "asc" : "desc";
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

export function compareCardNumbers(a: CardData, b: CardData): number {
  const diff = cardNumberCollator.compare(
    a.card_number?.trim() || CARD_NUMBER_FALLBACK,
    b.card_number?.trim() || CARD_NUMBER_FALLBACK
  );
  if (diff !== 0) return diff;
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

export function formatSortSummary(sortBy: SortBy, sortDir: SortDir): string {
  if (sortBy === "release") return sortDir === "asc" ? "Oldest release" : "Newest release";
  const direction = sortDir === "asc" ? "low-high" : "high-low";
  return `${getSortLabel(sortBy)} ${direction}`;
}

export function rarityFilterChip(rarity: string | null, active: boolean): string {
  const palette = rarityBadge(rarity);

  if (active) {
    return `${palette} border-black/15 dark:border-white/15 opacity-100 ring-2 ring-gray-900/70 ring-offset-1 ring-offset-white shadow-md shadow-black/10 dark:border-white/15 dark:ring-white/80 dark:ring-offset-black dark:shadow-black/25`;
  }

  return `${palette} border-black/8 dark:border-white/8 opacity-75 hover:opacity-100 hover:border-black/20 hover:shadow-sm dark:hover:border-white/20`;
}

export function neutralFilterChip(active: boolean): string {
  if (active) {
    return "border-violet-400/40 bg-violet-600 text-white opacity-100";
  }

  return "border-white/8 text-white/55 opacity-80 hover:border-white/20 hover:opacity-100 hover:text-white hover:shadow-sm";
}
