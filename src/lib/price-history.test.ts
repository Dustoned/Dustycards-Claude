import { describe, expect, it } from "vitest";
import {
  buildCardEbaySoldGradedPriceHistory,
  buildCardPriceHistory,
  buildCardGradedPriceHistory,
  buildEpisodeSealedSetPriceHistory,
  buildEpisodeSetPriceHistory,
  buildSealedPriceHistory,
  getSealedMarketHistorySeriesCurrentValue,
  getSealedMarketHistorySeriesValue,
  getSaneCardMarketHistorySeriesCurrentValue,
} from "@/lib/price-history";

describe("card price history source isolation", () => {
  it("keeps the latest valid EN/NM point when a later same-day snapshot only has another source", () => {
    const history = buildCardPriceHistory([
      {
        fetched_at: "2026-07-12T08:00:00.000Z",
        cm_en_lowest_nm: 300,
        cm_de_lowest_nm: 280,
        cm_fr_lowest_nm: null,
        cm_es_lowest_nm: null,
        cm_it_lowest_nm: null,
        cm_jp_lowest_nm: null,
        tcp_market: null,
        cm_en_avg_7d: 295,
        cm_en_avg_30d: 290,
      },
      {
        fetched_at: "2026-07-12T20:00:00.000Z",
        cm_en_lowest_nm: null,
        cm_de_lowest_nm: 285,
        cm_fr_lowest_nm: null,
        cm_es_lowest_nm: null,
        cm_it_lowest_nm: null,
        cm_jp_lowest_nm: null,
        tcp_market: 39.87,
        cm_en_avg_7d: null,
        cm_en_avg_30d: null,
      },
      {
        fetched_at: "2026-07-12T21:00:00.000Z",
        cm_en_lowest_nm: 9001,
        cm_de_lowest_nm: null,
        cm_fr_lowest_nm: null,
        cm_es_lowest_nm: null,
        cm_it_lowest_nm: null,
        cm_jp_lowest_nm: null,
        tcp_market: null,
        cm_en_avg_7d: null,
        cm_en_avg_30d: null,
      },
    ]);

    expect(history).toEqual([
      expect.objectContaining({
        date: "2026-07-12",
        cm_market: 300,
        cm_market_en: 300,
        cm_market_de: 285,
        tcp_market: 39.87,
        cm_avg_7d: 295,
        cm_avg_30d: 290,
      }),
    ]);
  });
});

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

describe("graded card price history", () => {
  it("groups snapshots per label and uses the latest graded price per day", () => {
    const history = buildCardGradedPriceHistory([
      {
        label: "PSA 10",
        price: 100,
        fetched_at: "2026-04-25T09:00:00.000Z",
      },
      {
        label: "PSA 10",
        price: 125,
        fetched_at: "2026-04-25T21:00:00.000Z",
      },
      {
        label: "PSA 9",
        price: 60,
        fetched_at: "2026-04-25T10:00:00.000Z",
      },
      {
        label: "PSA 10",
        price: 130,
        fetched_at: "2026-04-26T09:00:00.000Z",
      },
    ]);

    expect(history[0]).toMatchObject({
      label: "PSA 10",
      points: [
        { date: "2026-04-25", value: 125 },
        { date: "2026-04-26", value: 130 },
      ],
    });
    expect(history[1]).toMatchObject({
      label: "PSA 9",
      points: [{ date: "2026-04-25", value: 60 }],
    });
  });

  it("groups eBay sold snapshots per label and uses the latest median per day", () => {
    const history = buildCardEbaySoldGradedPriceHistory([
      {
        label: "PSA 10",
        median_price: 100,
        currency: "USD",
        sample_size: 2,
        fetched_at: "2026-04-25T09:00:00.000Z",
      },
      {
        label: "PSA 10",
        median_price: 125,
        currency: "USD",
        sample_size: 4,
        fetched_at: "2026-04-25T21:00:00.000Z",
      },
      {
        label: "PSA 9",
        median_price: 60,
        currency: "USD",
        sample_size: 3,
        fetched_at: "2026-04-25T10:00:00.000Z",
      },
      {
        label: "PSA 10",
        median_price: 130,
        currency: "USD",
        sample_size: 5,
        fetched_at: "2026-04-26T09:00:00.000Z",
      },
    ]);

    expect(history[0]).toMatchObject({
      label: "PSA 10",
      currency: "USD",
      latest_sample_size: 5,
      points: [
        { date: "2026-04-25", value: 125 },
        { date: "2026-04-26", value: 130 },
      ],
    });
    expect(history[1]).toMatchObject({
      label: "PSA 9",
      latest_sample_size: 3,
      points: [{ date: "2026-04-25", value: 60 }],
    });
  });

  it("converts eBay sold USD history to EUR when a rate is available", () => {
    const history = buildCardEbaySoldGradedPriceHistory(
      [
        {
          label: "PSA 10",
          median_price: 100,
          currency: "USD",
          sample_size: 2,
          fetched_at: "2026-04-25T09:00:00.000Z",
        },
      ],
      { usdToEurRate: 0.92 }
    );

    expect(history[0]).toMatchObject({
      label: "PSA 10",
      currency: "EUR",
      points: [{ date: "2026-04-25", value: 92 }],
    });
  });
});

