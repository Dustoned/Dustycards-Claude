import { describe, expect, it } from "vitest";
import {
  buildEpisodeSealedSetPriceHistory,
  buildEpisodeSetPriceHistory,
} from "@/lib/price-history";

describe("daily set price history", () => {
  it("uses the latest card snapshot per card per day for set totals", () => {
    const history = buildEpisodeSetPriceHistory([
      {
        card_id: "card-1",
        fetched_at: "2026-04-25T09:00:00.000Z",
        cm_en_lowest_nm: 10,
        cm_de_lowest_nm: null,
        cm_fr_lowest_nm: null,
        cm_es_lowest_nm: null,
        cm_it_lowest_nm: null,
      },
      {
        card_id: "card-1",
        fetched_at: "2026-04-25T21:00:00.000Z",
        cm_en_lowest_nm: 14,
        cm_de_lowest_nm: null,
        cm_fr_lowest_nm: null,
        cm_es_lowest_nm: null,
        cm_it_lowest_nm: null,
      },
      {
        card_id: "card-2",
        fetched_at: "2026-04-25T22:00:00.000Z",
        cm_en_lowest_nm: 3,
        cm_de_lowest_nm: null,
        cm_fr_lowest_nm: null,
        cm_es_lowest_nm: null,
        cm_it_lowest_nm: null,
      },
    ]);

    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      date: "2026-04-25",
      total_market: 17,
      priced_cards: 2,
    });
  });

  it("uses the latest sealed snapshot per product per day for sealed totals", () => {
    const history = buildEpisodeSealedSetPriceHistory([
      {
        product_id: "product-1",
        fetched_at: "2026-04-25T09:00:00.000Z",
        cm_lowest: 40,
        cm_lowest_eu: null,
        cm_lowest_de: null,
        cm_lowest_fr: null,
        cm_lowest_es: null,
        cm_lowest_it: null,
        cm_avg_7d: null,
        cm_avg_30d: null,
      },
      {
        product_id: "product-1",
        fetched_at: "2026-04-25T23:00:00.000Z",
        cm_lowest: 45,
        cm_lowest_eu: null,
        cm_lowest_de: null,
        cm_lowest_fr: null,
        cm_lowest_es: null,
        cm_lowest_it: null,
        cm_avg_7d: null,
        cm_avg_30d: null,
      },
      {
        product_id: "product-2",
        fetched_at: "2026-04-25T12:00:00.000Z",
        cm_lowest: 20,
        cm_lowest_eu: null,
        cm_lowest_de: null,
        cm_lowest_fr: null,
        cm_lowest_es: null,
        cm_lowest_it: null,
        cm_avg_7d: null,
        cm_avg_30d: null,
      },
    ]);

    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      date: "2026-04-25",
      total_market: 65,
      priced_cards: 2,
    });
  });
});
