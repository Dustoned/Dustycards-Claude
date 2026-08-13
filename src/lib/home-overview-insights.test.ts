import { describe, expect, it } from "vitest";
import type { CollectionOverviewData } from "@/lib/collection-data";
import { buildForSalePreview, buildHomeOverviewInsights } from "@/lib/home-overview-insights";
import type { UpcomingSingleItem } from "@/lib/upcoming-releases";
import type { UpcomingSealedRelease } from "@/lib/sealed-movers";

const EMPTY_DRIVERS: CollectionOverviewData["valueDrivers"] = {
  latestDate: null,
  latestLabel: null,
  previousDate: null,
  previousLabel: null,
  totalChange: null,
  gainsTotal: 0,
  dropsTotal: 0,
  sourceBreakdown: [],
  gains: [],
  drops: [],
};

function upcomingSingle(set: string, number: number, releaseDate: string): UpcomingSingleItem {
  return {
    id: `${set}:${number}`,
    cardId: `${set.toLowerCase().replaceAll(" ", "-")}-${number}`,
    name: `${set} Card ${number}`,
    imageUrl: `https://example.com/${set}/${number}.webp`,
    cardNumber: String(number).padStart(3, "0"),
    rarity: "Rare",
    version: null,
    episodeId: null,
    episodeName: set,
    episodeCode: set.slice(0, 3).toUpperCase(),
    releaseDate,
    status: "reveal",
    headline: null,
    sourceName: "Test source",
    sourceUrl: "https://example.com/source",
    observedAt: null,
  };
}

describe("buildHomeOverviewInsights", () => {
  it("returns compact allocation totals without needing every card on the Home document", () => {
    const rawLoose = {
      current_value: 12.5,
      grading_company: null,
      grading_grade: null,
    } as CollectionOverviewData["cards"][number];
    const rawBinder = {
      current_value: 20,
      grading_company: null,
      grading_grade: null,
    } as CollectionOverviewData["cards"][number];
    const gradedBinder = {
      current_value: 70,
      grading_company: "PSA",
      grading_grade: "10",
    } as CollectionOverviewData["cards"][number];
    const data = {
      cards: [rawLoose, rawBinder, gradedBinder],
      looseSingles: [rawLoose],
      binderCards: [rawBinder, gradedBinder],
      sealed: [{ quantity: 2, current_value_per_item: 30 }],
      valueDrivers: EMPTY_DRIVERS,
    } as CollectionOverviewData;

    const result = buildHomeOverviewInsights(data);

    expect(result.allocation).toEqual([
      expect.objectContaining({ key: "loose-raw", itemCount: 1, value: 12.5 }),
      expect.objectContaining({ key: "binder-raw", itemCount: 1, value: 20 }),
      expect.objectContaining({ key: "graded", itemCount: 1, value: 70 }),
      expect.objectContaining({ key: "sealed", itemCount: 2, value: 60 }),
    ]);
  });

  it("keeps asking value separate from the selected-source market value", () => {
    const data = {
      forSaleCards: [
        { sale_price: 120, current_value: 100, cm_value: 95, tcp_value_eur: 110 },
        { sale_price: null, current_value: 40, cm_value: 38, tcp_value_eur: 45 },
      ],
    } as CollectionOverviewData;

    expect(buildForSalePreview(data, "cm_en")).toMatchObject({
      total: 2,
      totalValue: 160,
      marketValue: 133,
    });
    expect(buildForSalePreview(data, "tcp")).toMatchObject({
      totalValue: 160,
      marketValue: 155,
    });
  });

  it("groups upcoming singles before limiting previews so one large set cannot hide the rest", () => {
    const data = {
      cards: [],
      looseSingles: [],
      binderCards: [],
      sealed: [],
      valueDrivers: EMPTY_DRIVERS,
    } as unknown as CollectionOverviewData;
    const largeSet = Array.from({ length: 30 }, (_, index) =>
      upcomingSingle("Set Alpha", index + 1, "2026-12-01")
    );
    const otherSets = [
      upcomingSingle("Set Beta", 1, "2026-11-20"),
      upcomingSingle("Set Gamma", 1, "2026-11-10"),
      upcomingSingle("Set Delta", 1, "2026-11-01"),
      upcomingSingle("Set Epsilon", 1, "2026-10-20"),
    ];

    const result = buildHomeOverviewInsights(data, {
      upcomingSingles: [...largeSet, ...otherSets],
    });

    expect(result.upcomingSingleGroups.map((group) => group.name)).toEqual([
      "Set Alpha",
      "Set Beta",
      "Set Gamma",
      "Set Delta",
    ]);
    expect(result.upcomingSingleGroups[0]).toMatchObject({ total: 30 });
    expect(result.upcomingSingleGroups[0].items).toHaveLength(24);
    expect(result.upcomingSingles).toHaveLength(27);
    expect(result.upcomingSinglesTotal).toBe(34);
  });

  it("keeps exact sealed product identity for Home detail opening", () => {
    const data = {
      cards: [], looseSingles: [], binderCards: [], sealed: [], valueDrivers: EMPTY_DRIVERS,
    } as unknown as CollectionOverviewData;
    const upcoming = {
      id: "release-1",
      kind: "product",
      name: "Future Booster Box",
      imageUrl: "https://example.com/box.webp",
      releaseDate: "2026-11-20T00:00:00.000Z",
      daysUntil: 100,
      daysSinceRelease: null,
      sourceName: "Pokemon",
      sourceUrl: "https://example.com/release",
      confidence: 1,
      productId: "sealed-product-1",
      episodeId: "episode-1",
      episodeName: "Future Set",
      episodeCode: "FUT",
    } satisfies UpcomingSealedRelease;

    expect(buildHomeOverviewInsights(data, { upcoming: [upcoming] }).upcoming[0]).toMatchObject({
      productId: "sealed-product-1",
      episodeId: "episode-1",
      sourceName: "Pokemon",
      sourceUrl: "https://example.com/release",
    });
  });

  it("does not invent an overview or non-existent card route for an unresolved single", () => {
    const data = {
      cards: [], looseSingles: [], binderCards: [], sealed: [], valueDrivers: EMPTY_DRIVERS,
    } as unknown as CollectionOverviewData;
    const unresolved = upcomingSingle("Unresolved Set", 1, "2026-12-01");
    unresolved.cardId = null;
    unresolved.episodeId = null;
    unresolved.sourceUrl = null;

    const item = buildHomeOverviewInsights(data, { upcomingSingles: [unresolved] }).upcomingSingles[0];
    expect(item.cardId).toBeNull();
    expect(item.imageUrl).toContain("Unresolved Set");
  });
});
