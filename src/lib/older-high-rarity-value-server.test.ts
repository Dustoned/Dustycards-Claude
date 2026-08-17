import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock, exchangeMock, priceMock } = vi.hoisted(() => ({
  dbMock: {
    card: {
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
  },
  priceMock: {
    loadLatestSafeEnglishNmPrices: vi.fn(),
  },
  exchangeMock: {
    getUsdToEurRate: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/lib/card-market-history", () => priceMock);
vi.mock("@/lib/exchange-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/exchange-rates")>();
  return {
    ...actual,
    getUsdToEurRate: exchangeMock.getUsdToEurRate,
  };
});

import {
  clearOlderHighRarityValueSignalCache,
  getOlderHighRarityValueSignals,
} from "@/lib/older-high-rarity-value-server";

describe("complete old high-rarity value discovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearOlderHighRarityValueSignalCache();
    exchangeMock.getUsdToEurRate.mockResolvedValue({
      from: "USD",
      to: "EUR",
      rate: 0.86,
      date: "2026-08-16",
      source: "frankfurter",
    });
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
      new Map(
        cards.map((card, index) => [
          card.id,
          {
            value: 20 + index,
            row: { tcp_market: 30 + index },
          },
        ])
      )
    );

    const result = await getOlderHighRarityValueSignals(
      new Date("2026-08-16T12:00:00.000Z")
    );

    expect(result).toHaveLength(120);
    expect(result.every((signal) => signal.olderHighRarityValue)).toBe(true);
    expect(result.map((signal) => signal.rank)).toEqual(
      Array.from({ length: 120 }, (_, index) => index + 1)
    );
    expect(result[0]?.olderHighRarityPrices).toEqual({
      cardmarketEur: 20,
      tcgplayerUsd: 30,
      tcgplayerEur: 25.8,
      usdToEurRate: 0.86,
      usdToEurRateDate: "2026-08-16",
    });
  });
});
