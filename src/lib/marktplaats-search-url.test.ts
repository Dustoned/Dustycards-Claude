import { describe, expect, it } from "vitest";
import { buildCardMarktplaatsSearchUrl } from "@/lib/marktplaats-search-url";

describe("Marktplaats search urls", () => {
  it("builds an exact Pokémon card search from its name and number", () => {
    const url = new URL(
      buildCardMarktplaatsSearchUrl({
        name: "Charizard ex",
        cardNumber: "#199/165",
        game: "pokemon",
      })
    );

    expect(url.hostname).toBe("www.marktplaats.nl");
    expect(decodeURIComponent(url.pathname)).toBe(
      "/q/Pokemon+kaart+Charizard+ex+199/165/"
    );
  });

  it("keeps One Piece searches in the correct card game", () => {
    const url = buildCardMarktplaatsSearchUrl({
      name: "Monkey.D.Luffy",
      cardNumber: "OP05-119",
      game: "one-piece",
    });

    expect(decodeURIComponent(new URL(url).pathname)).toBe(
      "/q/One+Piece+kaart+Monkey.D.Luffy+OP05-119/"
    );
  });
});
