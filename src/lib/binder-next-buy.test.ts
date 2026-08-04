import { describe, expect, it } from "vitest";
import { buildBinderNextBuyRecommendations } from "@/lib/binder-next-buy";
import type { CollectionCardViewItem } from "@/types/collection-view";

function item(
  cardId: string,
  price: number,
  signalScore: number,
  rarity = "Rare"
): CollectionCardViewItem {
  return {
    collection_item_id: null,
    card_id: cardId,
    name: cardId,
    image_url: null,
    card_number: "1",
    rarity,
    supertype: "Pokemon",
    episode_id: "set-1",
    episode_name: "Test Set",
    episode_code: "TST",
    current_value: price,
    signal_score: signalScore,
    purchase_price: null,
    cost_basis_value: null,
    cost_basis_label: "Paid",
    cost_basis_source: "direct",
    condition: null,
    grading_company: null,
    grading_grade: null,
    owned: false,
  };
}

describe("binder next-buy recommendations", () => {
  it("combines signal strength with an off-peak price instead of sorting by price alone", () => {
    const recommendations = buildBinderNextBuyRecommendations({
      items: [
        item("cheap-low-signal", 2, 20, "Common"),
        item("strong-off-peak", 12, 88, "Special Illustration Rare"),
        item("expensive", 90, 70, "Rare Ultra"),
      ],
      history: [
        { card_id: "cheap-low-signal", fetched_at: "2026-07-01", cm_en_lowest_nm: 2.2 },
        { card_id: "cheap-low-signal", fetched_at: "2026-08-01", cm_en_lowest_nm: 2 },
        { card_id: "strong-off-peak", fetched_at: "2026-07-01", cm_en_lowest_nm: 24 },
        { card_id: "strong-off-peak", fetched_at: "2026-08-01", cm_en_lowest_nm: 12 },
        { card_id: "expensive", fetched_at: "2026-07-01", cm_en_lowest_nm: 88 },
        { card_id: "expensive", fetched_at: "2026-08-01", cm_en_lowest_nm: 90 },
      ],
      ownedCount: 80,
      totalCards: 100,
    });

    expect(recommendations[0]?.cardId).toBe("strong-off-peak");
    expect(recommendations[0]?.completionAfterPercent).toBe(81);
    expect(recommendations[0]?.reason).toMatch(/signal|Movers/i);
  });

  it("omits cards without a usable current price", () => {
    const missingPrice = { ...item("missing", 1, 90), current_value: null };
    expect(
      buildBinderNextBuyRecommendations({
        items: [missingPrice],
        history: [],
        ownedCount: 0,
        totalCards: 1,
      })
    ).toEqual([]);
  });

  it("prioritizes a real chase over cheap bulk below five euros", () => {
    const cheapBulk = {
      ...item("cheap-bulk", 2.5, 76, "Common"),
      chase_score: 10,
      chase_tier: "Entry tier",
    };
    const chase = {
      ...item("set-chase", 32, 76, "Rare Ultra"),
      chase_score: 100,
      chase_tier: "Chase tier",
    };
    const recommendations = buildBinderNextBuyRecommendations({
      items: [cheapBulk, chase],
      history: [],
      ownedCount: 40,
      totalCards: 100,
    });

    expect(recommendations[0]?.cardId).toBe("set-chase");
    expect(recommendations[0]?.chaseTier).toBe("Chase tier");
  });
});
