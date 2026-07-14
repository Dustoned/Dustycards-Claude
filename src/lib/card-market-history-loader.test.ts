import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  card: { findMany: vi.fn() },
  price: { findMany: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ db: dbMock }));

import {
  loadLatestSafeEnglishNmPrices,
  loadSafeCardMarketHistoryRows,
} from "@/lib/card-market-history";

const emptyMarketFields = {
  cm_de_lowest_nm: null,
  cm_fr_lowest_nm: null,
  cm_es_lowest_nm: null,
  cm_it_lowest_nm: null,
  cm_jp_lowest_nm: null,
  cm_en_avg_7d: null,
  cm_en_avg_30d: null,
  tcp_mid: null,
  tcp_low: null,
};

describe("loadSafeCardMarketHistoryRows", () => {
  beforeEach(() => {
    dbMock.card.findMany.mockReset();
    dbMock.price.findMany.mockReset();
  });

  it("stitches a guarded provider handoff while isolating sibling TCGPlayer data", async () => {
    dbMock.card.findMany.mockResolvedValue([
      {
        id: "9907",
        game: "pokemon",
        episode_id: "68",
        name: "Metagross-GX",
        card_number: "157",
        printed_card_number: "157/145",
        cardmarket_id: "450878",
        cardmarket_url: "https://www.cardmarket.com/Pokemon/Products?idProduct=450878",
      },
      {
        id: "9908",
        game: "pokemon",
        episode_id: "68",
        name: "Metagross-GX",
        card_number: "157a",
        printed_card_number: "157a",
        cardmarket_id: "450878",
        cardmarket_url: "https://www.cardmarket.com/Pokemon/Products?idProduct=450878",
      },
      {
        id: "bad-collision",
        game: "pokemon",
        episode_id: "68",
        name: "Rayquaza V",
        card_number: "194",
        printed_card_number: "194/203",
        cardmarket_id: "450878",
        cardmarket_url: "https://www.cardmarket.com/Pokemon/Products?idProduct=450878",
      },
    ]);
    dbMock.price.findMany.mockResolvedValue([
      {
        card_id: "9907",
        fetched_at: new Date("2026-06-21T00:00:00.000Z"),
        cm_en_lowest_nm: 21,
        tcp_market: 99,
        ...emptyMarketFields,
      },
      {
        card_id: "9908",
        fetched_at: new Date("2026-06-22T00:00:00.000Z"),
        cm_en_lowest_nm: 20,
        tcp_market: 22,
        ...emptyMarketFields,
      },
    ]);

    const rows = await loadSafeCardMarketHistoryRows([
      {
        id: "9908",
        game: "pokemon",
        episodeId: "68",
        name: "Metagross-GX",
        cardNumber: "157a",
        printedCardNumber: "157a",
        cardmarketId: "450878",
        cardmarketUrl: "https://www.cardmarket.com/Pokemon/Products?idProduct=450878",
      },
    ]);

    expect(dbMock.price.findMany.mock.calls[0]?.[0]?.where?.card_id?.in).toEqual([
      "9908",
      "9907",
    ]);
    expect(rows.get("9908")).toEqual([
      expect.objectContaining({ card_id: "9907", cm_en_lowest_nm: 21, tcp_market: null }),
      expect.objectContaining({ card_id: "9908", cm_en_lowest_nm: 20, tcp_market: 22 }),
    ]);
  });

  it("uses the newest guarded EN/NM quote and prefers the exact card on a tie", async () => {
    dbMock.card.findMany
      .mockResolvedValueOnce([
        {
          id: "9907",
          game: "pokemon",
          episode_id: "set-1",
          name: "Example-GX",
          card_number: "157",
          printed_card_number: "157/145",
          cardmarket_id: "cm-1",
          cardmarket_url: "https://www.cardmarket.com/Pokemon/Products?idProduct=1",
        },
        {
          id: "9908",
          game: "pokemon",
          episode_id: "set-1",
          name: "Example-GX",
          card_number: "157a",
          printed_card_number: "157a",
          cardmarket_id: "cm-1",
          cardmarket_url: "https://www.cardmarket.com/Pokemon/Products?idProduct=1",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "9907",
          prices: [
            {
              fetched_at: new Date("2026-07-14T12:00:00.000Z"),
              cm_en_lowest_nm: 21,
              tcp_market: 90,
              ...emptyMarketFields,
            },
          ],
        },
        {
          id: "9908",
          prices: [
            {
              fetched_at: new Date("2026-07-14T12:00:00.000Z"),
              cm_en_lowest_nm: 20,
              tcp_market: 22,
              ...emptyMarketFields,
            },
          ],
        },
      ]);

    const prices = await loadLatestSafeEnglishNmPrices([
      {
        id: "9908",
        game: "pokemon",
        episodeId: "set-1",
        name: "Example-GX",
        cardNumber: "157a",
        printedCardNumber: "157a",
        cardmarketId: "cm-1",
        cardmarketUrl: "https://www.cardmarket.com/Pokemon/Products?idProduct=1",
      },
    ]);

    expect(prices.get("9908")).toEqual(
      expect.objectContaining({
        value: 20,
        row: expect.objectContaining({
          card_id: "9908",
          cm_en_lowest_nm: 20,
          tcp_market: 22,
        }),
      })
    );
  });
});
