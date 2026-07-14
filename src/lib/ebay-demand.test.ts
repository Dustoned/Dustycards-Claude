import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  snapshotFindFirst: vi.fn(),
  snapshotFindMany: vi.fn(),
  snapshotUpsert: vi.fn(),
  listingFindMany: vi.fn(),
  listingCount: vi.fn(),
  listingUpsert: vi.fn(),
  listingUpdate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    cardEbayDemandSnapshot: {
      findFirst: mocks.snapshotFindFirst,
      findMany: mocks.snapshotFindMany,
      upsert: mocks.snapshotUpsert,
    },
    cardEbayDemandListing: {
      findMany: mocks.listingFindMany,
      count: mocks.listingCount,
      upsert: mocks.listingUpsert,
      update: mocks.listingUpdate,
    },
  },
}));

import {
  buildEbayDemandPayload,
  cleanEbayDemandListings,
  EBAY_DEMAND_COHORT_REVISION_AT,
  getEbayDemandPayload,
  getLatestEbayDemandListingPage,
  getMissingLifecycleUpdate,
  recordEbayDemandScan,
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

  it("keeps only confirmed explicit-English graded listings", () => {
    const result = cleanEbayDemandListings(
      [
        listing("raw"),
        listing("broad-only", { isGradedListing: true }),
        listing("graded", {
          isGradedListing: true,
          isConfirmedGradedListing: true,
        }),
        listing("unknown-language-graded", {
          isGradedListing: true,
          isConfirmedGradedListing: true,
          language: {
            code: "UNKNOWN",
            label: "Check ENG",
            confidence: "unconfirmed",
            reason: "test",
          },
        }),
      ],
      "graded"
    );

    expect(result.map((item) => item.itemId)).toEqual(["graded"]);
  });

  it("excludes auction and mixed listings from both demand cohorts", () => {
    const fixed = listing("fixed");
    const bestOffer = listing("best-offer", { buyingOptions: ["BEST_OFFER"] });
    const auction = listing("auction", { buyingOptions: ["AUCTION"] });
    const mixed = listing("mixed", { buyingOptions: ["FIXED_PRICE", "AUCTION"] });
    expect(cleanEbayDemandListings([fixed, bestOffer, auction, mixed], "raw").map((item) => item.itemId))
      .toEqual(["fixed", "best-offer"]);

    const asGraded = (item: EbayDealListing): EbayDealListing => ({
      ...item,
      isGradedListing: true,
      isConfirmedGradedListing: true,
    });
    expect(cleanEbayDemandListings([fixed, bestOffer, auction, mixed].map(asGraded), "graded").map((item) => item.itemId))
      .toEqual(["fixed", "best-offer"]);
  });
});

