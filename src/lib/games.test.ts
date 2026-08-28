import { describe, expect, it } from "vitest";
import {
  getGameFromScopedId,
  getRemoteTcggoId,
  getTcggoGamePath,
  normalizeTradingCardGame,
  POKEMON_JAPANESE_GAME,
  scopeGameId,
} from "@/lib/games";

describe("Japanese Pokémon game identity", () => {
  it("keeps Japanese catalog IDs isolated from English Pokémon", () => {
    expect(scopeGameId(POKEMON_JAPANESE_GAME, 448)).toBe("pokemon-jp:448");
    expect(getGameFromScopedId("pokemon-jp:448")).toBe(POKEMON_JAPANESE_GAME);
    expect(getRemoteTcggoId(POKEMON_JAPANESE_GAME, "pokemon-jp:448")).toBe("448");
  });

  it("uses TCGGO's pokemon-jp endpoint without changing normal Pokémon defaults", () => {
    expect(normalizeTradingCardGame("pokemon-jp")).toBe(POKEMON_JAPANESE_GAME);
    expect(getTcggoGamePath(POKEMON_JAPANESE_GAME)).toBe("pokemon-jp");
    expect(normalizeTradingCardGame("unknown")).toBe("pokemon");
  });
});
