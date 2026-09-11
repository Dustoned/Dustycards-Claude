import { describe, expect, it } from "vitest";
import {
  ONE_PIECE_DON_CARD_BACK_URL,
  ONE_PIECE_LEADER_CARD_BACK_URL,
  ONE_PIECE_STANDARD_CARD_BACK_URL,
  POKEMON_CARD_BACK_URL,
  POKEMON_JAPANESE_CARD_BACK_URL,
  getCardBackTextureUrl,
} from "@/lib/card-back-texture";

describe("getCardBackTextureUrl", () => {
  it("keeps the existing Pokemon back", () => {
    expect(getCardBackTextureUrl({ game: "pokemon", supertype: "Pokémon" })).toBe(
      POKEMON_CARD_BACK_URL
    );
  });

  it("uses the Japanese Pokemon back for the Japanese catalog", () => {
    expect(getCardBackTextureUrl({ game: "pokemon-jp", supertype: "Pokémon" })).toBe(
      POKEMON_JAPANESE_CARD_BACK_URL
    );
  });

  it("uses the red One Piece back for leaders", () => {
    expect(getCardBackTextureUrl({ game: "one-piece", supertype: "Leader" })).toBe(
      ONE_PIECE_LEADER_CARD_BACK_URL
    );
    expect(getCardBackTextureUrl({ game: "one-piece", rarity: "Leader" })).toBe(
      ONE_PIECE_LEADER_CARD_BACK_URL
    );
  });

  it("uses the white One Piece back for DON cards", () => {
    expect(getCardBackTextureUrl({ game: "one-piece", name: "DON!!" })).toBe(
      ONE_PIECE_DON_CARD_BACK_URL
    );
    expect(getCardBackTextureUrl({ game: "one-piece", rarity: "DON!!" })).toBe(
      ONE_PIECE_DON_CARD_BACK_URL
    );
  });

  it("uses the blue One Piece back for main-deck cards", () => {
    for (const supertype of ["Character", "Event", "Stage", null]) {
      expect(getCardBackTextureUrl({ game: "one-piece", supertype })).toBe(
        ONE_PIECE_STANDARD_CARD_BACK_URL
      );
    }
  });
});
