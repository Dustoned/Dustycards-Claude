import { describe, expect, it } from "vitest";
import {
  HOME_FEATURED_CARD_LIMIT,
  HOME_VALUE_DRIVER_LANE_LIMIT,
  getHomeFeaturedCards,
  getHomeValueDriversPreview,
} from "@/lib/home-page-payload";
import type {
  CollectionValueDriverItem,
  CollectionValueDriversData,
} from "@/lib/collection-data";
import type { CollectionCardViewItem } from "@/types/collection-view";

function card(index: number): CollectionCardViewItem {
  return {
    collection_item_id: `owned-${index}`,
    collection_item_ids: [`owned-${index}`],
    binder_id: null,
    card_id: `card-${index}`,
    name: `Card ${index}`,
    image_url: null,
    card_number: String(index),
    rarity: null,
    supertype: null,
    episode_id: "episode",
    episode_name: "Episode",
    episode_code: "SET",
    cm_value: index,
    tcp_value: null,
    current_value: index,
    current_value_label: null,
    purchase_price: null,
    cost_basis_value: null,
    cost_basis_label: "Paid",
    cost_basis_source: "direct",
    condition: null,
    language: null,
    notes: null,
    tags: [],
    grading_company: null,
    grading_grade: null,
    grading_subgrades: null,
    owned: true,
    owned_count: 1,
  };
}

function driver(index: number, change: number): CollectionValueDriverItem {
  return {
    id: `driver-${index}`,
    kind: "card",
    cardId: `card-${index}`,
    productId: null,
    cardNumber: String(index),
    episodeId: "episode",
    episodeName: "Episode",
    episodeCode: "SET",
    name: `Card ${index}`,
    imageUrl: null,
    href: `/cards/${index}`,
    detail: "Raw",
    quantity: 1,
    previousValue: 10,
    currentValue: 10 + change,
    change,
    changePct: change * 10,
    currentSource: "CardMarket",
    previousSource: "CardMarket",
    latestSnapshotDate: "2026-07-20",
    stale: false,
  };
}

describe("home page payload", () => {
  it("keeps six driver rows per lane to match the sudden-drops panel", () => {
    expect(HOME_VALUE_DRIVER_LANE_LIMIT).toBe(6);
  });

  it("keeps only the cards that can appear in the home rail", () => {
    const cards = Array.from({ length: 60 }, (_, index) => card(index + 1));
    const result = getHomeFeaturedCards(cards);

    expect(result).toHaveLength(HOME_FEATURED_CARD_LIMIT);
    expect(result[0]?.current_value).toBe(60);
    expect(result.at(-1)?.current_value).toBe(13);
    expect(cards).toHaveLength(60);
  });

  it("removes hidden driver rows without changing portfolio totals", () => {
    const data: CollectionValueDriversData = {
      latestDate: "2026-07-20",
      latestLabel: "Jul 20",
      previousDate: "2026-07-13",
      previousLabel: "Jul 13",
      totalChange: 42,
      gainsTotal: 50,
      dropsTotal: -8,
      sourceBreakdown: [{ source: "CardMarket", change: 42 }],
      gains: Array.from({ length: 12 }, (_, index) => driver(index, 12 - index)),
      drops: Array.from({ length: 9 }, (_, index) => driver(index + 20, -(index + 1))),
    };

    const result = getHomeValueDriversPreview(data);

    expect(result.gains).toHaveLength(HOME_VALUE_DRIVER_LANE_LIMIT);
    expect(result.drops).toHaveLength(HOME_VALUE_DRIVER_LANE_LIMIT);
    expect(result.totalChange).toBe(data.totalChange);
    expect(result.sourceBreakdown).toBe(data.sourceBreakdown);
    expect(data.gains).toHaveLength(12);
    expect(data.drops).toHaveLength(9);
  });
});
