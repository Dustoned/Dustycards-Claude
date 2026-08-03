import { describe, expect, it } from "vitest";
import { getPriceRefreshInfo } from "@/lib/price-refresh";
import {
  getLatestPriceSourceObservationAt,
  resolvePriceSourceCheckUpdate,
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