describe("demand cohort revision", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.snapshotFindFirst.mockResolvedValue(null);
    mocks.snapshotFindMany.mockResolvedValue([]);
    mocks.snapshotUpsert.mockResolvedValue({});
    mocks.listingFindMany.mockResolvedValue([]);
    mocks.listingCount.mockResolvedValue(0);
    mocks.listingUpsert.mockResolvedValue({});
    mocks.listingUpdate.mockResolvedValue({});
  });

  it("hides pre-revision snapshots for both modes", async () => {
    await getEbayDemandPayload({ cardId: "card", marketplaceId: "EBAY_US", mode: "graded" });
    expect(mocks.snapshotFindFirst).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        mode: "graded",
        updated_at: { gte: EBAY_DEMAND_COHORT_REVISION_AT },
      }),
    }));

    await getEbayDemandPayload({ cardId: "card", marketplaceId: "EBAY_US", mode: "raw" });
    expect(mocks.snapshotFindFirst).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        mode: "raw",
        updated_at: { gte: EBAY_DEMAND_COHORT_REVISION_AT },
      }),
    }));
  });

  it("only exposes graded listings observed after the classifier revision", async () => {
    mocks.snapshotFindFirst.mockResolvedValue({
      snapshot_date: new Date("2026-07-13T00:00:00.000Z"),
    });

    await getLatestEbayDemandListingPage({
      cardId: "card",
      marketplaceId: "EBAY_US",
      mode: "graded",
      limit: 12,
    });

    expect(mocks.listingFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        mode: "graded",
        listing_type: "fixed",
        last_seen_at: { gte: EBAY_DEMAND_COHORT_REVISION_AT },
      }),
    }));
    expect(mocks.listingCount).toHaveBeenCalledWith({
      where: expect.objectContaining({
        mode: "graded",
        listing_type: "fixed",
        last_seen_at: { gte: EBAY_DEMAND_COHORT_REVISION_AT },
      }),
    });
  });

  it("keeps pre-revision auction rows out of fresh lifecycle metrics", async () => {
    const observedAt = new Date("2026-07-14T12:00:00.000Z");
    const snapshotDate = new Date("2026-07-14T00:00:00.000Z");
    const oldAuctionRow = {
      id: "old-auction-row",
      item_id: "old-auction",
      listing_type: "auction",
      last_seen_at: new Date("2026-07-12T12:00:00.000Z"),
      missed_scan_count: 1,
      last_missed_on: new Date("2026-07-13T00:00:00.000Z"),
    };

    // Model a database that still contains an old false-positive auction row.
    // The row is returned/counts only if the lifecycle query loses either of
    // the fixed-listing or revision-cutoff guards.
    mocks.listingFindMany.mockImplementation(async (args: {
      where?: { listing_type?: string; last_seen_at?: { gte?: Date } };
    }) => {
      const scopedToCurrentCohort =
        args.where?.listing_type === "fixed" &&
        args.where?.last_seen_at?.gte?.getTime() ===
          EBAY_DEMAND_COHORT_REVISION_AT.getTime();
      return scopedToCurrentCohort ? [] : [oldAuctionRow];
    });
    mocks.listingCount.mockImplementation(async (args: {
      where?: { listing_type?: string; last_seen_at?: { gte?: Date } };
    }) => {
      const scopedToCurrentCohort =
        args.where?.listing_type === "fixed" &&
        args.where?.last_seen_at?.gte?.getTime() ===
          EBAY_DEMAND_COHORT_REVISION_AT.getTime();
      return scopedToCurrentCohort ? 0 : 1;
    });
    mocks.snapshotFindFirst.mockResolvedValue({ snapshot_date: snapshotDate });
    mocks.snapshotFindMany.mockResolvedValue([
      {
        snapshot_date: snapshotDate,
        observed_count: 1,
        clean_count: 1,
        capped: false,
        active_count: 1,
        new_count: 0,
        removed_count: 0,
        median_ask_eur: 12,
        lowest_ask_eur: 12,
        auction_count: 0,
        fixed_count: 1,
        updated_at: observedAt,
      },
    ]);

    const payload = await recordEbayDemandScan({
      cardId: "card",
      marketplaceId: "EBAY_US",
      mode: "raw",
      listings: [listing("fresh-fixed")],
      observedCount: 1,
      capped: false,
      observedAt,
    });

    expect(mocks.listingFindMany).toHaveBeenNthCalledWith(1, {
      where: expect.objectContaining({
        listing_type: "fixed",
        last_seen_at: { gte: EBAY_DEMAND_COHORT_REVISION_AT },
      }),
    });
    expect(mocks.listingFindMany).toHaveBeenNthCalledWith(2, {
      where: expect.objectContaining({
        listing_type: "fixed",
        last_seen_at: { gte: EBAY_DEMAND_COHORT_REVISION_AT },
      }),
      select: { item_id: true },
    });
    expect(mocks.listingCount).toHaveBeenCalledWith({
      where: expect.objectContaining({
        listing_type: "fixed",
        last_seen_at: { gte: EBAY_DEMAND_COHORT_REVISION_AT },
      }),
    });
    expect(mocks.listingUpdate).not.toHaveBeenCalled();
    expect(mocks.snapshotUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        active_count: 1,
        new_count: 0,
        removed_count: 0,
        auction_count: 0,
        fixed_count: 1,
      }),
      update: expect.objectContaining({
        active_count: 1,
        new_count: 0,
        removed_count: 0,
        auction_count: 0,
        fixed_count: 1,
      }),
    }));
    expect(payload.summary).toMatchObject({
      activeCount: 1,
      new7d: 0,
      removed7d: 0,
      removalPressure7d: 0,
      auctionCount: 0,
      fixedCount: 1,
    });
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
