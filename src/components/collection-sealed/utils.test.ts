import { describe, expect, it } from "vitest";
import { buildModalProduct } from "@/components/collection-sealed/utils";

describe("sealed collection modal mapping", () => {
  it("keeps the selected collection copy id for editing", () => {
    expect(
      buildModalProduct({
        id: "copy-2",
        product_id: "product-1",
        name: "Booster Box",
        image_url: null,
        episode_id: "set-1",
        episode_name: "Test Set",
        episode_code: "TST",
        cardmarket_url: null,
        quantity: 2,
        purchase_price_per_item: 100,
        current_value_per_item: 140,
      }).collection_item_id
    ).toBe("copy-2");
  });
});
