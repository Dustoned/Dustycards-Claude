import { describe, expect, it } from "vitest";
import {
  getCardImageFrameClassName,
  getCardImageClassName,
  hasTcggoGeneratedCardBorder,
} from "@/lib/card-image-display";

describe("card image display", () => {
  it("preserves TCGGO storage card proportions without an extra rounded mask", () => {
    const imageUrl = "https://images.tcggo.com/tcggo/storage/35966/mega-greninja-ex.webp";

    expect(hasTcggoGeneratedCardBorder(imageUrl)).toBe(true);
    expect(getCardImageClassName(imageUrl, "rounded-[4.75%] object-fill")).toBe(
      "object-contain z-10"
    );
    expect(
      getCardImageFrameClassName(
        imageUrl,
        "relative aspect-[63/88] w-full overflow-hidden rounded-[4.75%] bg-transparent"
      )
    ).toContain("relative aspect-[63/88] w-full bg-transparent");
    expect(
      getCardImageFrameClassName(
        imageUrl,
        "relative aspect-[63/88] w-full overflow-hidden rounded-[4.75%] bg-transparent"
      )
    ).toContain("before:bg-[#4b4d50]");
  });

  it("leaves other image sources unchanged", () => {
    const imageUrl = "https://assets.tcgdex.net/en/sv/sv01/1/high.webp";

    expect(hasTcggoGeneratedCardBorder(imageUrl)).toBe(false);
    expect(getCardImageClassName(imageUrl, "rounded-[4.75%] object-fill")).toBe(
      "rounded-[4.75%] object-fill"
    );
    expect(
      getCardImageFrameClassName(
        imageUrl,
        "relative aspect-[63/88] w-full overflow-hidden rounded-[4.75%] bg-transparent"
      )
    ).toBe("relative aspect-[63/88] w-full overflow-hidden rounded-[4.75%] bg-transparent");
  });
});
