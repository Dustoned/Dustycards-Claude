import { describe, expect, it } from "vitest";
import {
  getOpeningSealedPoolPolicy,
  getSealedOriginMarketPrice,
  openingSealedProductMatchesCard,
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

  it("combines set codes with sealed-product shorthand", () => {
    expect(rankSealedOriginAutocompleteOptions(autocompleteOptions, "PRE PC ETB").map(({ id }) => id))
      .toEqual(["pc-etb"]);
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
        cm_lowest_eu: 9001,
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

describe("opening sealed card pools", () => {
  it("restricts products whose own name identifies the expansion", () => {
    const namedProduct = {
      ...product,
      name: "Pitch Black Elite Trainer Box",
      episode: { name: "Pitch Black", code: "PBL" },
      episode_id: "pitch-black",
      contentSets: [],
    };

    expect(getOpeningSealedPoolPolicy(namedProduct)).toMatchObject({
      strict: true,
      reason: "named-expansion",
      episodeIds: ["pitch-black"],
    });
    expect(
      openingSealedProductMatchesCard(namedProduct, {
        id: "pbl-1",
        game: "pokemon",
        episode_id: "pitch-black",
      })
    ).toBe(true);
    expect(
      openingSealedProductMatchesCard(namedProduct, {
        id: "other-1",
        game: "pokemon",
        episode_id: "other-set",
      })
    ).toBe(false);
  });

  it("keeps random boxes broad when their pack contents are unknown", () => {
    const randomBox = {
      ...product,
      name: "Mega Lucario ex Box",
      episode: { name: "Mega Evolution", code: "MEG" },
      episode_id: "mega-evolution",
      contentSets: [],
      includedCards: [],
    };

    expect(getOpeningSealedPoolPolicy(randomBox)).toEqual({
      strict: false,
      reason: "unknown-pack-contents",
      episodeIds: [],
      includedCardIds: [],
    });
    expect(
      openingSealedProductMatchesCard(randomBox, {
        id: "different-set-card",
        game: "pokemon",
        episode_id: "different-set",
      })
    ).toBe(true);
    expect(
      openingSealedProductMatchesCard(randomBox, {
        id: "one-piece-card",
        game: "one-piece",
        episode_id: "op-set",
      })
    ).toBe(false);
  });

  it("uses explicitly mapped pack sets without assuming the catalogue episode", () => {
    const mappedBox = {
      ...product,
      name: "Mega Lucario ex Box",
      episode: { name: "Mega Evolution", code: "MEG" },
      episode_id: "catalogue-era",
      contentSets: [{ episode_id: "pack-set-a" }, { episode_id: "pack-set-b" }],
      includedCards: [{ card_id: "box-promo" }],
    };

    expect(getOpeningSealedPoolPolicy(mappedBox)).toEqual({
      strict: true,
      reason: "declared-content-sets",
      episodeIds: ["pack-set-a", "pack-set-b"],
      includedCardIds: ["box-promo"],
    });
    expect(
      openingSealedProductMatchesCard(mappedBox, {
        id: "catalogue-card",
        game: "pokemon",
        episode_id: "catalogue-era",
      })
    ).toBe(false);
    expect(
      openingSealedProductMatchesCard(mappedBox, {
        id: "box-promo",
        game: "pokemon",
        episode_id: "promo-era",
      })
    ).toBe(true);
  });
});
