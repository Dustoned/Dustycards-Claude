import { describe, expect, it } from "vitest";
import {
  buildLinkedBinderCostBasis,
  combineValueHistories,
  getCollectionCardMarketValue,
  getCollectionMatchedGradedPrice,
} from "@/lib/collection";

describe("combineValueHistories", () => {
  it("carries sealed value forward when card history has a newer point", () => {
    const combined = combineValueHistories(
      [
        {
          date: "2026-04-24",
          label: "24 apr",
          total_market: 5000,
          priced_cards: 100,
        },
        {
          date: "2026-04-25",
          label: "25 apr",
          total_market: 5538.26,
          priced_cards: 100,
        },
      ],
      [
        {
          date: "2026-04-21",
          label: "21 apr",
          total_market: 645,
          priced_cards: 2,
        },
      ]
    );

    expect(combined.map((point) => [point.date, point.total_market])).toEqual([
      ["2026-04-21", 645],
      ["2026-04-24", 5645],
      ["2026-04-25", 6183.26],
    ]);
  });

  it("does not count a history before its first known point", () => {
    const combined = combineValueHistories(
      [
        {
          date: "2026-04-20",
          label: "20 apr",
          total_market: 100,
          priced_cards: 1,
        },
      ],
      [
        {
          date: "2026-04-22",
          label: "22 apr",
          total_market: 50,
          priced_cards: 1,
        },
      ]
    );

    expect(combined.map((point) => [point.date, point.total_market])).toEqual([
      ["2026-04-20", 100],
      ["2026-04-22", 150],
    ]);
  });
});

describe("buildLinkedBinderCostBasis", () => {
  it("gives expensive cards a larger share than cheap commons", () => {
    const allocation = buildLinkedBinderCostBasis({
      binderType: "linked_set",
      binderEpisodeId: "set-1",
      binderBasePurchasePrice: 110,
      items: [
        { itemId: "hit", episodeId: "set-1", currentValue: 100 },
        { itemId: "common", episodeId: "set-1", currentValue: 10 },
      ],
    });

    expect(allocation.get("hit")?.value).toBe(100);
    expect(allocation.get("common")?.value).toBe(10);
  });

  it("distributes binder base spend and direct card prices exactly", () => {
    const allocation = buildLinkedBinderCostBasis({
      binderType: "linked_set",
      binderEpisodeId: "set-1",
      binderBasePurchasePrice: 50,
      items: [
        { itemId: "a", episodeId: "set-1", directPurchasePrice: 10, currentValue: 70 },
        { itemId: "b", episodeId: "set-1", directPurchasePrice: 5, currentValue: 30 },
      ],
    });
    const total = [...allocation.values()].reduce((sum, item) => sum + item.value, 0);

    expect(Number(total.toFixed(2))).toBe(65);
  });

  it("uses an equal fallback weight for unpriced owned cards", () => {
    const allocation = buildLinkedBinderCostBasis({
      binderType: "linked_set",
      binderEpisodeId: "set-1",
      binderBasePurchasePrice: 30,
      items: [
        { itemId: "priced", episodeId: "set-1", currentValue: 15 },
        { itemId: "unpriced-a", episodeId: "set-1", currentValue: null },
        { itemId: "unpriced-b", episodeId: "set-1", currentValue: null },
      ],
    });

    expect(allocation.get("unpriced-a")?.value).toBeGreaterThan(0);
    expect(allocation.get("unpriced-a")?.value).toBe(allocation.get("unpriced-b")?.value);
  });

  it("ignores cards outside the linked set", () => {
    const allocation = buildLinkedBinderCostBasis({
      binderType: "linked_set",
      binderEpisodeId: "set-1",
      binderBasePurchasePrice: 20,
      items: [
        { itemId: "inside", episodeId: "set-1", currentValue: 10 },
        { itemId: "outside", episodeId: "set-2", currentValue: 1000 },
      ],
    });

    expect(allocation.get("inside")?.value).toBe(20);
    expect(allocation.has("outside")).toBe(false);
  });

  it("keeps rounding exact to cents", () => {
    const allocation = buildLinkedBinderCostBasis({
      binderType: "linked_set",
      binderEpisodeId: "set-1",
      binderBasePurchasePrice: 10,
      items: [
        { itemId: "a", episodeId: "set-1", currentValue: 1 },
        { itemId: "b", episodeId: "set-1", currentValue: 1 },
        { itemId: "c", episodeId: "set-1", currentValue: 1 },
      ],
    });
    const values = [...allocation.values()].map((item) => item.value);

    expect(values.reduce((sum, value) => sum + value, 0)).toBeCloseTo(10, 2);
    expect(values).toEqual([3.34, 3.33, 3.33]);
  });
});

describe("graded collection values", () => {
  const usdToEurRate = {
    from: "USD" as const,
    to: "EUR" as const,
    rate: 0.92,
    date: "2026-05-14",
    source: "frankfurter" as const,
  };

  it("uses exact eBay sold grade before raw pricing for saved graded cards", () => {
    const card = {
      prices: [
        {
          cm_en_lowest_nm: 40,
          cm_de_lowest_nm: null,
          cm_fr_lowest_nm: null,
          cm_es_lowest_nm: null,
          cm_it_lowest_nm: null,
        },
      ],
      gradedPrices: [{ label: "PSA 9", price: 180 }],
      ebaySoldGradedPrices: [
        {
          label: "PSA 8",
          company: "PSA",
          grade: "8",
          median_price: 100,
          currency: "USD",
        },
      ],
    };

    expect(
      getCollectionMatchedGradedPrice(card, {
        gradingCompany: "PSA",
        gradingGrade: "8",
        usdToEurRate,
      })
    ).toEqual({
      label: "PSA 8 eBay sold",
      price: 92,
      source: "ebay_sold_graded",
    });
    expect(
      getCollectionCardMarketValue(card, {
        gradingCompany: "PSA",
        gradingGrade: "8",
        usdToEurRate,
      })
    ).toBe(92);
  });

  it("falls back to CardMarket graded when no exact eBay sold grade is usable", () => {
    const card = {
      prices: [
        {
          cm_en_lowest_nm: 40,
          cm_de_lowest_nm: null,
          cm_fr_lowest_nm: null,
          cm_es_lowest_nm: null,
          cm_it_lowest_nm: null,
        },
      ],
      gradedPrices: [{ label: "PSA 8", price: 120 }],
      ebaySoldGradedPrices: [
        {
          label: "PSA 8",
          company: "PSA",
          grade: "8",
          median_price: 100,
          currency: "USD",
        },
      ],
    };

    expect(
      getCollectionMatchedGradedPrice(card, {
        gradingCompany: "PSA",
        gradingGrade: "8",
        usdToEurRate: null,
      })
    ).toEqual({
      label: "PSA 8",
      price: 120,
      source: "cardmarket_graded",
    });
  });
});
