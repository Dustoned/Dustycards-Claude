import type { CardMarketHistoryPriceRow } from "@/lib/card-market-history";
import { normalizeCardMarketListingValue } from "@/lib/price-history";

type IndependentlyResolvedPriceField =
  | "cm_de_lowest_nm"
  | "cm_fr_lowest_nm"
  | "cm_es_lowest_nm"
  | "cm_it_lowest_nm"
  | "cm_jp_lowest_nm"
  | "cm_en_avg_7d"
  | "cm_en_avg_30d"
  | "tcp_market"
  | "tcp_mid"
  | "tcp_low";

export function latestUsablePriceField(
  rows: readonly CardMarketHistoryPriceRow[],
  field: IndependentlyResolvedPriceField,
  options: { cardMarket?: boolean } = {}
): number | null {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const value = rows[index]?.[field];
    const normalized = options.cardMarket
      ? normalizeCardMarketListingValue(value)
      : value != null && Number.isFinite(value) && value > 0
        ? value
        : null;
    if (normalized != null) return normalized;
  }
  return null;
}

