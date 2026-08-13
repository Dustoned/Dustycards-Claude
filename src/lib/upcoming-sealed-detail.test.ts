import { describe, expect, it } from "vitest";

import { buildUpcomingSealedDetailProduct } from "@/lib/upcoming-sealed-detail";

describe("upcoming sealed detail product", () => {
  it("keeps the exact matched product id for modal hydration", () => {
    const product = buildUpcomingSealedDetailProduct({
      id: "watch-1",
      kind: "product",
      name: "First Partner Illustration Collection Series 3",
      imageUrl: "https://example.com/product.png",
      releaseDate: "2026-08-07T12:00:00.000Z",
      daysUntil: 0,
      daysSinceRelease: 5,
      sourceName: "Pokemon.com",
      sourceUrl: "https://www.pokemon.com/product",
      confidence: 1,
      productId: "50639",
      episodeId: "226",
      episodeName: "Pokémon Products",
      episodeCode: "PROD",
    });

    expect(product).toMatchObject({
      id: "50639",
      release_date_source: "Pokemon.com",
      episode: { id: "226" },
    });
  });

  it("does not invent a detail target for an unmatched release", () => {
    expect(
      buildUpcomingSealedDetailProduct({
        id: "watch-2",
        kind: "product",
        name: "Unknown product",
        imageUrl: null,
        releaseDate: "2026-09-01T00:00:00.000Z",
        daysUntil: 10,
        daysSinceRelease: null,
        sourceName: "Publisher",
        sourceUrl: null,
        confidence: null,
        productId: null,
        episodeId: null,
        episodeName: null,
        episodeCode: null,
      })
    ).toBeNull();
  });
});
