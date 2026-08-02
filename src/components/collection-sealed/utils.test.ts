import { describe, expect, it } from "vitest";
import {
  buildModalProduct,
  getCollectionSealedCurrentTotal,
  getCollectionSealedUnitValue,
} from "@/components/collection-sealed/utils";

describe("sealed collection helpers", () => {
  it("keeps the selected collection copy id for editing", () => {
    const modalProduct = buildModalProduct({
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
    });

    expect(modalProduct.collection_item_id).toBe("copy-2");
    expect(modalProduct.price.cm_lowest_eu).toBe(140);
  });

  it("keeps the per-item market value separate from the owned total", () => {
    const item = {
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
    };

    expect(getCollectionSealedUnitValue(item)).toBe(140);
    expect(getCollectionSealedCurrentTotal(item)).toBe(280);
  });
});
