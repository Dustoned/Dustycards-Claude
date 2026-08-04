import { describe, expect, it } from "vitest";
import {
  getCachedImageUrl,
  getImageCacheVariantForSourceUrl,
  getResponsiveCachedImageUrl,
  getTextureImageUrl,
  normalizeResponsiveImageWidth,
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

  it("serves bounded responsive thumbnails while leaving original delivery unchanged", () => {
    const sourceUrl = "https://assets.tcgdex.net/en/sv/sv01/1/high.webp";

    expect(getResponsiveCachedImageUrl(sourceUrl, 52)).toBe(
      `/api/image-cache?url=${encodeURIComponent(sourceUrl)}&width=64`
    );
    expect(getResponsiveCachedImageUrl(sourceUrl, 180)).toBe(
      `/api/image-cache?url=${encodeURIComponent(sourceUrl)}&width=192`
    );
    expect(getResponsiveCachedImageUrl(sourceUrl, 5000)).toBe(
      `/api/image-cache?url=${encodeURIComponent(sourceUrl)}&width=1024`
    );
    expect(getCachedImageUrl(sourceUrl)).toBe(sourceUrl);
  });

  it("normalizes requested widths into a small cache-safe set", () => {
    expect(normalizeResponsiveImageWidth(null)).toBeNull();
    expect(normalizeResponsiveImageWidth("not-a-width")).toBeNull();
    expect(normalizeResponsiveImageWidth(1)).toBe(64);
    expect(normalizeResponsiveImageWidth("96")).toBe(96);
    expect(normalizeResponsiveImageWidth(97)).toBe(128);
    expect(normalizeResponsiveImageWidth(4096)).toBe(1024);
  });

  it("preserves transparent-trim processing in responsive delivery URLs", () => {
    const sourceUrl = "https://images.tcggo.com/tcggo/storage/35966/mega-greninja-ex.webp";

    expect(getResponsiveCachedImageUrl(sourceUrl, 300)).toBe(
      `/api/image-cache?url=${encodeURIComponent(sourceUrl)}` +
        `&variant=${TCGGO_CARD_TRANSPARENT_TRIM_VARIANT}&width=320`
    );
  });

  it.each([
    "https://www.pokebeach.com/news/2026/06/product.jpg",
    "https://www.pokemon.com/static-assets/product.png",
    "https://mcdn.pokemon.com/pokemon-prod/image/upload/card.png",
    "https://icv2.com/images/product.jpg",
    "https://billsarchive.com/assets/articles/reveal.webp",
    "https://bills-archive.nyc3.cdn.digitaloceanspaces.com/cards/reveal.webp",
  ])("proxies release-watch artwork from %s through the local cache", (sourceUrl) => {
    expect(getCachedImageUrl(sourceUrl)).toBe(
      `/api/image-cache?url=${encodeURIComponent(sourceUrl)}`
    );
  });
});
