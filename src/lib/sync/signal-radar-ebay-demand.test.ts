import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cardFindUnique: vi.fn(),
  loadLatestSafeEnglishNmPrices: vi.fn(),
  snapshotFindMany: vi.fn(),
  buildEbayCardDemandSearchQuery: vi.fn(
    () => "Sylveon-GX 140/145 Pokemon"
  ),
  searchEbayDeals: vi.fn(),
  matchEbayListingToCard: vi.fn(),
  listingHasExactCardIdentity: vi.fn(() => true),
  recordEbayDemandScan: vi.fn(),
  getEbayBrowseRateLimitStatus: vi.fn(),
  cohortRevisionAt: new Date("2026-07-13T18:40:00.000Z"),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: {
    card: { findUnique: mocks.cardFindUnique },
    cardEbayDemandSnapshot: { findMany: mocks.snapshotFindMany },
  },
}));
vi.mock("@/lib/card-market-history", () => ({
  loadLatestSafeEnglishNmPrices: mocks.loadLatestSafeEnglishNmPrices,
}));
vi.mock("@/lib/ebay", () => ({
  buildEbayCardDemandSearchQuery: mocks.buildEbayCardDemandSearchQuery,
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
  EBAY_DEMAND_COHORT_REVISION_AT: mocks.cohortRevisionAt,
  recordEbayDemandScan: mocks.recordEbayDemandScan,
}));

import {
  EBAY_DEMAND_FOCUS_SET_SIZE,
  getAllowedEbayDemandCardCount,
  getEbayDemandBrowseCallBudget,
  refreshSignalRadarEbayDemand,
  scanSignalRadarCardEbayDemand,
  selectDueEbayDemandCandidates,
  selectEbayDemandFocusCardIds,
} from "@/lib/sync/signal-radar-ebay-demand";

describe("Signal Radar eBay demand refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.recordEbayDemandScan.mockResolvedValue({});
    mocks.loadLatestSafeEnglishNmPrices.mockResolvedValue(
      new Map([["card-1", { value: 95 }]])
    );
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

  it("builds a focus set from the top ranks with enter/leave hysteresis", () => {
    const candidates = Array.from({ length: 60 }, (_, index) => ({
      cardId: `card-${index + 1}`,
      game: "pokemon" as const,
      rank: index + 1,
      externalScore: 200 - index,
    }));

    const initial = selectEbayDemandFocusCardIds({
      candidates,
      previousFocusCardIds: new Set(),
    });
    expect(initial.size).toBe(30);
    expect(initial.has("card-30")).toBe(true);
    expect(initial.has("card-31")).toBe(false);

    // "held" slid to effective rank 40 (kept), "dropped" to rank 50 (removed).
    const shifted = Array.from({ length: 60 }, (_, index) => ({
      cardId: index === 39 ? "held" : index === 49 ? "dropped" : `new-${index + 1}`,
      game: "pokemon" as const,
      rank: index + 1,
      externalScore: 200 - index,
    }));
    const next = selectEbayDemandFocusCardIds({
      candidates: shifted,
      previousFocusCardIds: new Set(["held", "dropped"]),
    });
    expect(next.has("held")).toBe(true);
    expect(next.has("dropped")).toBe(false);
    expect(next.has("new-30")).toBe(true);
    expect(next.has("new-31")).toBe(false);
    expect(next.size).toBe(31);

    const capped = selectEbayDemandFocusCardIds({
      candidates,
      previousFocusCardIds: new Set(candidates.slice(0, 40).map((card) => card.cardId)),
    });
    expect(capped.size).toBe(EBAY_DEMAND_FOCUS_SET_SIZE);
  });

  it("rotates the focus set daily and gives non-focus cards a weekly leftover slot", () => {
    const now = new Date("2026-07-25T12:00:00.000Z");
    const selected = selectDueEbayDemandCandidates({
      candidates: [
        { cardId: "nonfocus-2d", game: "pokemon", rank: 1, externalScore: 95 },
        { cardId: "nonfocus-8d", game: "pokemon", rank: 2, externalScore: 90 },
        { cardId: "focus-due", game: "pokemon", rank: 3, externalScore: 85 },
        { cardId: "focus-fresh", game: "pokemon", rank: 4, externalScore: 80 },
      ],
      latestUpdatedAt: new Map([
        ["nonfocus-2d", new Date("2026-07-23T12:00:00.000Z")],
        ["nonfocus-8d", new Date("2026-07-17T12:00:00.000Z")],
        ["focus-due", new Date("2026-07-24T11:00:00.000Z")],
        ["focus-fresh", new Date("2026-07-25T00:00:00.000Z")],
      ]),
      now,
      limit: 10,
      focusCardIds: new Set(["focus-due", "focus-fresh"]),
    });

    expect(selected.map((candidate) => candidate.cardId)).toEqual([
      "focus-due",
      "nonfocus-8d",
    ]);
  });

  it("immediately refreshes a recent snapshot from before the cohort revision", () => {
    const selected = selectDueEbayDemandCandidates({
      candidates: [
        { cardId: "stale-revision", game: "pokemon", rank: 1, externalScore: 95 },
        { cardId: "fresh-revision", game: "pokemon", rank: 2, externalScore: 90 },
      ],
      latestUpdatedAt: new Map([
        ["stale-revision", new Date("2026-07-13T18:39:59.999Z")],
        ["fresh-revision", new Date("2026-07-13T18:40:00.000Z")],
      ]),
      now: new Date("2026-07-13T19:00:00.000Z"),
      limit: 2,
    });

    expect(selected.map((candidate) => candidate.cardId)).toEqual(["stale-revision"]);
  });

  it("does not treat pre-revision snapshots as current during Radar due-card lookup", async () => {
    mocks.getEbayBrowseRateLimitStatus.mockResolvedValue({ summary: { remaining: 1_000 } });
    mocks.snapshotFindMany.mockResolvedValue([]);

    await refreshSignalRadarEbayDemand(
      [{ cardId: "card-1", game: "pokemon", rank: 1, externalScore: 95 }] as unknown as Parameters<
        typeof refreshSignalRadarEbayDemand
      >[0],
      new Date("2026-07-13T19:00:00.000Z")
    );

    expect(mocks.snapshotFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        mode: "raw",
        updated_at: { gte: mocks.cohortRevisionAt },
      }),
    }));
  });

  it("persists only exact matched listings from the strict NM-English scan", async () => {
    mocks.cardFindUnique.mockResolvedValue({
      id: "card-1",
      game: "pokemon",
      episode_id: "set-1",
      name: "Sylveon-GX",
      card_number: "140/145",
      printed_card_number: "140/145",
      rarity: "Rare Ultra",
      image_url: null,
      cardmarket_id: "cm-1",
      cardmarket_url: null,
      episode: { id: "set-1", name: "Guardians Rising", code: "GRI" },
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

    expect(mocks.buildEbayCardDemandSearchQuery).toHaveBeenCalledWith({
      name: "Sylveon-GX",
      game: "pokemon",
      cardNumber: "140/145",
    });
    expect(mocks.searchEbayDeals).toHaveBeenCalledWith(expect.objectContaining({
      query: "Sylveon-GX 140/145 Pokemon",
      reference: {
        label: "CardMarket NM English",
        valueEur: 95,
        source: "cardmarket",
      },
      strictEnglish: true,
      strictNearMint: true,
      excludeGraded: true,
      buyingMode: "fixed",
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
