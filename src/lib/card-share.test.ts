import { describe, expect, it } from "vitest";
import { buildCardShareCopy } from "@/lib/card-share";

describe("buildCardShareCopy", () => {
  it("includes the active card price and direct link", () => {
    expect(
      buildCardShareCopy({
        name: "Umbreon ex",
        price: 1194,
        currency: "EUR",
        url: "https://dustycards.example/expansions/pre?card=161",
      })
    ).toEqual({
      title: "Umbreon ex on DustyCards",
      text: "Check out this Umbreon ex for \u20ac1,194.00 on DustyCards.",
      clipboardText:
        "Check out this Umbreon ex for \u20ac1,194.00 on DustyCards.\nhttps://dustycards.example/expansions/pre?card=161",
    });
  });

  it("still produces useful copy when a current price is unavailable", () => {
    expect(
      buildCardShareCopy({
        name: "Pikachu",
        price: null,
        currency: "EUR",
        url: "https://dustycards.example/expansions/base?card=25",
      }).text
    ).toBe("Check out this Pikachu on DustyCards.");
  });
});
