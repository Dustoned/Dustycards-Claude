import type {
  ExistingPriceRecord,
  PriceSnapshotData,
} from "@/lib/sync/card-helpers";

export const RECENT_DIRECT_CARDMARKET_PROTECTION_MS = 24 * 60 * 60_000;

/**
 * TCGGo can publish yesterday's CardMarket value after a direct launch-market
 * check. Keep that authoritative snapshot for one day; the next direct check
 * refreshes it, while the normal sync resumes automatically if the direct lane
 * remains unavailable beyond the protection window.
 */
export function preserveRecentDirectEnglishNmPrice(
  latestPrice: ExistingPriceRecord | null,
  nextPrice: PriceSnapshotData,
  fetchedAt: Date
): {
  preserveExistingSnapshot: boolean;
  price: PriceSnapshotData;
  source: string;
  sourceProvider: string | null;
  sourceUrl: string | null;
} {
  const protectDirect = Boolean(
    latestPrice?.source === "cardmarket-direct" &&
      latestPrice.fetched_at &&
      latestPrice.fetched_at.getTime() >=
        fetchedAt.getTime() - RECENT_DIRECT_CARDMARKET_PROTECTION_MS &&
      latestPrice.cm_en_lowest_nm != null &&
      latestPrice.cm_en_lowest_nm > 0 &&
      latestPrice.cm_en_lowest_nm !== 9001
  );
  return {
    preserveExistingSnapshot: protectDirect,
    price: protectDirect
      ? { ...nextPrice, cm_en_lowest_nm: latestPrice?.cm_en_lowest_nm ?? null }
      : nextPrice,
    source: protectDirect ? "cardmarket-direct" : "tcggo",
    sourceProvider: protectDirect ? latestPrice?.source_provider ?? null : "tcggo",
    sourceUrl: protectDirect ? latestPrice?.source_url ?? null : null,
  };
}
