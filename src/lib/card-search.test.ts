import { describe, expect, it } from "vitest";
import {
  buildCardNumberSearchAliases,
  cardMatchesSearchQuery,
  cardNumberMatchesSearch,
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
});
