import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  sealedProduct: { findMany: vi.fn() },
  sealedPriceSnapshot: {
    findMany: vi.fn(),
    groupBy: vi.fn(),
  },
  setLifecycleObservation: { findMany: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ db: dbMock }));

import { getSealedSignalRadarData } from "@/lib/sealed-signal-radar-server";

const product = {
  id: "sealed-1",
  game: "pokemon",
  name: "Example Booster Box",
  image_url: null,
  tcggo_url: null,
  cardmarket_url: null,
  cardmarket_id: null,
  cm_lowest: 120,
  cm_lowest_eu: null,
  cm_lowest_de: null,
  cm_lowest_fr: null,
  cm_lowest_es: null,
  cm_lowest_it: null,
  cm_avg_7d: null,
  cm_avg_30d: null,
  release_date: new Date("2024-01-01T00:00:00.000Z"),
  release_date_source: null,
  release_date_source_url: null,
  release_date_confidence: null,
  synced_at: new Date("2026-08-10T12:00:00.000Z"),
  episode: {
    id: "episode-1",
    name: "Example Set",
    code: "EX",
    release_date: new Date("2024-01-01T00:00:00.000Z"),
  },
};

describe("getSealedSignalRadarData quote freshness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.sealedProduct.findMany.mockResolvedValue([product]);
    dbMock.sealedPriceSnapshot.findMany.mockResolvedValue([]);
    dbMock.sealedPriceSnapshot.groupBy.mockResolvedValue([]);
    dbMock.setLifecycleObservation.findMany.mockResolvedValue([]);
  });

  it("uses the latest valid historical quote date when the 210-day trend window is empty", async () => {
    const historicalQuoteAt = new Date("2025-10-01T09:00:00.000Z");
    dbMock.sealedPriceSnapshot.groupBy.mockResolvedValue([
      {
        product_id: product.id,
        _max: { fetched_at: historicalQuoteAt },
      },
    ]);

    const result = await getSealedSignalRadarData(
      "pokemon",
      new Date("2026-08-11T12:00:00.000Z")
    );

    expect(result.updatedAt).toBe(historicalQuoteAt.toISOString());
    expect(dbMock.sealedPriceSnapshot.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["product_id"],
        where: expect.objectContaining({
          product_id: { in: [product.id] },
        }),
        _max: { fetched_at: true },
      })
    );
    expect(
      dbMock.sealedPriceSnapshot.groupBy.mock.calls[0]?.[0]?.where?.fetched_at
    ).toBeUndefined();
  });

  it("does not run the unbounded lookup for products with a recent valid quote", async () => {
    const recentQuoteAt = new Date("2026-08-09T09:00:00.000Z");
    dbMock.sealedPriceSnapshot.findMany.mockResolvedValue([
      {
        product_id: product.id,
        fetched_at: recentQuoteAt,
        cm_lowest: 120,
        cm_lowest_eu: null,
        cm_lowest_de: null,
        cm_lowest_fr: null,
        cm_lowest_es: null,
        cm_lowest_it: null,
      },
    ]);

    const result = await getSealedSignalRadarData(
      "pokemon",
      new Date("2026-08-11T12:00:00.000Z")
    );

    expect(result.updatedAt).toBe(recentQuoteAt.toISOString());
    expect(dbMock.sealedPriceSnapshot.groupBy).not.toHaveBeenCalled();
  });
});
