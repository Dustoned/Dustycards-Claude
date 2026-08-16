import { describe, expect, it } from "vitest";
import {
  getPopularPokemonGroupMatches,
  matchesPopularPokemonFilter,
  POPULAR_POKEMON_FILTER_OPTIONS,
} from "@/lib/popular-pokemon";

describe("popular Pokémon filters", () => {
  it("recognizes popular Pokémon inside modern, Mega and tag-team card names", () => {
    expect(matchesPopularPokemonFilter("M Charizard-EX", "charizard")).toBe(true);
    expect(matchesPopularPokemonFilter("Reshiram & Charizard-GX", "charizard")).toBe(true);
    expect(matchesPopularPokemonFilter("Mega Gengar ex", "popular")).toBe(true);
  });

  it("keeps Mew and Mewtwo exact without partial-word false positives", () => {
    expect(matchesPopularPokemonFilter("Mew ex", "mew-mewtwo")).toBe(true);
    expect(matchesPopularPokemonFilter("Mewtwo V-UNION", "mew-mewtwo")).toBe(true);
    expect(getPopularPokemonGroupMatches("Mewtwo V-UNION").map((group) => group.value)).toEqual([
      "mew-mewtwo",
    ]);
  });

  it("treats the Eevee family as one useful collector filter", () => {
    expect(matchesPopularPokemonFilter("Umbreon Gold Star", "eeveelutions")).toBe(true);
    expect(matchesPopularPokemonFilter("Sylveon & Gardevoir-GX", "eeveelutions")).toBe(true);
    expect(matchesPopularPokemonFilter("Sylveon & Gardevoir-GX", "gardevoir")).toBe(true);
  });

  it("does not turn unrelated high-rarity cards into popular Pokémon", () => {
    expect(matchesPopularPokemonFilter("Boss's Orders", "popular")).toBe(false);
    expect(matchesPopularPokemonFilter("Ampharos Prime", "popular")).toBe(false);
  });

  it("offers broad and specific choices without duplicate ids", () => {
    const values = POPULAR_POKEMON_FILTER_OPTIONS.map((option) => option.value);
    expect(values.slice(0, 2)).toEqual(["all", "popular"]);
    expect(new Set(values).size).toBe(values.length);
  });
});
