import { describe, expect, it } from "vitest";
import {
  classifyPromoOrigin,
  findPromoOriginProduct,
  normalizePromoNumber,
  parsePromoOriginWikitext,
  renderPromoOriginWikitext,
} from "@/lib/promo-origins";

describe("promo origins", () => {
  it("normalizes modern and older Black Star promo numbers", () => {
    expect(normalizePromoNumber("SVP 013")).toBe("13");
    expect(normalizePromoNumber("SWSH001")).toBe("1");
    expect(normalizePromoNumber("SM240")).toBe("240");
    expect(normalizePromoNumber("SM103a")).toBe("103A");
    expect(normalizePromoNumber("not-a-number")).toBeNull();
  });

  it("renders nested merchandise templates and separate distributions", () => {
    expect(
      renderPromoOriginWikitext(
        "{{TCGMerch|Scarlet & Violet|Series|Mimikyu ex Box}} / {{TCGMerch|Scarlet & Violet|Series|Mimikyu ex Showcase}}"
      )
    ).toEqual(["Mimikyu ex Box", "Mimikyu ex Showcase"]);
  });

  it("parses both modern and legacy set-list templates", () => {
    const source = `
{{Setlist/entry|013|G|{{TCG ID|SVP Promo|Miraidon|13}}|Lightning|||{{TCGMerch|Scarlet & Violet|Series|Scarlet & Violet Elite Trainer Box}} (Miraidon)}}
{{Setlist/nmentry|SM05|[[Snorlax-GX (SM Promo 5)|Snorlax]]{{GX}}|Colorless|||{{TCGMerch|Sun & Moon|Series|Snorlax-GX Box}}}}
`;
    expect(parsePromoOriginWikitext(source)).toEqual([
      expect.objectContaining({ promoNumber: "13", originName: "Scarlet & Violet Elite Trainer Box (Miraidon)", originType: "sealed_product" }),
      expect.objectContaining({ promoNumber: "5", originName: "Snorlax-GX Box", originType: "sealed_product" }),
    ]);
  });

  it("distinguishes products, events and retail giveaways", () => {
    expect(classifyPromoOrigin("Mimikyu ex Box")).toBe("sealed_product");
    expect(classifyPromoOrigin("Paldea Evolved Prerelease staff promo")).toBe("event");
    expect(classifyPromoOrigin("GameStop gift with purchase")).toBe("retailer");
  });

  it("matches a card-specific blister without guessing an ambiguous product", () => {
    const products = [
      { id: "spidops", name: "Scarlet & Violet: Spidops 1-Pack Blister" },
      { id: "arcanine", name: "Scarlet & Violet: Arcanine 3-Pack Blister" },
    ];
    expect(
      findPromoOriginProduct("Scarlet & Violet Single Pack Blisters", "Spidops", products)?.id
    ).toBe("spidops");
    expect(
      findPromoOriginProduct("Scarlet & Violet Three Pack Blisters", "Arcanine", products)?.id
    ).toBe("arcanine");
    expect(
      findPromoOriginProduct("Scarlet & Violet Blister", "Unknown", products)
    ).toBeNull();
    expect(
      findPromoOriginProduct("Fusion Strike Build & Battle Box", "Deoxys", [
        { id: "stadium", name: "Fusion Strike: Build & Battle Stadium Box" },
      ])
    ).toBeNull();
    expect(
      findPromoOriginProduct("Mewtwo-EX Box", "Mewtwo-EX", [
        { id: "wrong-era", name: "Team Rocket's Mewtwo ex Box" },
      ])
    ).toBeNull();
  });
});
