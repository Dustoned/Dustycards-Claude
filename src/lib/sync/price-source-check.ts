import {
  CARDMARKET_NO_EN_NM_PRICE_STATUS,
  UPCOMING_PRICE_SOURCE_STATUS,
} from "@/lib/price-source-status";

export type PriceSnapshotWriteMode = "new" | "refreshed" | "none" | "protected";

export interface PriceSourceCheckUpdate {
  price_source_status?: string | null;
  price_source_checked_at: Date;
}

export function resolvePriceSourceCheckUpdate(input: {
  mode: PriceSnapshotWriteMode;
  checkedAt: Date;
  refreshAllPrices: boolean;
  hasExistingPrice: boolean;
}): PriceSourceCheckUpdate | null {
  if (input.mode === "new" || input.mode === "refreshed") {
    return {
      price_source_status: null,
      price_source_checked_at: input.checkedAt,
    };
  }

  if (input.mode === "protected") {
    // Keep the direct CardMarket snapshot authoritative, but remember that
    // TCGGo was checked so this card is not selected again on every tick.
    return {
      price_source_checked_at: input.checkedAt,
    };
  }

  if (input.refreshAllPrices || !input.hasExistingPrice) {
    return {
      price_source_status: "unavailable",
      price_source_checked_at: input.checkedAt,
    };
  }

  return null;
}

/** TCGGo does not own direct CardMarket no-listing observations or the
 * per-card Upcoming lifecycle status. */
export function isProtectedPriceSourceStatus(
  status: string | null | undefined
): boolean {
  return (
    status === CARDMARKET_NO_EN_NM_PRICE_STATUS ||
    status === UPCOMING_PRICE_SOURCE_STATUS
  );
}

export function preserveProtectedPriceSourceStatus(input: {
  update: PriceSourceCheckUpdate | null;
  currentStatus: string | null | undefined;
}): PriceSourceCheckUpdate | null {
  if (!isProtectedPriceSourceStatus(input.currentStatus)) {
    return input.update;
  }

  // For a no-listing result this timestamp belongs to the direct CardMarket
  // observation. For an Upcoming card the per-card release metadata owns the
  // status until release day. A TCGGo refresh must not overwrite either one.
  return null;
}

/**
 * TCGGo can lag behind the live CardMarket offers page. Once the exact
 * CardMarket product has conclusively returned no English/NM offer, do not
 * let a later TCGGo payload resurrect an older English/NM quote. Independent
 * TCP and other-language fields remain usable and are still persisted.
 */
export function suppressStaleEnglishNmPriceForNoListing<
  T extends { cm_en_lowest_nm: number | null },
>(input: {
  price: T;
  currentStatus: string | null | undefined;
}): T {
  if (input.currentStatus !== CARDMARKET_NO_EN_NM_PRICE_STATUS) {
    return input.price;
  }
  return { ...input.price, cm_en_lowest_nm: null };
}

function parseTimestamp(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getLatestPriceSourceObservationAt(
  latestPriceFetchedAt: Date | string | null | undefined,
  priceSourceCheckedAt: Date | string | null | undefined
): Date | null {
  const fetchedAt = parseTimestamp(latestPriceFetchedAt);
  const checkedAt = parseTimestamp(priceSourceCheckedAt);

  if (!fetchedAt) return checkedAt;
  if (!checkedAt) return fetchedAt;
  return fetchedAt.getTime() >= checkedAt.getTime() ? fetchedAt : checkedAt;
}
