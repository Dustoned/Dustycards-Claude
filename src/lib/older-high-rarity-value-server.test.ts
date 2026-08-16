import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock, priceMock } = vi.hoisted(() => ({
  dbMock: {
    card: {
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
  },
  priceMock: {
    loadLatestSafeEnglishNmPrices: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/lib/card-market-history", () => priceMock);

import {
  clearOlderHighRarityValueSignalCache,
  getOlderHighRarityValueSignals,
} from "@/lib/older-high-rarity-value-server";

describe("complete old high-rarity value discovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearOlderHighRarityValueSignalCache();
  });

  it("returns the complete eligible cohort without the general Radar cap", async () => {
    const cards = Array.from({ length: 120 }, (_, index) => ({
      id: `old-${index + 1}`,
      game: "pokemon",
      episode_id: `episode-${index + 1}`,
      name: `Older chase ${index + 1}`,
      image_url: null,
      card_number: String(index + 1),
      printed_card_number: null,
      rarity: "Rare Ultra",
      cardmarket_id: `cm-${index + 1}`,
      cardmarket_url: null,
      episode: {
        name: `Older set ${index + 1}`,
        code: `OLD${index + 1}`,
        release_date: "2015-01-01",
      },
      _count: { prices: 30 },
    }));
    dbMock.card.findMany.mockResolvedValue(cards);
    dbMock.card.groupBy.mockResolvedValue(
      cards.map((card) => ({
        episode_id: card.episode_id,
        rarity: "Rare Ultra",
        _count: { _all: 4 },
      }))
    );
    priceMock.loadLatestSafeEnglishNmPrices.mockResolvedValue(
      new Map(cards.map((card, index) => [card.id, { value: 20 + index }]))
    );

    const result = await getOlderHighRarityValueSignals(
      new Date("2026-08-16T12:00:00.000Z")
    );

    expect(result).toHaveLength(120);
    expect(result.every((signal) => signal.olderHighRarityValue)).toBe(true);
    expect(result.map((signal) => signal.rank)).toEqual(
      Array.from({ length: 120 }, (_, index) => index + 1)
    );
  });
});
