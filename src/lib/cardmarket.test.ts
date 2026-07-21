import { describe, expect, it } from "vitest";
import {
  buildCardMarketProxyUrl,
  buildCardMarketSealedProductUrl,
  getSafeDirectCardMarketCardUrl,
  isCardMarketProductIdUrl,
  resolveCardMarketCardUrl,
  resolveCardMarketSealedProductUrl,
} from "@/lib/cardmarket";
import { ONE_PIECE_GAME, POKEMON_GAME } from "@/lib/games";

describe("CardMarket card URL resolution", () => {
  it("removes the DustyCards One Piece scope from TCGGO redirect URLs", () => {
    expect(buildCardMarketProxyUrl("one-piece:48399")).toBe(
      "https://www.tcggo.com/external/cm/48399"
    );
    expect(
      resolveCardMarketCardUrl({
        id: "one-piece:48399",
        game: ONE_PIECE_GAME,
        cardmarket_url: null,
      })
    ).toBe("https://www.tcggo.com/external/cm/48399");
  });

  it("keeps Pokemon idProduct URLs direct so English NM filters survive", () => {
    const url = "https://www.cardmarket.com/Pokemon/Products?idProduct=775295&language=1";

    expect(isCardMarketProductIdUrl(url)).toBe(true);
    expect(getSafeDirectCardMarketCardUrl(url, POKEMON_GAME)).toBe(
      "https://www.cardmarket.com/Pokemon/Products?idProduct=775295&language=1&minCondition=2"
    );
    expect(
      resolveCardMarketCardUrl({
        id: "18459",
        game: POKEMON_GAME,
        cardmarket_url: url,
      })
    ).toBe(
      "https://www.cardmarket.com/Pokemon/Products?idProduct=775295&language=1&minCondition=2"
    );
  });

  it("builds a filtered direct link from a known product id when the stored URL is missing", () => {
    expect(
      resolveCardMarketCardUrl({
        id: "18459",
        game: POKEMON_GAME,
        cardmarket_id: "775295",
        cardmarket_url: null,
      })
    ).toBe(
      "https://www.cardmarket.com/Pokemon/Products?idProduct=775295&language=1&minCondition=2"
    );
  });

  it("keeps validated One Piece idProduct URLs direct instead of using the scoped-ID proxy", () => {
    const url = "https://www.cardmarket.com/OnePiece/Products?idProduct=842904&language=1";

    expect(isCardMarketProductIdUrl(url)).toBe(true);
    expect(getSafeDirectCardMarketCardUrl(url, ONE_PIECE_GAME)).toBe(
      "https://www.cardmarket.com/OnePiece/Products?idProduct=842904&language=1&minCondition=2"
    );
    expect(
      resolveCardMarketCardUrl({
        id: "one-piece:28806",
        game: ONE_PIECE_GAME,
        cardmarket_url: url,
      })
    ).toBe(
      "https://www.cardmarket.com/OnePiece/Products?idProduct=842904&language=1&minCondition=2"
    );
  });

  it("keeps canonical same-game singles URLs direct", () => {
    const url =
      "https://www.cardmarket.com/en/Pokemon/Products/Singles/Neo-Destiny/Shining-Charizard-N4";

    expect(getSafeDirectCardMarketCardUrl(url, POKEMON_GAME)).toBe(
      "https://www.cardmarket.com/en/Pokemon/Products/Singles/Neo-Destiny/Shining-Charizard-N4?language=1&minCondition=2"
    );
  });

  it("rejects direct URLs from another game", () => {
    const url = "https://www.cardmarket.com/en/OnePiece/Products/Singles/OP03/Issho-OP03-078";

    expect(getSafeDirectCardMarketCardUrl(url, POKEMON_GAME)).toBeNull();
    expect(getSafeDirectCardMarketCardUrl(url, ONE_PIECE_GAME)).toBe(
      "https://www.cardmarket.com/en/OnePiece/Products/Singles/OP03/Issho-OP03-078?language=1&minCondition=2"
    );
  });

  it("adds English NM filters to sealed product links", () => {
    expect(buildCardMarketSealedProductUrl("Mega Greninja ex Premium Collection")).toBe(
      "https://www.cardmarket.com/en/Pokemon/Products/Box-Sets/Mega-Greninja-ex-Premium-Collection"
    );
    expect(
      resolveCardMarketSealedProductUrl({
        name: "Mega Greninja ex Premium Collection",
        cardmarket_url: null,
      })
    ).toBe(
      "https://www.cardmarket.com/en/Pokemon/Products/Box-Sets/Mega-Greninja-ex-Premium-Collection?language=1&minCondition=2"
    );
  });
});
