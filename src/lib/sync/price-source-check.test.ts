import { describe, expect, it } from "vitest";
import { getPriceRefreshInfo } from "@/lib/price-refresh";
import {
  getLatestPriceSourceObservationAt,
  preserveProtectedPriceSourceStatus,
  resolvePriceSourceCheckUpdate,
  suppressStaleEnglishNmPriceForNoListing,
} from "@/lib/sync/price-source-check";

describe("price source checks", () => {
  it("records a protected TCGGo observation without clearing the direct-source status", () => {
    const checkedAt = new Date("2026-07-30T20:20:00.000Z");
    const update = resolvePriceSourceCheckUpdate({
      mode: "protected",
      checkedAt,
      refreshAllPrices: true,
      hasExistingPrice: true,
    });

    expect(update).toEqual({ price_source_checked_at: checkedAt });
    expect(update).not.toHaveProperty("price_source_status");
  });

  it("preserves catalog-only no-op behavior and marks missing full refreshes unavailable", () => {
    const checkedAt = new Date("2026-07-30T20:20:00.000Z");

    expect(
      resolvePriceSourceCheckUpdate({
        mode: "none",
        checkedAt,
        refreshAllPrices: false,
        hasExistingPrice: true,
      })
    ).toBeNull();
    expect(
      resolvePriceSourceCheckUpdate({
        mode: "none",
        checkedAt,
        refreshAllPrices: true,
        hasExistingPrice: true,
      })
    ).toEqual({
      price_source_status: "unavailable",
      price_source_checked_at: checkedAt,
    });
  });

  it("does not let a TCP-only refresh erase a CardMarket no-EN/NM observation", () => {
    const checkedAt = new Date("2026-08-11T12:00:00.000Z");
    const update = { price_source_status: null, price_source_checked_at: checkedAt };

    expect(
      preserveProtectedPriceSourceStatus({
        update,
        currentStatus: "cardmarket-no-en-nm",
      })
    ).toBeNull();
  });

  it("does not let TCGGo clear an exact card that is still upcoming", () => {
    const checkedAt = new Date("2026-08-11T12:00:00.000Z");
    expect(
      preserveProtectedPriceSourceStatus({
        update: { price_source_status: null, price_source_checked_at: checkedAt },
        currentStatus: "upcoming",
      })
    ).toBeNull();
  });

  it("keeps stale TCGGo English/NM out while preserving independent prices", () => {
    const price = suppressStaleEnglishNmPriceForNoListing({
      currentStatus: "cardmarket-no-en-nm",
      price: {
        cm_en_lowest_nm: 12.5,
        cm_de_lowest_nm: 13,
        tcp_market: 14,
      },
    });

    expect(price).toEqual({
      cm_en_lowest_nm: null,
      cm_de_lowest_nm: 13,
      tcp_market: 14,
    });
    expect(
      suppressStaleEnglishNmPriceForNoListing({
        currentStatus: null,
        price: { cm_en_lowest_nm: 12.5 },
      })
    ).toEqual({ cm_en_lowest_nm: 12.5 });
  });

  it("uses a later protected check so Chase Watch cards do not repeat every tick", () => {
    const observationAt = getLatestPriceSourceObservationAt(
      "2026-07-30T00:30:57.555Z",
      "2026-07-30T20:20:27.396Z"
    );

    expect(observationAt?.toISOString()).toBe("2026-07-30T20:20:27.396Z");
    expect(
      getPriceRefreshInfo(
        "Special Illustration Rare",
        observationAt?.toISOString() ?? null,
        new Date("2026-07-30T20:25:00.000Z").getTime()
      ).due
    ).toBe(false);
  });

  it("keeps the newest valid observation regardless of which source produced it", () => {
    expect(
      getLatestPriceSourceObservationAt(
        "2026-07-30T21:00:00.000Z",
        "2026-07-30T20:20:00.000Z"
      )?.toISOString()
    ).toBe("2026-07-30T21:00:00.000Z");
    expect(getLatestPriceSourceObservationAt("invalid", null)).toBeNull();
  });
});
