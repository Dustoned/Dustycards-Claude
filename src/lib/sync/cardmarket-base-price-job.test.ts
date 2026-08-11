import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));

import {
  buildCardMarketBasePriceBacklogWhere,
  buildMergedCardMarketPriceData,
  cardMarketBasePriceIdentityMatches,
  excludeUnreleasedUpcomingCards,
} from "@/lib/sync/cardmarket-base-price-job";

describe("CardMarket base-price backlog", () => {
  it("selects released cards without valid CM English/NM even when another price row exists", () => {
    expect(
      buildCardMarketBasePriceBacklogWhere(new Date("2026-08-11T12:00:00.000Z"))
    ).toEqual({
      game: "pokemon",
      episode: { release_date: { not: null, lte: "2026-08-11" } },
      prices: {
        none: {
          cm_en_lowest_nm: { gt: 0, not: 9001 },
        },
      },
      AND: [
        {
          OR: [
            { price_source_status: null },
            { price_source_status: { not: "upcoming" } },
          ],
        },
      ],
    });
  });

  it("hard-excludes exact future cards even when their mutable status is stale", () => {
    const rows = [
      { id: "released", price_source_status: "unavailable" },
      { id: "future", price_source_status: "unavailable" },
    ];
    expect(excludeUnreleasedUpcomingCards(rows, new Set(["future"]))).toEqual([
      rows[0],
    ]);
  });
});

describe("CardMarket identity matching", () => {
  it("accepts the explicit HS Triumphant/CardMarket Triumphant alias", () => {
    expect(
      cardMarketBasePriceIdentityMatches({
        expectedName: "Ambipom",
        expectedSetName: "HS—Triumphant",
        expectedSetCode: "TM",
        expectedCardNumber: "13",
        observedName: "Ambipom",
        observedSetName: "Triumphant",
        observedCardNumber: "13",
        resolvedUrl:
          "https://www.cardmarket.com/en/Pokemon/Products/Singles/Triumphant/Ambipom-TM13",
      })
    ).toBe(true);
  });

  it("accepts only the red Plusle half of EX Trainer Kit 2", () => {
    const common = {
      expectedName: "Professor Cozmo's Discovery",
      expectedSetName: "EX Trainer Kit 2 Plusle",
      expectedCardNumber: "10",
      observedName: "Professor Cozmo's Discovery",
      observedSetName: "EX Trainer Kit 2",
      observedCardNumber: "P10",
    };
    expect(
      cardMarketBasePriceIdentityMatches({
        ...common,
        resolvedUrl:
          "https://www.cardmarket.com/en/Pokemon/Products/Singles/EX-Trainer-Kit-2/Professor-Cozmos-Discovery-TK2red-10",
      })
    ).toBe(true);
    expect(
      cardMarketBasePriceIdentityMatches({
        ...common,
        resolvedUrl:
          "https://www.cardmarket.com/en/Pokemon/Products/Singles/EX-Trainer-Kit-2/Professor-Cozmos-Discovery-TK2blue-10",
      })
    ).toBe(false);
  });

  it("accepts CardMarket's shorter Black Star Promo set names", () => {
    expect(
      cardMarketBasePriceIdentityMatches({
        expectedName: "Pheromosa-GX",
        expectedSetName: "SM Black Star Promos",
        expectedSetCode: "PR-SM",
        expectedCardNumber: "SM66",
        observedName: "Pheromosa-GX",
        observedSetName: "SM Promos",
        observedCardNumber: "SM66",
        resolvedUrl:
          "https://www.cardmarket.com/en/Pokemon/Products/Singles/SM-Promos/Pheromosa-GX-SM66",
      })
    ).toBe(true);
  });

  it("rejects a wrong stored product even when the URL is on CardMarket", () => {
    expect(
      cardMarketBasePriceIdentityMatches({
        expectedName: "Vulpix",
        expectedSetName: "HS—Unleashed",
        expectedSetCode: "UL",
        expectedCardNumber: "68",
        observedName: "Leblanc, Deceiver (V.2)",
        observedSetName: "Riftbound",
        observedCardNumber: "UNL",
        resolvedUrl:
          "https://www.cardmarket.com/Pokemon/Products?idProduct=884231",
      })
    ).toBe(false);
  });
});

describe("CardMarket snapshot merging", () => {
  it("writes a source-pure CardMarket observation", () => {
    const observedAt = new Date("2026-08-11T10:00:00.000Z");
    const data = buildMergedCardMarketPriceData({
      cardId: "card-1",
      priceEur: 7.25,
      sourceUrl: "https://www.cardmarket.com/example",
      observedAt,
    });
    expect(data).toMatchObject({
      card_id: "card-1",
      fetched_at: observedAt,
      source: "cardmarket_base_backfill",
      source_provider: "firecrawl",
      cm_en_lowest_nm: 7.25,
      tcp_market: null,
      cm_de_lowest_nm: null,
      cm_en_avg_7d: null,
    });
  });
});
