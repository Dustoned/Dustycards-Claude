import { describe, expect, it } from "vitest";
import {
  cardHasCharacter,
  getCardCharacterBySlug,
  getCardCharacters,
  getCharacterSearchCandidates,
} from "@/lib/card-characters-core";

function characterKeys(name: string, supertype = "Pokémon") {
  return getCardCharacters({ game: "pokemon", name, supertype }).map(
    ({ kind, slug }) => `${kind}:${slug}`
  );
}

describe("card character recognition", () => {
  it("recognizes the exact Pokémon on a regular card", () => {
    expect(characterKeys("Eevee")).toEqual(["pokemon:eevee"]);
  });

  it("keeps multiple Pokémon in printed title order", () => {
    expect(characterKeys("Eevee & Snorlax-GX")).toEqual([
      "pokemon:eevee",
      "pokemon:snorlax",
    ]);
  });

  it("adds the owning trainer beside their Pokémon", () => {
    expect(characterKeys("Cynthia's Gible")).toEqual([
      "pokemon:gible",
      "trainer:cynthia",
    ]);
  });

  it("does not confuse shorter names with another Pokémon", () => {
    expect(characterKeys("Mewtwo ex")).toEqual(["pokemon:mewtwo"]);
    expect(characterKeys("Porygon-Z")).toEqual(["pokemon:porygon-z"]);
  });

  it("handles punctuation that belongs to a Pokémon name", () => {
    expect(characterKeys("Farfetch’d")).toEqual(["pokemon:farfetchd"]);
  });

  it("recognizes trainers on Trainer cards without adding unrelated names", () => {
    expect(characterKeys("Cynthia's Ambition", "Trainer")).toEqual([
      "trainer:cynthia",
    ]);
  });

  it("only recognizes trainers through explicit title identities", () => {
    expect(characterKeys("Red Card", "Trainer")).toEqual([]);
    expect(characterKeys("Peeking Red Card", "Trainer")).toEqual([]);
    expect(characterKeys("Rose Tower", "Trainer")).toEqual([]);

    expect(characterKeys("Red's Challenge", "Trainer")).toEqual(["trainer:red"]);
    expect(characterKeys("Red & Blue", "Trainer")).toEqual([
      "trainer:red",
      "trainer:blue",
    ]);
    expect(characterKeys("Red and Blue", "Trainer")).toEqual([
      "trainer:red",
      "trainer:blue",
    ]);
    expect(characterKeys("Rose", "Trainer")).toEqual(["trainer:rose"]);
    expect(characterKeys("Boss's Orders (Giovanni)", "Trainer")).toEqual([
      "trainer:giovanni",
    ]);
  });

  it.each([
    ["Professor Sada’s Vitality", "trainer:professor-sada"],
    ["Professor's Research (Professor Turo)", "trainer:professor-turo"],
    ["Ace Trainer", "trainer:ace-trainer"],
    ["Green's Exploration", "trainer:green"],
    ["Daisy's Help", "trainer:daisy"],
    ["Professor's Research (Professor Magnolia)", "trainer:professor-magnolia"],
    ["Professor's Research (Professor Laventon)", "trainer:professor-laventon"],
    ["Bebe's Search", "trainer:bebe"],
    ["Lanette's Net Search", "trainer:lanette"],
    ["Roseanne's Backup", "trainer:roseanne"],
  ])("covers the local trainer catalog for %s", (cardName, expected) => {
    expect(characterKeys(cardName, "Trainer")).toContain(expected);
  });

  it("keeps the character route filter exact", () => {
    const mew = getCardCharacterBySlug("pokemon", "mew");
    const red = getCardCharacterBySlug("trainer", "red");
    expect(mew).not.toBeNull();
    expect(red).not.toBeNull();
    expect(
      cardHasCharacter(
        { game: "pokemon", name: "Mewtwo ex", supertype: "Pokémon" },
        mew!
      )
    ).toBe(false);
    expect(
      cardHasCharacter(
        { game: "pokemon", name: "Peeking Red Card", supertype: "Trainer" },
        red!
      )
    ).toBe(false);
  });

  it("does not add Pokémon metadata to another game", () => {
    expect(
      getCardCharacters({ game: "one-piece", name: "Eevee", supertype: null })
    ).toEqual([]);
  });

  it("carries the source rendering mode into character results", () => {
    expect(getCardCharacterBySlug("pokemon", "eevee")?.pixelArt).toBe(true);
    expect(getCardCharacterBySlug("trainer", "red")?.pixelArt).toBe(true);
    expect(getCardCharacterBySlug("trainer", "rose")?.pixelArt).toBe(false);
  });

  it("uses bounded trainer queries even for one-letter names", () => {
    const n = getCardCharacterBySlug("trainer", "n");
    expect(n).not.toBeNull();

    const candidates = getCharacterSearchCandidates(n!);
    expect(candidates).toContainEqual({ match: "equals", value: "N" });
    expect(candidates).toContainEqual({ match: "startsWith", value: "N's" });
    expect(candidates).not.toContainEqual({ match: "contains", value: "N" });
  });
});
