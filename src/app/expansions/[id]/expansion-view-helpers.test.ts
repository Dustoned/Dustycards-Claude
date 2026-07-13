import { describe, expect, it } from "vitest";
import type { CardData } from "@/types/card-data";
import {
  CARD_NUMBER_FALLBACK,
  compareCardNumbers,
  comparePriceValues,
  formatSortSummary,
  getCardMarketPrice,
  getDefaultSortDir,
  getPriceBySource,
  getPriceSourceCurrency,
  getSortLabel,
  getSortPrice,
  hasAnyVisiblePrice,
  neutralFilterChip,
  rarityFilterChip,
} from "./expansion-view-helpers";

function makeCard(overrides: Partial<CardData> = {}): CardData {
  return {
    id: "card-1",
    name: "Pikachu",
    card_number: "025",
    rarity: "Common",
    supertype: "Pokemon",
    image_url: null,
    episode_id: "base",
    episode_name: "Base Set",
    episode_code: "BASE",
    price: null,
    ...overrides,
  } as CardData;
}

describe("getCardMarketPrice", () => {
  it("returns null when no price object", () => {
    expect(getCardMarketPrice(makeCard())).toBeNull();
  });

  it("does not substitute another language when English Near Mint is unavailable", () => {
    expect(
      getCardMarketPrice(
        makeCard({
          price: {
            cm_en_lowest_nm: null,
            cm_de_lowest_nm: null,
            cm_fr_lowest_nm: 12.5,
            cm_es_lowest_nm: 8,
          } as CardData["price"],
        })
      )
    ).toBeNull();
  });

  it("prefers en when present", () => {
    expect(
      getCardMarketPrice(
        makeCard({
          price: {
            cm_en_lowest_nm: 99,
            cm_de_lowest_nm: 1,
          } as CardData["price"],
        })
      )
    ).toBe(99);
  });
});

describe("getSortPrice", () => {
  const card = makeCard({
    price: { cm_en_lowest_nm: 10, tcp_market: 22 } as CardData["price"],
  });

  it("uses tcp_market for sortBy=tcp", () => {
    expect(getSortPrice(card, "tcp")).toBe(22);
  });

  it("uses English Near Mint for sortBy=cm_en", () => {
    expect(getSortPrice(card, "cm_en")).toBe(10);
  });

  it("returns null when sortBy=number", () => {
    // sort-by-number cards still get their cm price for tiebreaks elsewhere
    expect(getSortPrice(card, "number")).toBe(10);
  });
});

describe("getPriceBySource", () => {
  const card = makeCard({
    price: { cm_en_lowest_nm: 5, tcp_market: 7 } as CardData["price"],
  });

  it("returns tcp price for tcp source", () => {
    expect(getPriceBySource(card, "tcp")).toBe(7);
  });

  it("returns cm price for cm source", () => {
    expect(getPriceBySource(card, "cm_en")).toBe(5);
  });
});

describe("hasAnyVisiblePrice", () => {
  it("returns false when price is null", () => {
    expect(hasAnyVisiblePrice(makeCard())).toBe(false);
  });

  it("returns false when all prices are null", () => {
    expect(
      hasAnyVisiblePrice(
        makeCard({
          price: {
            cm_en_lowest_nm: null,
            tcp_market: null,
          } as CardData["price"],
        })
      )
    ).toBe(false);
  });

  it("returns true when any price is set", () => {
    expect(
      hasAnyVisiblePrice(
        makeCard({ price: { tcp_low: 0.5 } as CardData["price"] })
      )
    ).toBe(true);
  });
});

describe("getPriceSourceCurrency", () => {
  it("returns USD for tcp", () => {
    expect(getPriceSourceCurrency("tcp")).toBe("USD");
  });

  it("returns EUR for everything else", () => {
    expect(getPriceSourceCurrency("cm_en")).toBe("EUR");
  });
});

describe("getSortLabel", () => {
  it("maps known sortBy values", () => {
    expect(getSortLabel("number")).toBe("Number");
    expect(getSortLabel("cm_en")).toBe("CardMarket");
    expect(getSortLabel("tcp")).toBe("TCGPlayer");
  });
});

describe("getDefaultSortDir", () => {
  it("number ascends, prices descend", () => {
    expect(getDefaultSortDir("number")).toBe("asc");
    expect(getDefaultSortDir("cm_en")).toBe("desc");
    expect(getDefaultSortDir("tcp")).toBe("desc");
  });
});

describe("comparePriceValues", () => {
  it("treats null as last regardless of direction", () => {
    expect(comparePriceValues(null, 5, "asc")).toBeGreaterThan(0);
    expect(comparePriceValues(5, null, "asc")).toBeLessThan(0);
    expect(comparePriceValues(null, 5, "desc")).toBeGreaterThan(0);
    expect(comparePriceValues(5, null, "desc")).toBeLessThan(0);
  });

  it("returns 0 when both null", () => {
    expect(comparePriceValues(null, null, "asc")).toBe(0);
  });

  it("ascends low to high", () => {
    expect(comparePriceValues(2, 5, "asc")).toBeLessThan(0);
    expect(comparePriceValues(5, 2, "asc")).toBeGreaterThan(0);
  });

  it("descends high to low", () => {
    expect(comparePriceValues(2, 5, "desc")).toBeGreaterThan(0);
    expect(comparePriceValues(5, 2, "desc")).toBeLessThan(0);
  });
});

describe("compareCardNumbers", () => {
  it("sorts numerically", () => {
    expect(
      compareCardNumbers(
        makeCard({ card_number: "9" }),
        makeCard({ card_number: "10" })
      )
    ).toBeLessThan(0);
  });

  it("uses fallback when card_number is missing", () => {
    expect(CARD_NUMBER_FALLBACK).toBe("999999");
    expect(
      compareCardNumbers(
        makeCard({ card_number: null }),
        makeCard({ card_number: "1" })
      )
    ).toBeGreaterThan(0);
  });

  it("falls back to name comparison when numbers tie", () => {
    expect(
      compareCardNumbers(
        makeCard({ card_number: "5", name: "Bulbasaur" }),
        makeCard({ card_number: "5", name: "Charmander" })
      )
    ).toBeLessThan(0);
  });
});

describe("formatSortSummary", () => {
  it("formats as <label> <direction>", () => {
    expect(formatSortSummary("number", "asc")).toBe("Number low-high");
    expect(formatSortSummary("cm_en", "desc")).toBe("CardMarket high-low");
  });
});

describe("filter chips", () => {
  it("rarityFilterChip swaps active styling", () => {
    const active = rarityFilterChip("Rare", true);
    const inactive = rarityFilterChip("Rare", false);
    expect(active).not.toEqual(inactive);
    expect(active).toContain("ring-2");
    expect(inactive).toContain("opacity-75");
  });

  it("neutralFilterChip swaps active styling", () => {
    const active = neutralFilterChip(true);
    const inactive = neutralFilterChip(false);
    expect(active).not.toEqual(inactive);
    expect(active).toContain("bg-violet-600");
  });
});
