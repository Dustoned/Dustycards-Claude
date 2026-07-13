import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cardFindUnique: vi.fn(),
  snapshotFindMany: vi.fn(),
  searchEbayDeals: vi.fn(),
  matchEbayListingToCard: vi.fn(),
  listingHasExactCardIdentity: vi.fn(() => true),
  recordEbayDemandScan: vi.fn(),
  getEbayBrowseRateLimitStatus: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: {
    card: { findUnique: mocks.cardFindUnique },
    cardEbayDemandSnapshot: { findMany: mocks.snapshotFindMany },
  },
}));
vi.mock("@/lib/ebay", () => ({
  buildEbayCardSearchQuery: vi.fn(() => "Sylveon GX 140/145 Guardians Rising Pokemon"),
  getEbayDemandRuntimeConfig: vi.fn(() => ({
    configured: true,
    marketplaceId: "EBAY_US",
    deliveryCountry: "NL",
    categoryId: "183454",
  })),
  getEbayBrowseRateLimitStatus: mocks.getEbayBrowseRateLimitStatus,
  searchEbayDeals: mocks.searchEbayDeals,
}));
vi.mock("@/lib/ebay-card-matching", () => ({
  matchEbayListingToCard: mocks.matchEbayListingToCard,
  listingHasExactCardIdentity: mocks.listingHasExactCardIdentity,
}));
vi.mock("@/lib/ebay-demand", () => ({
  recordEbayDemandScan: mocks.recordEbayDemandScan,
}));

import {
  getAllowedEbayDemandCardCount,
  getEbayDemandBrowseCallBudget,
  scanSignalRadarCardEbayDemand,
  selectDueEbayDemandCandidates,
} from "@/lib/sync/signal-radar-ebay-demand";

describe("Signal Radar eBay demand refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.recordEbayDemandScan.mockResolvedValue({});
  });

  it("keeps a 1,000-call reserve and uses a three-card fail-safe when quota is unknown", () => {
    expect(getAllowedEbayDemandCardCount({ requested: 12, quotaRemaining: null })).toBe(3);
    expect(getAllowedEbayDemandCardCount({ requested: 12, quotaRemaining: 1_250 })).toBe(0);
    expect(getAllowedEbayDemandCardCount({ requested: 12, quotaRemaining: 999 })).toBe(0);
    expect(getAllowedEbayDemandCardCount({ requested: 12, quotaRemaining: 5_000 })).toBe(12);
    const filteredBudget = getEbayDemandBrowseCallBudget({
      marketplaceId: "EBAY_US",
      categoryId: "183454",
    });
    expect(filteredBudget).toBe(50);
    expect(getAllowedEbayDemandCardCount({
      requested: 12,
      quotaRemaining: 1_250,
      callsPerCard: filteredBudget,
    })).toBe(5);
  });

  it("rotates never-scanned and oldest candidates before recently refreshed cards", () => {
    const now = new Date("2026-07-13T12:00:00.000Z");
    const selected = selectDueEbayDemandCandidates({
      candidates: [
        { cardId: "recent", game: "pokemon", rank: 1, externalScore: 95 },
        { cardId: "old", game: "pokemon", rank: 2, externalScore: 90 },
        { cardId: "never", game: "one-piece", rank: 3, externalScore: 85 },
      ],
      latestUpdatedAt: new Map([
        ["recent", new Date("2026-07-13T00:00:00.000Z")],
        ["old", new Date("2026-07-10T00:00:00.000Z")],
      ]),
      now,
      limit: 2,
    });

    expect(selected.map((candidate) => candidate.cardId)).toEqual(["never", "old"]);
  });

  it("persists only exact matched listings from the strict NM-English scan", async () => {
    mocks.cardFindUnique.mockResolvedValue({
      id: "card-1",
      game: "pokemon",
      name: "Sylveon-GX",
      card_number: "140/145",
      printed_card_number: "140/145",
      rarity: "Rare Ultra",
      image_url: null,
      episode: { id: "set-1", name: "Guardians Rising", code: "GRI" },
      prices: [{ cm_en_lowest_nm: 95 }],
    });
    const exact = { itemId: "exact", title: "Sylveon GX 140/145 NM English" };
    const wrong = { itemId: "wrong", title: "Sylveon GX 92/145 NM English" };
    mocks.searchEbayDeals.mockResolvedValue({
      marketplaceId: "EBAY_US",
      listings: [exact, wrong],
      scan: { fetchedCount: 24, capped: false },
    });
    mocks.matchEbayListingToCard.mockImplementation(({ title }: { title: string }) =>
      title.includes("140/145")
        ? { status: "matched", card: { id: "card-1" } }
        : { status: "unmatched", card: null }
    );

    const result = await scanSignalRadarCardEbayDemand({
      cardId: "card-1",
      observedAt: new Date("2026-07-13T12:00:00.000Z"),
    });

    expect(mocks.searchEbayDeals).toHaveBeenCalledWith(expect.objectContaining({
      strictEnglish: true,
      strictNearMint: true,
      excludeGraded: true,
      buyingMode: "all",
    }));
    expect(mocks.recordEbayDemandScan).toHaveBeenCalledWith(expect.objectContaining({
      cardId: "card-1",
      marketplaceId: "EBAY_US",
      mode: "raw",
      listings: [exact],
      observedCount: 24,
      capped: false,
    }));
    expect(result).toEqual({ capped: false, cleanListings: 1, observedCount: 24 });
  });
});
