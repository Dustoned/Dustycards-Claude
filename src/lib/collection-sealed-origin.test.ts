import { describe, expect, it } from "vitest";
import {
  getSealedOriginMarketPrice,
  rankSealedOriginAutocompleteOptions,
  sealedOriginMatchesAllCards,
  sealedOriginMatchesCard,
} from "@/lib/collection-sealed-origin";

const autocompleteOptions = [
  {
    id: "etb",
    name: "Prismatic Evolutions Elite Trainer Box",
    owned: false,
    matches_cards: true,
    episode: { name: "Prismatic Evolutions", code: "PRE" },
  },
  {
    id: "poster",
    name: "Prismatic Evolutions Poster Collection",
    owned: true,
    matches_cards: true,
    episode: { name: "Prismatic Evolutions", code: "PRE" },
  },
  {
    id: "pc-etb",
    name: "Prismatic Evolutions Pokémon Center Elite Trainer Box",
    owned: false,
    matches_cards: true,
    episode: { name: "Prismatic Evolutions", code: "PRE" },
  },
];

const product = {
  id: "box-1",
  game: "pokemon",
  episode_id: "sv-main",
  contentSets: [{ episode_id: "sv-subset" }],
  includedCards: [{ card_id: "promo-1" }],
};

describe("rankSealedOriginAutocompleteOptions", () => {
  it("returns every option and prefers owned products without a query", () => {
    expect(rankSealedOriginAutocompleteOptions(autocompleteOptions, "").map(({ id }) => id))
      .toEqual(["poster", "etb", "pc-etb"]);
  });

  it("keeps the closest product-name match ahead of ownership", () => {
    expect(rankSealedOriginAutocompleteOptions(autocompleteOptions, "elite trainer").map(({ id }) => id))
      .toEqual(["etb", "pc-etb"]);
  });

  it("matches common sealed-product acronyms", () => {
    expect(rankSealedOriginAutocompleteOptions(autocompleteOptions, "etb").map(({ id }) => id))
      .toEqual(["etb", "pc-etb"]);
  });

  it("lets a direct manual fallback outrank a less relevant known product", () => {
    const options = [
      ...autocompleteOptions,
      {
        id: "manual-box",
        name: "Mega Lucario ex Box",
        owned: false,
        matches_cards: false,
        episode: { name: "Mega Evolution", code: "MEG" },
      },
    ];

    expect(rankSealedOriginAutocompleteOptions(options, "mega lucario")[0]?.id)
      .toBe("manual-box");
  });
});

describe("collection sealed origins", () => {
  it("matches a product's own set, content sets and explicitly included promos", () => {
    expect(
      sealedOriginMatchesCard(product, {
        id: "card-1",
        game: "pokemon",
        episode_id: "sv-main",
      })
    ).toBe(true);
    expect(
      sealedOriginMatchesCard(product, {
        id: "card-2",
        game: "pokemon",
        episode_id: "sv-subset",
      })
    ).toBe(true);
    expect(
      sealedOriginMatchesCard(product, {
        id: "promo-1",
        game: "pokemon",
        episode_id: "promos",
      })
    ).toBe(true);
  });

  it("rejects another game and requires a bulk origin to match every card", () => {
    expect(
      sealedOriginMatchesCard(product, {
        id: "card-1",
        game: "one-piece",
        episode_id: "sv-main",
      })
    ).toBe(false);
    expect(
      sealedOriginMatchesAllCards(product, [
        { id: "card-1", game: "pokemon", episode_id: "sv-main" },
        { id: "card-3", game: "pokemon", episode_id: "another-set" },
      ])
    ).toBe(false);
  });

  it("prefers the EU reference and falls back through saved market fields", () => {
    expect(
      getSealedOriginMarketPrice({
        cm_lowest: 101,
        cm_lowest_eu: 99,
        cm_lowest_de: 98,
        cm_lowest_fr: null,
        cm_lowest_es: null,
        cm_lowest_it: null,
        cm_avg_7d: 102,
        cm_avg_30d: 104,
      })
    ).toBe(99);
    expect(
      getSealedOriginMarketPrice({
        cm_lowest: 101,
        cm_lowest_eu: 0,
        cm_lowest_de: null,
        cm_lowest_fr: null,
        cm_lowest_es: null,
        cm_lowest_it: null,
        cm_avg_7d: 102,
        cm_avg_30d: 104,
      })
    ).toBe(101);
  });
});
