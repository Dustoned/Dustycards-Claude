import { describe, expect, it } from "vitest";
import {
  getSealedProductPrice,
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
});

describe("selectCardDetailSealedProducts", () => {
  it("prioritizes consumer boxes and excludes cases and displays", () => {
    const products = [
      { id: "case", name: "Prismatic Evolutions 10 Elite Trainer Box Case" },
      { id: "display", name: "Prismatic Evolutions Booster Bundle Display" },
      { id: "sticker-display", name: "Prismatic Evolutions Tech Sticker Collection Display" },
      { id: "bundle", name: "Prismatic Evolutions Booster Bundle" },
      { id: "pc-etb", name: "Prismatic Evolutions Pokémon Center Elite Trainer Box" },
      { id: "etb", name: "Prismatic Evolutions Elite Trainer Box" },
      { id: "box", name: "Prismatic Evolutions Surprise Box" },
    ];

    expect(selectCardDetailSealedProducts(products).map((product) => product.id)).toEqual([
      "etb",
      "pc-etb",
      "box",
      "bundle",
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
