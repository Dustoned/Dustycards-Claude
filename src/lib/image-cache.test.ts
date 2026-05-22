import { describe, expect, it } from "vitest";
import {
  getCachedImageUrl,
  getImageCacheVariantForSourceUrl,
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

  it("leaves regular cacheable images on the original cache variant", () => {
    const sourceUrl = "https://assets.tcgdex.net/en/sv/sv01/1/high.webp";

    expect(getImageCacheVariantForSourceUrl(sourceUrl)).toBeNull();
    expect(getCachedImageUrl(sourceUrl)).toBe(
      `/api/image-cache?url=${encodeURIComponent(sourceUrl)}`
    );
  });
});
