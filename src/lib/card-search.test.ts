import { describe, expect, it } from "vitest";
import {
  buildCardNumberSearchAliases,
  cardMatchesSearchQuery,
  cardNumberMatchesSearch,
  textMatchesSearchQuery,
} from "@/lib/card-search";

describe("card search helpers", () => {
  it("builds leading-zero aliases for numeric card numbers", () => {
    expect(buildCardNumberSearchAliases("94")).toContain("094");
    expect(buildCardNumberSearchAliases("094")).toContain("94");
  });

  it("matches card numbers with or without leading zeroes", () => {
    expect(cardNumberMatchesSearch("94", "094")).toBe(true);
    expect(cardNumberMatchesSearch("094", "94")).toBe(true);
    expect(cardNumberMatchesSearch("094/182", "94")).toBe(true);
  });

  it("matches slash card numbers typed with spaces or compacted digits", () => {
    expect(cardNumberMatchesSearch("002/203", "002 203")).toBe(true);
    expect(cardNumberMatchesSearch("002/203", "2 203")).toBe(true);
    expect(cardNumberMatchesSearch("002/203", "002203")).toBe(true);
  });

  it("matches compact set references with padded or unpadded numbers", () => {
    expect(
      cardMatchesSearchQuery(
        {
          name: "Mega Zygarde ex",
          cardNumber: "94",
          episodeName: "Perfect Order",
          episodeCode: "POR",
        },
        "por094"
      )
    ).toBe(true);
  });

  it("matches TCGGO style slugs and URLs", () => {
    const card = {
      name: "Alcremie VMAX",
      cardNumber: "73",
      episodeName: "Shining Fates",
      episodeCode: "SHF",
    };

    expect(cardMatchesSearchQuery(card, "alcremie-vmax-73")).toBe(true);
    expect(
      cardMatchesSearchQuery(
        card,
        "https://www.tcggo.com/pokemon/shining-fates/alcremie-vmax-73"
      )
    ).toBe(true);
  });

  it("keeps short text searches prefix-based to reduce noisy substring matches", () => {
    expect(textMatchesSearchQuery(["Gengar ex", "Mega Gengar"], "ge")).toBe(true);
    expect(textMatchesSearchQuery(["Ceruledge ex"], "ge")).toBe(false);
    expect(
      cardMatchesSearchQuery(
        {
          name: "Ceruledge ex",
          cardNumber: "147/131",
          episodeName: "Prismatic Evolutions",
          episodeCode: "PRE",
        },
        "ge"
      )
    ).toBe(false);
  });
});