describe("sealed price history series", () => {
  it("keeps CardMarket language prices available for chart series", () => {
    const history = buildSealedPriceHistory([
      {
        fetched_at: "2026-05-13T19:20:00.000Z",
        cm_lowest: 290,
        cm_lowest_eu: 290,
        cm_lowest_de: 229.9,
        cm_lowest_fr: 169,
        cm_lowest_es: 230,
        cm_lowest_it: 138,
        cm_avg_7d: 290,
        cm_avg_30d: 263.63,
      },
    ]);

    expect(history[0]).toMatchObject({
      cm_market: 290,
      cm_market_eu: 290,
      cm_market_de: 229.9,
      cm_market_fr: 169,
      cm_market_es: 230,
      cm_market_it: 138,
    });
    expect(getSealedMarketHistorySeriesValue(history[0], "cm_market_fr")).toBe(169);
  });

  it("does not erase a valid EN/NM set value with a later source-only or sentinel row", () => {
    const history = buildEpisodeSetPriceHistory([
      {
        card_id: "card-1",
        fetched_at: "2026-04-25T09:00:00.000Z",
        cm_en_lowest_nm: 300,
        cm_de_lowest_nm: null,
        cm_fr_lowest_nm: null,
        cm_es_lowest_nm: null,
        cm_it_lowest_nm: null,
      },
      {
        card_id: "card-1",
        fetched_at: "2026-04-25T20:00:00.000Z",
        cm_en_lowest_nm: null,
        cm_de_lowest_nm: 45,
        cm_fr_lowest_nm: null,
        cm_es_lowest_nm: null,
        cm_it_lowest_nm: null,
      },
      {
        card_id: "card-1",
        fetched_at: "2026-04-25T22:00:00.000Z",
        cm_en_lowest_nm: 9001,
        cm_de_lowest_nm: null,
        cm_fr_lowest_nm: null,
        cm_es_lowest_nm: null,
        cm_it_lowest_nm: null,
      },
    ]);

    expect(history[0]).toMatchObject({
      date: "2026-04-25",
      total_market: 300,
      priced_cards: 1,
    });
  });

  it("reads current values for sealed language series", () => {
    expect(
      getSealedMarketHistorySeriesCurrentValue(
        {
          cm_lowest: 290,
          cm_lowest_eu: 290,
          cm_lowest_de: 229.9,
          cm_lowest_fr: null,
          cm_lowest_es: 230,
          cm_lowest_it: null,
        },
        "cm_market_de"
      )
    ).toBe(229.9);
  });
});

