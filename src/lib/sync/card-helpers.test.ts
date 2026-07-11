import { beforeEach, describe, expect, it, vi } from "vitest";

const tcgdexMock = vi.hoisted(() => ({
  categoryToSupertype: vi.fn(),
  findTcgdexSetIdForEpisode: vi.fn(),
  getTcgdexIllustratorLookupForCards: vi.fn(),
  getTcgdexSupertypeLookupForSet: vi.fn(),
}));

vi.mock("@/lib/tcgdex", () => tcgdexMock);

import {
  buildCardWriteData,
  loadEpisodeCardEnrichmentLookups,
  planPriceSnapshotWrite,
  type CardWriteData,
  type ExistingPriceRecord,
  type PriceSnapshotData,
} from "@/lib/sync/card-helpers";

function makeCard(overrides: Partial<CardWriteData> = {}): CardWriteData {
  return {
    game: "pokemon",
    name: "Test Card",
    card_number: "001",
    rarity: "Rare",
    hp: null,
    supertype: "Pokemon",
    subtypes: null,
    artist: null,
    image_url: null,
    tcggo_url: null,
    cardmarket_url: null,
    tcgid: null,
    cardmarket_id: null,
    tcgplayer_id: null,
    tcggo_score: null,
    tcggo_score_tier: null,
    tcggo_score_momentum: null,
    tcggo_score_stability: null,
    tcggo_score_liquidity: null,
    tcggo_score_demand: null,
    tcggo_score_market_depth: null,
    tcggo_score_grade_premium: null,
    tcggo_score_rsi: null,
    tcggo_score_ath: null,
    tcggo_score_atl: null,
    tcggo_score_updated_at: null,
    ...overrides,
  };
}

function makePrice(overrides: Partial<PriceSnapshotData> = {}): PriceSnapshotData {
  return {
    cm_en_lowest_nm: null,
    cm_de_lowest_nm: null,
    cm_fr_lowest_nm: null,
    cm_es_lowest_nm: null,
    cm_it_lowest_nm: null,
    cm_jp_lowest_nm: null,
    cm_en_avg_30d: null,
    cm_en_avg_7d: null,
    tcp_market: null,
    tcp_mid: null,
    tcp_low: null,
    ...overrides,
  };
}

describe("loadEpisodeCardEnrichmentLookups", () => {
  beforeEach(() => {
    tcgdexMock.categoryToSupertype.mockReset();
    tcgdexMock.findTcgdexSetIdForEpisode.mockReset();
    tcgdexMock.getTcgdexIllustratorLookupForCards.mockReset();
    tcgdexMock.getTcgdexSupertypeLookupForSet.mockReset();
  });

  it("falls back to an empty illustrator lookup when TCGdex enrichment fails", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    tcgdexMock.findTcgdexSetIdForEpisode.mockResolvedValue("sv1");
    tcgdexMock.getTcgdexSupertypeLookupForSet.mockResolvedValue(
      new Map([["card-1", "Pokemon"]])
    );
    tcgdexMock.getTcgdexIllustratorLookupForCards.mockRejectedValue(
      new Error("TCGdex timeout")
    );

    const result = await loadEpisodeCardEnrichmentLookups(
      {
        code: "sv1",
        name: "Scarlet & Violet",
        card_count: 198,
      },
      [
        {
          id: "card-1",
          name: "Pikachu",
          card_number: "25",
          tcgid: "sv1-25",
          artist: null,
        },
      ]
    );

    expect(result.tcgdexSupertypeLookup.get("card-1")).toBe("Pokemon");
    expect(result.tcgdexIllustratorLookup.size).toBe(0);
    expect(tcgdexMock.getTcgdexIllustratorLookupForCards).toHaveBeenCalledOnce();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to load TCGdex illustrator lookup for Scarlet & Violet",
      expect.any(Error)
    );
  });
});

describe("buildCardWriteData", () => {
  beforeEach(() => {
    tcgdexMock.categoryToSupertype.mockImplementation((value: string | null) => value);
  });

  it("preserves enriched One Piece variant rarities during base syncs", () => {
    const existing = makeCard({
      game: "one-piece",
      rarity: "Manga Rare",
      supertype: "Character",
    });
    const incoming = makeCard({
      game: "one-piece",
      rarity: "SECRET RARE",
      supertype: "Character",
    });

    expect(buildCardWriteData(existing, incoming).rarity).toBe("Manga Rare");
  });

  it("allows One Piece variant rarity updates when the incoming rarity is also enriched", () => {
    const existing = makeCard({
      game: "one-piece",
      rarity: "Alternate Art",
      supertype: "Character",
    });
    const incoming = makeCard({
      game: "one-piece",
      rarity: "Special Rare",
      supertype: "Character",
    });

    expect(buildCardWriteData(existing, incoming).rarity).toBe("Special Rare");
  });
});

describe("planPriceSnapshotWrite", () => {
  it("refreshes an unchanged snapshot without recording a duplicate", () => {
    const nextPrice = makePrice({ cm_en_lowest_nm: 125 });
    const latestPrice: ExistingPriceRecord = { id: "price-1", ...nextPrice };

    expect(planPriceSnapshotWrite(latestPrice, nextPrice, true)).toEqual({
      mode: "refreshed",
      recordSnapshot: false,
      refreshExistingSnapshot: true,
    });
  });

  it("does not add duplicate observations during catalog-only syncs", () => {
    const nextPrice = makePrice({ tcp_market: 80 });
    const latestPrice: ExistingPriceRecord = { id: "price-1", ...nextPrice };

    expect(planPriceSnapshotWrite(latestPrice, nextPrice, false)).toEqual({
      mode: "none",
      recordSnapshot: false,
      refreshExistingSnapshot: false,
    });
  });

  it("records a changed marketplace value", () => {
    const latestPrice: ExistingPriceRecord = {
      id: "price-1",
      ...makePrice({ cm_en_lowest_nm: 125 }),
    };

    expect(
      planPriceSnapshotWrite(latestPrice, makePrice({ cm_en_lowest_nm: 80 }), true)
    ).toEqual({
      mode: "new",
      recordSnapshot: true,
      refreshExistingSnapshot: false,
    });
  });
});
