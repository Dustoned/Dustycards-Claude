import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import {
  buildEbayDemandPayload,
  cleanEbayDemandListings,
  getMissingLifecycleUpdate,
} from "@/lib/ebay-demand";
import type { EbayDealListing } from "@/lib/ebay";

function listing(
  itemId: string,
  overrides: Partial<EbayDealListing> = {}
): EbayDealListing {
  return {
    itemId,
    title: `English NM card ${itemId}`,
    imageUrl: null,
    itemWebUrl: `https://example.test/${itemId}`,
    condition: "Near Mint",
    cardCondition: {
      code: "near_mint",
      label: "NM",
      rank: 6,
      confidence: "explicit",
      reason: "test",
    },
    language: {
      code: "ENG",
      label: "ENG",
      confidence: "explicit",
      reason: "test",
    },
    isGradedListing: false,
    gradingReason: null,
    buyingOptions: ["FIXED_PRICE"],
    price: { value: 10, currency: "EUR", valueEur: 10 },
    shipping: { value: 2, currency: "EUR", valueEur: 2 },
    total: { value: 12, currency: "EUR", valueEur: 12 },
    seller: { username: "seller", feedbackPercentage: "100", feedbackScore: 100 },
    locationCountry: "NL",
    itemCreationDate: null,
    itemEndDate: null,
    demandVerification: {
      english: true,
      nearMint: true,
      source: "ebay_item",
    },
    discountPercent: null,
    differenceEur: null,
    dealScore: null,
    dealTone: "unknown",
    ...overrides,
  };
}

describe("cleanEbayDemandListings", () => {
  it("keeps only explicit NM ENG raw listings and deduplicates item ids", () => {
    const clean = listing("clean");
    const result = cleanEbayDemandListings(
      [
        clean,
        { ...clean, title: "duplicate" },
        listing("unknown-language", {
          language: {
            code: "UNKNOWN",
            label: "Check ENG",
            confidence: "unconfirmed",
            reason: "test",
          },
        }),
        listing("mint", {
          cardCondition: {
            code: "mint",
            label: "Mint",
            rank: 7,
            confidence: "explicit",
            reason: "test",
          },
        }),
        listing("lp", {
          cardCondition: {
            code: "light_play",
            label: "LP",
            rank: 4,
            confidence: "explicit",
            reason: "test",
          },
        }),
        listing("graded", { isGradedListing: true }),
        listing("title-only", { demandVerification: undefined }),
      ],
      "raw"
    );

    expect(result.map((item) => item.itemId)).toEqual(["clean"]);
  });

  it("keeps graded listings isolated from raw condition rules", () => {
    const result = cleanEbayDemandListings(
      [listing("raw"), listing("graded", { isGradedListing: true })],
      "graded"
    );

    expect(result.map((item) => item.itemId)).toEqual(["graded"]);
  });
});

describe("getMissingLifecycleUpdate", () => {
  const scanDay = new Date("2026-07-13T00:00:00.000Z");

  it("does not advance missing state for capped or repeated same-day scans", () => {
    expect(
      getMissingLifecycleUpdate({
        capped: true,
        missedScanCount: 1,
        lastSeenAt: new Date("2026-07-11T10:00:00.000Z"),
        lastMissedOn: new Date("2026-07-12T00:00:00.000Z"),
        scanDay,
      })
    ).toEqual({ shouldUpdate: false, missedScanCount: 1, removed: false });

    expect(
      getMissingLifecycleUpdate({
        capped: false,
        missedScanCount: 1,
        lastSeenAt: new Date("2026-07-11T10:00:00.000Z"),
        lastMissedOn: new Date("2026-07-13T08:00:00.000Z"),
        scanDay,
      })
    ).toEqual({ shouldUpdate: false, missedScanCount: 1, removed: false });
  });

  it("marks a listing removed only after a second distinct missed day", () => {
    expect(
      getMissingLifecycleUpdate({
        capped: false,
        missedScanCount: 0,
        lastSeenAt: new Date("2026-07-11T10:00:00.000Z"),
        lastMissedOn: null,
        scanDay,
      })
    ).toEqual({ shouldUpdate: true, missedScanCount: 1, removed: false });

    expect(
      getMissingLifecycleUpdate({
        capped: false,
        missedScanCount: 1,
        lastSeenAt: new Date("2026-07-11T10:00:00.000Z"),
        lastMissedOn: new Date("2026-07-12T00:00:00.000Z"),
        scanDay,
      })
    ).toEqual({ shouldUpdate: true, missedScanCount: 2, removed: true });
  });
});

describe("buildEbayDemandPayload", () => {
  it("computes recent removals separately from the 30-day baseline", () => {
    const updatedAt = new Date("2026-07-13T12:00:00.000Z");
    const payload = buildEbayDemandPayload({
      marketplaceId: "EBAY_NL",
      mode: "raw",
      snapshots: [
        {
          snapshot_date: new Date("2026-06-20T00:00:00.000Z"),
          observed_count: 20,
          clean_count: 10,
          capped: false,
          active_count: 10,
          new_count: 1,
          removed_count: 1,
          median_ask_eur: 10,
          lowest_ask_eur: 8,
          auction_count: 2,
          fixed_count: 8,
          updated_at: updatedAt,
        },
        {
          snapshot_date: new Date("2026-07-10T00:00:00.000Z"),
          observed_count: 20,
          clean_count: 8,
          capped: false,
          active_count: 8,
          new_count: 2,
          removed_count: 2,
          median_ask_eur: 12,
          lowest_ask_eur: 9,
          auction_count: 3,
          fixed_count: 5,
          updated_at: updatedAt,
        },
        {
          snapshot_date: new Date("2026-07-13T00:00:00.000Z"),
          observed_count: 18,
          clean_count: 7,
          capped: false,
          active_count: 7,
          new_count: 1,
          removed_count: 1,
          median_ask_eur: 13,
          lowest_ask_eur: 10,
          auction_count: 2,
          fixed_count: 5,
          updated_at: updatedAt,
        },
      ],
    });

    expect(payload?.sample).toEqual({ observed: 18, clean: 7, capped: false });
    expect(payload?.summary).toMatchObject({
      activeCount: 7,
      new7d: 3,
      removed7d: 3,
      medianAskEur: 13,
      lowestAskEur: 10,
      auctionCount: 2,
      fixedCount: 5,
    });
    expect(payload?.summary.removalPressure7d).toBeGreaterThan(0);
    expect(payload?.history).toHaveLength(3);
  });
});