describe("sane cardmarket current values", () => {
  it("uses the last known English value when the newest English quote is missing", () => {
    const current = getSaneCardMarketHistorySeriesCurrentValue(
      {
        cm_en_lowest_nm: null,
        cm_de_lowest_nm: 200,
        cm_fr_lowest_nm: 150,
        cm_es_lowest_nm: null,
        cm_it_lowest_nm: 169.99,
      },
      "cm_market_en",
      [
        {
          date: "2026-06-16",
          label: "16 jun",
          cm_market: 478.95,
          cm_market_en: 478.95,
          cm_market_de: 200,
          cm_market_fr: 150,
          cm_market_es: null,
          cm_market_it: 169.99,
          cm_market_jp: null,
          tcp_market: null,
          cm_avg_7d: null,
          cm_avg_30d: null,
        },
        {
          date: "2026-07-12",
          label: "12 jul",
          cm_market: null,
          cm_market_en: null,
          cm_market_de: 200,
          cm_market_fr: 150,
          cm_market_es: null,
          cm_market_it: 169.99,
          cm_market_jp: null,
          tcp_market: null,
          cm_avg_7d: null,
          cm_avg_30d: null,
        },
      ]
    );

    expect(current).toEqual({ value: 478.95, ignoredValue: null });
  });

  it("ignores the provider no-listing sentinel", () => {
    const current = getSaneCardMarketHistorySeriesCurrentValue(
      {
        cm_en_lowest_nm: 9001,
        cm_de_lowest_nm: null,
        cm_fr_lowest_nm: null,
        cm_es_lowest_nm: null,
        cm_it_lowest_nm: null,
      },
      "cm_market_en",
      [
        {
          date: "2026-07-11",
          label: "11 jul",
          cm_market: 47.5,
          cm_market_en: 47.5,
          cm_market_de: null,
          cm_market_fr: null,
          cm_market_es: null,
          cm_market_it: null,
          cm_market_jp: null,
          tcp_market: null,
          cm_avg_7d: null,
          cm_avg_30d: null,
        },
      ]
    );

    expect(current).toEqual({ value: 47.5, ignoredValue: null });
  });

  it("ignores extreme low current outliers when recent history is much higher", () => {
    const current = getSaneCardMarketHistorySeriesCurrentValue(
      {
        cm_en_lowest_nm: 0.05,
        cm_de_lowest_nm: 0.09,
        cm_fr_lowest_nm: 525,
        cm_es_lowest_nm: 0.1,
        cm_it_lowest_nm: 0.05,
      },
      "cm_market_en",
      [
        {
          date: "2026-04-14",
          label: "14 apr",
          cm_market: 480,
          cm_market_en: 480,
          cm_market_de: 213,
          cm_market_fr: 525,
          cm_market_es: 700,
          cm_market_it: 500,
          cm_market_jp: null,
          tcp_market: null,
          cm_avg_7d: null,
          cm_avg_30d: null,
        },
        {
          date: "2026-04-15",
          label: "15 apr",
          cm_market: 480,
          cm_market_en: 480,
          cm_market_de: 213,
          cm_market_fr: 525,
          cm_market_es: 700,
          cm_market_it: 500,
          cm_market_jp: null,
          tcp_market: null,
          cm_avg_7d: null,
          cm_avg_30d: null,
        },
        {
          date: "2026-04-16",
          label: "16 apr",
          cm_market: 0.05,
          cm_market_en: 0.05,
          cm_market_de: 0.09,
          cm_market_fr: 525,
          cm_market_es: 0.1,
          cm_market_it: 0.05,
          cm_market_jp: null,
          tcp_market: null,
          cm_avg_7d: null,
          cm_avg_30d: null,
        },
      ]
    );

    expect(current).toEqual({ value: 480, ignoredValue: 0.05 });
  });

  it("keeps genuinely cheap cards unchanged", () => {
    const current = getSaneCardMarketHistorySeriesCurrentValue(
      {
        cm_en_lowest_nm: 0.2,
        cm_de_lowest_nm: null,
        cm_fr_lowest_nm: null,
        cm_es_lowest_nm: null,
        cm_it_lowest_nm: null,
      },
      "cm_market_en",
      [
        {
          date: "2026-04-15",
          label: "15 apr",
          cm_market: 0.25,
          cm_market_en: 0.25,
          cm_market_de: null,
          cm_market_fr: null,
          cm_market_es: null,
          cm_market_it: null,
          cm_market_jp: null,
          tcp_market: null,
          cm_avg_7d: null,
          cm_avg_30d: null,
        },
      ]
    );

    expect(current).toEqual({ value: 0.2, ignoredValue: null });
  });
});
