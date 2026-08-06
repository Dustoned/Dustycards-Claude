import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildCollectionValueDrivers } from "@/lib/collection-data";

const EMPTY_PRICE_FIELDS = {
  cm_lowest: null,
  cm_lowest_eu: null,
  cm_lowest_de: null,
  cm_lowest_fr: null,
  cm_lowest_es: null,
  cm_lowest_it: null,
  cm_avg_7d: null,
  cm_avg_30d: null,
};

function sealedItem({
  id,
  name,
  value,
  source,
  quantity = 1,
}: {
  id: string;
  name: string;
  value: number;
  source: "cm_lowest_eu" | "cm_lowest";
  quantity?: number;
}) {
  return {
    id: `owned-${id}`,
    product_id: id,
    name,
    image_url: null,
    episode_id: "episode-1",
    episode_name: "Example Set",
    episode_code: "EX",
    cardmarket_url: null,
    quantity,
    purchase_price_per_item: null,
    current_value_per_item: value,
    current_value_source: source,
  };
}

describe("sealed collection value drivers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-06T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("never compares a current EU quote with a historical fallback source", () => {
    const result = buildCollectionValueDrivers({
      cards: [],
      sealed: [
        sealedItem({ id: "mixed", name: "Mixed source", value: 260, source: "cm_lowest_eu" }),
        sealedItem({ id: "valid", name: "Valid EU move", value: 120, source: "cm_lowest_eu" }),
      ],
      cardHistory: [],
      sealedHistory: [
        {
          ...EMPTY_PRICE_FIELDS,
          product_id: "mixed",
          fetched_at: "2026-07-30T00:00:00.000Z",
          cm_lowest_it: 124.5,
        },
        {
          ...EMPTY_PRICE_FIELDS,
          product_id: "mixed",
          fetched_at: "2026-08-06T00:00:00.000Z",
          cm_lowest_eu: 260,
        },
        {
          ...EMPTY_PRICE_FIELDS,
          product_id: "valid",
          fetched_at: "2026-07-30T00:00:00.000Z",
          cm_lowest_eu: 100,
        },
        {
          ...EMPTY_PRICE_FIELDS,
          product_id: "valid",
          fetched_at: "2026-08-06T00:00:00.000Z",
          cm_lowest_eu: 120,
        },
      ],
      chart: [
        { date: "2026-07-30", label: "Jul 30", value: 224.5 },
        { date: "2026-08-06", label: "Aug 6", value: 380 },
      ],
    });

    expect(result.gains).toEqual([
      expect.objectContaining({
        productId: "valid",
        change: 20,
        currentSource: "Sealed EU",
        previousSource: "Sealed EU",
      }),
    ]);
    expect(result.drops).toEqual([]);
    expect(result.totalChange).toBe(20);
  });

  it("compares Market with Market even when an unrelated EU quote is in history", () => {
    const result = buildCollectionValueDrivers({
      cards: [],
      sealed: [
        sealedItem({
          id: "market",
          name: "General market move",
          value: 90,
          source: "cm_lowest",
          quantity: 2,
        }),
      ],
      cardHistory: [],
      sealedHistory: [
        {
          ...EMPTY_PRICE_FIELDS,
          product_id: "market",
          fetched_at: "2026-07-30T00:00:00.000Z",
          cm_lowest: 100,
          cm_lowest_eu: 150,
        },
        {
          ...EMPTY_PRICE_FIELDS,
          product_id: "market",
          fetched_at: "2026-08-06T00:00:00.000Z",
          cm_lowest: 90,
        },
      ],
      chart: [
        { date: "2026-07-30", label: "Jul 30", value: 200 },
        { date: "2026-08-06", label: "Aug 6", value: 180 },
      ],
    });

    expect(result.gains).toEqual([]);
    expect(result.drops).toEqual([
      expect.objectContaining({
        productId: "market",
        previousValue: 200,
        currentValue: 180,
        change: -20,
        currentSource: "Sealed Market",
      }),
    ]);
    expect(result.totalChange).toBe(-20);
  });
});
