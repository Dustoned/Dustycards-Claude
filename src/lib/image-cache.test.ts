import { describe, expect, it } from "vitest";
import {
  getCachedImageUrl,
  getImageCacheVariantForSourceUrl,
  getTextureImageUrl,
  TCGGO_CARD_TRANSPARENT_TRIM_VARIANT,
} from "@/lib/image-cache";

describe("image cache", () => {
  it("uses a transparent-trim variant for TCGGO storage card images", () => {
    const sourceUrl = "https://images.tcggo.com/tcggo/storage/35966/mega-greninja-ex.webp";

    expect(getImageCacheVariantForSourceUrl(sourceUrl)).toBe(TCGGO_CARD_TRANSPARENT_TRIM_VARIANT);
    expect(getCachedImageUrl(sourceUrl)).toBe(
      `/api/image-cache?url=${encodeURIComponent(sourceUrl)}&variant=${TCGGO_CARD_TRANSPARENT_TRIM_VARIANT}`
    );
  });

  it("loads optimized TCGdex images directly for a faster cold start", () => {
    const sourceUrl = "https://assets.tcgdex.net/en/sv/sv01/1/high.webp";

    expect(getImageCacheVariantForSourceUrl(sourceUrl)).toBeNull();
    expect(getCachedImageUrl(sourceUrl)).toBe(sourceUrl);
    expect(getTextureImageUrl(sourceUrl)).toBe(
      `/api/image-cache?url=${encodeURIComponent(sourceUrl)}`
    );
  });

  it.each([
    "https://www.pokebeach.com/news/2026/06/product.jpg",
    "https://www.pokemon.com/static-assets/product.png",
    "https://icv2.com/images/product.jpg",
  ])("proxies release-watch artwork from %s through the local cache", (sourceUrl) => {
    expect(getCachedImageUrl(sourceUrl)).toBe(
      `/api/image-cache?url=${encodeURIComponent(sourceUrl)}`
    );
  });
});
