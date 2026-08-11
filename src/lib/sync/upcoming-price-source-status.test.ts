import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  sourceFindMany: vi.fn(),
  cardUpdateMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: {
    externalCatalystSource: { findMany: dbMock.sourceFindMany },
    card: { updateMany: dbMock.cardUpdateMany },
    $transaction: dbMock.transaction,
  },
}));

import {
  classifyUpcomingPriceSourceCardIds,
  invalidateUpcomingPriceSourceStatusCache,
  loadUnreleasedUpcomingCardIds,
  reconcileUpcomingPriceSourceStatuses,
} from "@/lib/sync/upcoming-price-source-status";

function metadata(upcomingReveals: unknown[]): string {
  return JSON.stringify({ upcomingReveals });
}

function reveal(input: {
  cardId: string;
  releaseDate: string | null;
  method?: string;
  episodeName?: string;
}): Record<string, unknown> {
  return {
    // Price protection deliberately does not depend on UI image/name fields.
    episodeName: input.episodeName ?? "30th Celebration MEP Promos",
    releaseDate: input.releaseDate,
    libraryMatch: {
      cardId: input.cardId,
      method: input.method ?? "set-number",
    },
  };
}

describe("Upcoming price-source lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateUpcomingPriceSourceStatusCache();
    dbMock.transaction.mockImplementation(async (work) => work({
      card: { updateMany: dbMock.cardUpdateMany },
    }));
  });

  it("protects hidden exact future matches and treats release day as released", () => {
    const result = classifyUpcomingPriceSourceCardIds([
      metadata([
        reveal({ cardId: "future-hidden", releaseDate: "2026-09-16" }),
        reveal({ cardId: "future-iso", releaseDate: "2026-09-17T09:00:00Z", method: "artwork" }),
        reveal({ cardId: "today", releaseDate: "2026-08-11" }),
        reveal({ cardId: "past", releaseDate: "2026-08-10" }),
        reveal({ cardId: "bad-method", releaseDate: "2026-09-16", method: "name" }),
        reveal({ cardId: "", releaseDate: "2026-09-16" }),
        reveal({ cardId: "bad-date", releaseDate: "later" }),
      ]),
      "not json",
    ], new Date("2026-08-11T10:00:00.000Z"));

    expect([...result.unreleased]).toEqual(["future-hidden", "future-iso"]);
    expect([...result.released]).toEqual(["today", "past"]);
    expect([...result.matched]).toEqual([
      "future-hidden",
      "future-iso",
      "today",
      "past",
    ]);
  });

  it("uses future precedence and reports conflicting release metadata", () => {
    const result = classifyUpcomingPriceSourceCardIds([
      metadata([reveal({ cardId: "same-card", releaseDate: "2026-08-01" })]),
      metadata([reveal({ cardId: "same-card", releaseDate: "2026-09-16" })]),
    ], new Date("2026-08-11T10:00:00.000Z"));

    expect([...result.unreleased]).toEqual(["same-card"]);
    expect([...result.released]).toEqual([]);
    expect([...result.conflicts]).toEqual(["same-card"]);
  });

  it("can bypass a cached backlog immediately before a paid request", async () => {
    dbMock.sourceFindMany
      .mockResolvedValueOnce([{ metadata_json: metadata([]) }])
      .mockResolvedValueOnce([{
        metadata_json: metadata([reveal({ cardId: "new-future", releaseDate: "2026-09-16" })]),
      }]);
    const now = new Date("2026-08-11T10:00:00.000Z");

    await expect(loadUnreleasedUpcomingCardIds(now)).resolves.toEqual(new Set());
    await expect(
      loadUnreleasedUpcomingCardIds(now, { fresh: true })
    ).resolves.toEqual(new Set(["new-future"]));
    expect(dbMock.sourceFindMany).toHaveBeenCalledTimes(2);
  });

  it("atomically marks the future set and clears every stale upcoming status", async () => {
    dbMock.sourceFindMany.mockResolvedValue([
      { metadata_json: metadata([reveal({ cardId: "future", releaseDate: "2026-09-16" })]) },
    ]);
    dbMock.cardUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 3 });

    await expect(
      reconcileUpcomingPriceSourceStatuses(new Date("2026-08-11T10:00:00.000Z"))
    ).resolves.toEqual({
      protectedCards: 1,
      markedUpcoming: 1,
      releasedCards: 3,
    });

    expect(dbMock.cardUpdateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({ id: { in: ["future"] } }),
      data: { price_source_status: "upcoming" },
    }));
    expect(dbMock.cardUpdateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({
        price_source_status: "upcoming",
        id: { notIn: ["future"] },
      }),
      data: { price_source_status: null, price_source_checked_at: null },
    }));
  });
});
