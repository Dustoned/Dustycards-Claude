import type {
  ExistingPriceRecord,
  PriceSnapshotData,
} from "@/lib/sync/card-helpers";

export const RECENT_DIRECT_CARDMARKET_PROTECTION_MS = 24 * 60 * 60_000;
export const CARDMARKET_BASE_BACKFILL_SOURCE = "cardmarket_base_backfill";
export const AUTHORITATIVE_DIRECT_CARDMARKET_SOURCES = [
  "cardmarket-direct",
  CARDMARKET_BASE_BACKFILL_SOURCE,
] as const;

function isValidEnglishNmPrice(value: number | null | undefined): boolean {
  return value != null && Number.isFinite(value) && value > 0 && value !== 9001;
}

function hasUsablePriceBesidesEnglishNm(price: PriceSnapshotData): boolean {
  return Object.entries(price).some(
    ([field, value]) =>
      field !== "cm_en_lowest_nm" &&
      value != null &&
      Number.isFinite(value) &&
      value > 0 &&
      value !== 9001
  );
}

export function hasPriceSourceProvenanceChanged(
  latestPrice: ExistingPriceRecord | null,
  nextSource: string,
  nextProvider: string | null
): boolean {
  return Boolean(
    latestPrice &&
      ((latestPrice.source ?? null) !== nextSource ||
        (latestPrice.source_provider ?? null) !== nextProvider)
  );
}

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
    latestPrice?.source &&
      AUTHORITATIVE_DIRECT_CARDMARKET_SOURCES.includes(
        latestPrice.source as (typeof AUTHORITATIVE_DIRECT_CARDMARKET_SOURCES)[number]
      ) &&
      latestPrice.fetched_at &&
      latestPrice.fetched_at.getTime() >=
        fetchedAt.getTime() - RECENT_DIRECT_CARDMARKET_PROTECTION_MS &&
      isValidEnglishNmPrice(latestPrice.cm_en_lowest_nm)
  );
  if (!protectDirect) {
    return {
      preserveExistingSnapshot: false,
      price: nextPrice,
      source: "tcggo",
      sourceProvider: "tcggo",
      sourceUrl: null,
    };
  }

  // Keep the authoritative direct EN/NM row untouched, but still persist all
  // independently observed TCGGo series in their own source-pure row.
  const protectedTcggoPrice = { ...nextPrice, cm_en_lowest_nm: null };
  return {
    preserveExistingSnapshot: !hasUsablePriceBesidesEnglishNm(protectedTcggoPrice),
    price: protectedTcggoPrice,
    source: "tcggo",
    sourceProvider: "tcggo",
    sourceUrl: null,
  };
}
