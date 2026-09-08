import { describe, expect, it } from "vitest";
import { buildCardMarktplaatsSearchUrl } from "@/lib/marktplaats-search-url";

describe("Marktplaats search urls", () => {
  it("builds an exact Pokémon card search from its name and number", () => {
    const url = new URL(
      buildCardMarktplaatsSearchUrl({
        name: "Charizard ex",
        cardNumber: "#199/165",
      })
    );

    expect(url.hostname).toBe("www.marktplaats.nl");
    expect(decodeURIComponent(url.pathname)).toBe(
      "/q/Charizard+ex+199/165/"
    );
  });

  it("adds only graded for a graded card", () => {
    const url = buildCardMarktplaatsSearchUrl({
      name: "Monkey.D.Luffy",
      cardNumber: "OP05-119",
      graded: true,
    });

    expect(decodeURIComponent(new URL(url).pathname)).toBe(
      "/q/Monkey.D.Luffy+OP05-119+graded/"
    );
  });
});
