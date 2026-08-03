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
