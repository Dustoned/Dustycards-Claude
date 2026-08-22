import { describe, expect, it } from "vitest";
import { inferSealedOpeningPackCount, isOpenableSealedProduct } from "@/lib/opening-sealed";

describe("inferSealedOpeningPackCount", () => {
  it("uses explicit product quantities before category defaults", () => {
    expect(inferSealedOpeningPackCount("Rebel Clash Booster Box (18 Boosters)", 36)).toBe(18);
    expect(inferSealedOpeningPackCount("Three Card 3-Pack Blister")).toBe(3);
  });

  it("recognizes dependable sealed formats", () => {
    expect(inferSealedOpeningPackCount("Prismatic Evolutions Booster Bundle")).toBe(6);
    expect(inferSealedOpeningPackCount("Scarlet & Violet Build & Battle Stadium")).toBe(12);
    expect(inferSealedOpeningPackCount("Scarlet & Violet Build & Battle Box")).toBe(4);
    expect(inferSealedOpeningPackCount("Temporal Forces Sleeved Booster")).toBe(1);
  });

  it("uses set research and the standard international booster-box quantity", () => {
    expect(inferSealedOpeningPackCount("Temporal Forces Booster Box", 36)).toBe(36);
    expect(inferSealedOpeningPackCount("Temporal Forces Booster Box", null)).toBe(36);
    expect(inferSealedOpeningPackCount("OP-09 Booster Box", null, "one-piece")).toBe(24);
    expect(inferSealedOpeningPackCount("Temporal Forces Elite Trainer Box")).toBeNull();
  });
});

describe("isOpenableSealedProduct", () => {
  it("keeps consumer sealed products and rejects wholesale/accessory products", () => {
    expect(isOpenableSealedProduct("Prismatic Evolutions Booster Bundle")).toBe(true);
    expect(isOpenableSealedProduct("Prismatic Evolutions Binder Collection")).toBe(true);
    expect(isOpenableSealedProduct("Prismatic Evolutions Booster Bundle Display")).toBe(false);
    expect(isOpenableSealedProduct("Prismatic Evolutions ETB Case")).toBe(false);
    expect(isOpenableSealedProduct("Prismatic Evolutions Playmat")).toBe(false);
    expect(isOpenableSealedProduct("Prismatic Evolutions Card Sleeves 65-Pack")).toBe(false);
  });
});
