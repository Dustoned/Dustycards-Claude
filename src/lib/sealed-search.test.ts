import { describe, expect, it } from "vitest";
import { getSealedSearchTokens, rankSealedSearchCandidates } from "@/lib/sealed-search";

const products = [
  {
    id: "pitch-etb",
    name: "Pitch Black Elite Trainer Box",
    episode: { name: "Pitch Black", code: "PBL" },
  },
  {
    id: "pitch-box",
    name: "Pitch Black Booster Box",
    episode: { name: "Pitch Black", code: "PBL" },
  },
  {
    id: "prismatic-upc",
    name: "Prismatic Evolutions Ultra-Premium Collection",
    episode: { name: "Prismatic Evolutions", code: "PRE" },
  },
];

describe("sealed search", () => {
  it("expands common product abbreviations", () => {
    expect(getSealedSearchTokens("PC ETB")).toEqual([
      "pokemon",
      "center",
      "elite",
      "trainer",
      "box",
    ]);
    expect(getSealedSearchTokens("UPC")).toEqual(["ultra", "premium", "collection"]);
  });

  it("combines a set name or code with a product abbreviation", () => {
    expect(rankSealedSearchCandidates(products, "Pitch Black ETB").map(({ id }) => id))
      .toEqual(["pitch-etb"]);
    expect(rankSealedSearchCandidates(products, "PBL BB").map(({ id }) => id))
      .toEqual(["pitch-box"]);
  });

  it("finds products by set code and sealed shorthand", () => {
    expect(rankSealedSearchCandidates(products, "PBL").map(({ id }) => id))
      .toEqual(["pitch-etb", "pitch-box"]);
    expect(rankSealedSearchCandidates(products, "UPC").map(({ id }) => id))
      .toEqual(["prismatic-upc"]);
  });
});
