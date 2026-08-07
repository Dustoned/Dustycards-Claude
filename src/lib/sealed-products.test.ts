import { describe, expect, it } from "vitest";
import {
  getSealedEuMarketPriceSelection,
  getSealedMarketPriceForSource,
  getSealedProductPrice,
  isCollectionSealedOriginProduct,
  selectCardDetailSealedProducts,
} from "@/lib/sealed-products";

describe("getSealedProductPrice", () => {
  it("uses EU Market as the main sealed price and falls back to Market", () => {
    const price = {
      cm_lowest: 150,
      cm_lowest_eu: 120,
      cm_lowest_de: 110,
      cm_lowest_fr: null,
      cm_lowest_es: null,
      cm_lowest_it: null,
    };

    expect(getSealedProductPrice({ price })).toBe(120);
    expect(getSealedProductPrice({ price: { ...price, cm_lowest_eu: null } })).toBe(150);
  });

  it("keeps the selected source available for same-source history comparisons", () => {
    const price = {
      cm_lowest: 150,
      cm_lowest_eu: 120,
      cm_lowest_de: 110,
      cm_lowest_fr: null,
      cm_lowest_es: null,
      cm_lowest_it: 90,
    };

    expect(getSealedEuMarketPriceSelection(price)).toEqual({
      source: "cm_lowest_eu",
      value: 120,
    });
    expect(getSealedMarketPriceForSource(price, "cm_lowest_eu")).toBe(120);
    expect(getSealedMarketPriceForSource(price, "cm_lowest_it")).toBe(90);
    expect(getSealedMarketPriceForSource(price, "cm_lowest_fr")).toBeNull();
  });
});

describe("selectCardDetailSealedProducts", () => {
  it("prioritizes boosters and regular ETBs while excluding bulk packaging and accessories", () => {
    const products = [
      { id: "case", name: "Prismatic Evolutions 10 Elite Trainer Box Case" },
      { id: "display", name: "Prismatic Evolutions Booster Bundle Display" },
      { id: "sticker-display", name: "Prismatic Evolutions Tech Sticker Collection Display" },
      { id: "bundle", name: "Prismatic Evolutions Booster Bundle" },
      { id: "pc-etb", name: "Prismatic Evolutions Pokémon Center Elite Trainer Box" },
      { id: "etb", name: "Prismatic Evolutions Elite Trainer Box" },
      { id: "box", name: "Prismatic Evolutions Surprise Box" },
      { id: "booster", name: "Prismatic Evolutions Sleeved Booster" },
      { id: "playmat", name: "Prismatic Evolutions Premium Playmat Collection" },
      { id: "sleeves", name: "Prismatic Evolutions Card Sleeves" },
      { id: "deck-box", name: "Prismatic Evolutions Deck Box" },
    ];

    expect(selectCardDetailSealedProducts(products).map((product) => product.id)).toEqual([
      "booster",
      "etb",
      "pc-etb",
      "bundle",
      "box",
    ]);
  });

  it("respects the preview limit after filtering", () => {
    const products = [
      { name: "Set Booster Box" },
      { name: "Set Elite Trainer Box" },
      { name: "Set ex Box" },
    ];

    expect(selectCardDetailSealedProducts(products, 2)).toHaveLength(2);
  });
});

describe("isCollectionSealedOriginProduct", () => {
  it("keeps every individually opened sealed product", () => {
    expect(isCollectionSealedOriginProduct("Prismatic Evolutions Elite Trainer Box")).toBe(true);
    expect(isCollectionSealedOriginProduct("Prismatic Evolutions Booster Bundle")).toBe(true);
    expect(isCollectionSealedOriginProduct("Prismatic Evolutions Poster Collection")).toBe(true);
    expect(isCollectionSealedOriginProduct("Prismatic Evolutions Master Carton")).toBe(true);
    expect(isCollectionSealedOriginProduct("Prismatic Evolutions Sleeved Booster")).toBe(true);
    expect(isCollectionSealedOriginProduct("Prismatic Evolutions Tin")).toBe(true);
    expect(isCollectionSealedOriginProduct("Prismatic Evolutions Build & Battle Kit")).toBe(true);
  });

  it("rejects only cases and multi-product displays", () => {
    expect(isCollectionSealedOriginProduct("Prismatic Evolutions ETB Case")).toBe(false);
    expect(isCollectionSealedOriginProduct("Prismatic Evolutions Booster Bundle Display")).toBe(false);
    expect(isCollectionSealedOriginProduct("Prismatic Evolutions Mini Tin Display")).toBe(false);
  });
});
