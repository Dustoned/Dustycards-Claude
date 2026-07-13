import { describe, expect, it } from "vitest";
import {
  deriveEbayDemandIntelligence,
  type EbayDemandSignalSnapshot,
} from "@/lib/ebay-demand-signal";

const NOW = new Date("2026-07-13T12:00:00.000Z");

function history(
  overrides?: (day: number) => Partial<EbayDemandSignalSnapshot>
): EbayDemandSignalSnapshot[] {
  return Array.from({ length: 7 }, (_, index) => {
    const day = index + 7;
    return {
      snapshotDate: new Date(`2026-07-${String(day).padStart(2, "0")}T00:00:00.000Z`),
      updatedAt: new Date(`2026-07-${String(day).padStart(2, "0")}T10:00:00.000Z`),
      capped: false,
      observedCount: 12,
      cleanCount: 8 - index,
      activeCount: 8 - index,
      newCount: index < 2 ? 1 : 0,
      removedCount: index >= 3 ? 1 : 0,
      medianAskEur: 55,
      lowestAskEur: 50,
      ...overrides?.(day),
    };
  });
}

describe("deriveEbayDemandIntelligence", () => {
  it("keeps capped samples score-neutral even with older complete history", () => {
    const snapshots = history();
    snapshots[snapshots.length - 1] = {
      ...snapshots[snapshots.length - 1],
      capped: true,
    };

    const result = deriveEbayDemandIntelligence({
      marketplaceId: "EBAY_US",
      snapshots,
      currentMarketPriceEur: 50,
      now: NOW,
    });

    expect(result.status).toBe("capped");
    expect(result.scoreAdjustment).toBe(0);
  });

  it("waits for seven complete daily observations", () => {
    const result = deriveEbayDemandIntelligence({
      marketplaceId: "EBAY_US",
      snapshots: history().slice(-3),
      currentMarketPriceEur: 50,
      now: NOW,
    });

    expect(result.status).toBe("learning");
    expect(result.scoreAdjustment).toBe(0);
  });

  it("adds only a bounded corroborating boost when supply contracts", () => {
    const result = deriveEbayDemandIntelligence({
      marketplaceId: "EBAY_US",
      snapshots: history(),
      currentMarketPriceEur: 50,
      now: NOW,
    });

    expect(result.status).toBe("ready");
    expect(result.activeCount).toBe(2);
    expect(result.removed7d).toBe(4);
    expect(result.scoreAdjustment).toBeGreaterThan(0);
    expect(result.scoreAdjustment).toBeLessThanOrEqual(6);
    expect(result.reason).toContain("removed");
  });

  it("penalizes growing supply without treating high asks as sold demand", () => {
    const result = deriveEbayDemandIntelligence({
      marketplaceId: "EBAY_US",
      snapshots: history((day) => ({
        activeCount: day - 4,
        cleanCount: day - 4,
        newCount: 2,
        removedCount: 0,
        medianAskEur: 500,
      })),
      currentMarketPriceEur: 50,
      now: NOW,
    });

    expect(result.status).toBe("ready");
    expect(result.scoreAdjustment).toBeLessThan(0);
    expect(result.scoreAdjustment).toBeGreaterThanOrEqual(-4);
  });
});
