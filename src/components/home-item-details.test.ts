import { describe, expect, it } from "vitest";
import {
  buildHomeSuddenDropSealedProduct,
  buildHomeUpcomingSealedProduct,
} from "@/components/home-item-details";

describe("Home sealed item details", () => {
  it("builds an exact sealed-drop modal target with the visible current price", () => {
    expect(buildHomeSuddenDropSealedProduct({
      productId: "product-42",
      name: "Booster Box",
      imageUrl: "https://example.com/box.webp",
      episodeId: "episode-7",
      episodeName: "Test Set",
      episodeCode: "TST",
      currentPrice: 129.95,
      currency: "EUR",
      dropAmount: 20,
      dropPercent: 13.3,
    })).toMatchObject({
      id: "product-42",
      name: "Booster Box",
      price: { cm_lowest_eu: 129.95 },
      episode: { id: "episode-7", code: "TST" },
    });
  });

  it("only creates an Upcoming sealed detail target when a product is linked", () => {
    const base = {
      id: "release-1",
      productId: null,
      name: "Unmatched product",
      imageUrl: null,
      releaseDate: "2026-12-01T00:00:00.000Z",
      daysUntil: 100,
      episodeId: null,
      episodeName: null,
      episodeCode: null,
      sourceName: "Official",
      sourceUrl: "https://example.com/release",
    };
    expect(buildHomeUpcomingSealedProduct(base)).toBeNull();
    expect(buildHomeUpcomingSealedProduct({ ...base, productId: "product-9" })).toMatchObject({
      id: "product-9",
      release_date: "2026-12-01T00:00:00.000Z",
    });
  });
});
