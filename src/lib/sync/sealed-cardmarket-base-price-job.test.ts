import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));

import {
  buildSealedCardMarketBasePriceBacklogWhere,
  buildSealedCardMarketSnapshotData,
  isVisibleSealedCardMarketEpisode,
  normalizeSealedCardMarketProductName,
  parseSealedCardMarketOfferTable,
  resolveSealedCardMarketExactSourceUrl,
  sealedCardMarketProductIdentityMatches,
} from "@/lib/sync/sealed-cardmarket-base-price-job";

describe("sealed CardMarket base-price backlog", () => {
  it("selects released Pokemon products with no current price and an exact source", () => {
    const now = new Date("2026-08-11T12:00:00.000Z");
    expect(buildSealedCardMarketBasePriceBacklogWhere(now)).toMatchObject({
      game: "pokemon",
      episode: { release_date: { not: null, lte: "2026-08-11" } },
      OR: [
        { cardmarket_id: { not: null } },
        { cardmarket_url: { startsWith: "https://www.cardmarket.com/" } },
      ],
    });
    const where = buildSealedCardMarketBasePriceBacklogWhere(now);
    const andConditions = Array.isArray(where.AND)
      ? where.AND
      : where.AND
        ? [where.AND]
        : [];
    expect(andConditions).toHaveLength(7);
    expect(andConditions[0]).toEqual({
      OR: [{ release_date: null }, { release_date: { lte: now } }],
    });
  });

  it("filters expansions hidden elsewhere in the app", () => {
    expect(
      isVisibleSealedCardMarketEpisode({
        id: "20",
        name: "A visible-looking name",
        code: "ABC",
      })
    ).toBe(false);
    expect(
      isVisibleSealedCardMarketEpisode({
        id: "415",
        name: "Pitch Black",
        code: "PBL",
      })
    ).toBe(true);
  });
});

describe("sealed CardMarket exact URL resolution", () => {
  it("prefers the direct idProduct URL and applies English filters", () => {
    expect(
      resolveSealedCardMarketExactSourceUrl({
        cardmarketId: "798923",
        cardmarketUrl:
          "https://www.cardmarket.com/en/Pokemon/Products/Boosters/Wrong-Product",
      })
    ).toBe(
      "https://www.cardmarket.com/Pokemon/Products?idProduct=798923&language=1&minCondition=2"
    );
  });

  it("uses a stored direct product URL but never guesses from a TCGGO redirect", () => {
    expect(
      resolveSealedCardMarketExactSourceUrl({
        cardmarketId: null,
        cardmarketUrl:
          "https://www.cardmarket.com/en/Pokemon/Products/Box-Sets/Latias-ex-Special-Collection",
      })
    ).toBe(
      "https://www.cardmarket.com/en/Pokemon/Products/Box-Sets/Latias-ex-Special-Collection?language=1&minCondition=2"
    );
    expect(
      resolveSealedCardMarketExactSourceUrl({
        cardmarketId: null,
        cardmarketUrl: "https://www.tcggo.com/external/cm/48623",
      })
    ).toBeNull();
    expect(
      resolveSealedCardMarketExactSourceUrl({
        cardmarketId: null,
        cardmarketUrl: "https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=Latias",
      })
    ).toBeNull();
  });
});

describe("sealed CardMarket identity", () => {
  it("normalizes punctuation, accents and ampersands but remains exact", () => {
    expect(normalizeSealedCardMarketProductName("Pokémon: Ho-Oh & Lugia")).toBe(
      "pokemon ho oh and lugia"
    );
    expect(
      sealedCardMarketProductIdentityMatches({
        expectedName: "Gym Heroes: Brock Theme Deck",
        observedTitle: "Gym Heroes - Brock Theme Deck | Cardmarket",
      })
    ).toBe(true);
    expect(
      sealedCardMarketProductIdentityMatches({
        expectedName: "Gym Heroes: Brock Theme Deck",
        observedTitle: "Gym Heroes: Misty Theme Deck | Cardmarket",
      })
    ).toBe(false);
    expect(
      sealedCardMarketProductIdentityMatches({
        expectedName: "Latias ex Special Collection",
        observedTitle: "Latias ex Special Collection (US Version) | Cardmarket",
      })
    ).toBe(false);
  });
});

describe("sealed CardMarket offer parser", () => {
  it("reads one price per sealed article row and selects the minimum", () => {
    const html = `
      <div class="table article-table table-striped"><div class="table-body">
        <div id="articleRow1" class="row article-row">
          <span class="color-primary small text-end text-nowrap fw-bold">14,43 €</span>
          <span class="color-primary small text-end text-nowrap fw-bold">14,43 €</span>
        </div>
        <div id="articleRow2" class="row article-row">
          <span class="color-primary small text-end text-nowrap fw-bold">1.025,00 €</span>
        </div>
        <div id="articleRow3" class="row article-row">
          <span class="color-primary small text-end text-nowrap fw-bold">13,10 €</span>
        </div>
      </div><div class="table-footer"></div></div>`;
    expect(parseSealedCardMarketOfferTable({ html, markdown: "" })).toEqual({
      priceEur: 13.1,
      offerCount: 3,
      articleRowCount: 3,
      explicitNoOffers: false,
    });
  });

  it("recognizes only the explicit fully-rendered CardMarket no-offer marker", () => {
    const html = `
      <div class="table article-table table-striped"><div class="table-body">
        <p class="noResults text-center h3 text-muted py-5">
          Currently there are no available offers for this article.
        </p>
      </div><div class="table-footer"></div></div>`;
    expect(parseSealedCardMarketOfferTable({ html, markdown: "" })).toEqual({
      priceEur: null,
      offerCount: 0,
      articleRowCount: 0,
      explicitNoOffers: true,
    });
    expect(
      parseSealedCardMarketOfferTable({
        html: "<html><main>Cardmarket temporarily unavailable</main></html>",
        markdown: "Cardmarket temporarily unavailable",
      }).explicitNoOffers
    ).toBe(false);
  });

  it("does not mistake a rendered but unreadable article row for no offers", () => {
    expect(
      parseSealedCardMarketOfferTable({
        html: '<div class="article-table"><div id="articleRow1">unknown text</div></div>',
        markdown: "",
      })
    ).toEqual({
      priceEur: null,
      offerCount: 0,
      articleRowCount: 1,
      explicitNoOffers: false,
    });
  });
});

describe("sealed CardMarket snapshots", () => {
  it("records only the observed English current offer and invents no regional data", () => {
    const observedAt = new Date("2026-08-11T10:00:00.000Z");
    expect(
      buildSealedCardMarketSnapshotData({
        productId: "21576",
        episodeId: "170",
        priceEur: 13.1,
        observedAt,
      })
    ).toEqual({
      product_id: "21576",
      episode_id: "170",
      fetched_at: observedAt,
      cm_lowest: 13.1,
      cm_lowest_eu: null,
      cm_lowest_de: null,
      cm_lowest_fr: null,
      cm_lowest_es: null,
      cm_lowest_it: null,
      cm_avg_7d: null,
      cm_avg_30d: null,
    });
  });
});
