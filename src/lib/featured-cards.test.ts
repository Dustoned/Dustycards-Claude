import { describe, expect, it } from "vitest";
import { getFeaturedCollectionCards } from "@/lib/featured-cards";
import type { CollectionCardViewItem } from "@/types/collection-view";

function makeCard(
  id: string,
  currentValue: number | null
): CollectionCardViewItem {
  return {
    collection_item_id: id,
    card_id: id,
    name: id,
    image_url: null,
    card_number: null,
    rarity: null,
    supertype: null,
    episode_id: "set-1",
    episode_name: "Set",
    episode_code: null,
    current_value: currentValue,
    purchase_price: null,
    cost_basis_value: null,
    cost_basis_label: "Paid",
    cost_basis_source: "direct",
    condition: null,
    grading_company: null,
    grading_grade: null,
    owned: true,
  };
}

describe("getFeaturedCollectionCards", () => {
  it("matches the home featured cards ranking", () => {
    const cards = [
      makeCard("no-price", null),
      makeCard("low", 12),
      makeCard("zero", 0),
      makeCard("high", 120),
      makeCard("mid", 55),
    ];

    expect(getFeaturedCollectionCards(cards).map((card) => card.card_id)).toEqual([
      "high",
      "mid",
      "low",
    ]);
  });

  it("respects a display pool limit", () => {
    const cards = [makeCard("first", 30), makeCard("second", 20), makeCard("third", 10)];

    expect(getFeaturedCollectionCards(cards, 2).map((card) => card.card_id)).toEqual([
      "first",
      "second",
    ]);
  });
});
