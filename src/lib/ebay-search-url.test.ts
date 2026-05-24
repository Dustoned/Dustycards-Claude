import { describe, expect, it } from "vitest";
import { buildCardEbaySearchUrl, buildSealedEbaySearchUrl } from "@/lib/ebay-search-url";

describe("eBay search urls", () => {
  it("builds a direct card search from name and number", () => {
    const url = new URL(
      buildCardEbaySearchUrl({
        name: "Mega Dragonite ex",
        cardNumber: "290/217",
      })
    );

    expect(url.hostname).toBe("www.ebay.nl");
    expect(url.pathname).toBe("/sch/i.html");
    expect(url.searchParams.get("_nkw")).toBe("Mega Dragonite ex 290/217");
    expect(url.searchParams.get("_sacat")).toBe("183454");
  });

  it("adds saved grade details to graded card searches", () => {
    const url = new URL(
      buildCardEbaySearchUrl({
        name: "Charizard ex",
        cardNumber: "#199/165",
        gradingCompany: "PSA",
        gradingGrade: "10",
      })
    );

    expect(url.searchParams.get("_nkw")).toBe("Charizard ex 199/165 PSA 10");
  });

  it("builds sealed searches without forcing the single-card category", () => {
    const url = new URL(
      buildSealedEbaySearchUrl({
        name: "Prismatic Evolutions Booster Bundle",
        episodeName: "Scarlet & Violet",
        episodeCode: "PRE",
      })
    );

    expect(url.searchParams.get("_nkw")).toBe(
      "Prismatic Evolutions Booster Bundle Scarlet & Violet PRE"
    );
    expect(url.searchParams.has("_sacat")).toBe(false);
  });
});
