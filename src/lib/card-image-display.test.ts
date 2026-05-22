import { describe, expect, it } from "vitest";
import {
  getCardImageClassName,
  hasTcggoGeneratedCardBorder,
} from "@/lib/card-image-display";

describe("card image display", () => {
  it("preserves TCGGO storage card proportions without an extra rounded mask", () => {
    const imageUrl = "https://images.tcggo.com/tcggo/storage/35966/mega-greninja-ex.webp";

    expect(hasTcggoGeneratedCardBorder(imageUrl)).toBe(true);
    expect(getCardImageClassName(imageUrl, "rounded-[4.75%] object-fill")).toBe(
      "object-contain"
    );
  });

  it("leaves other image sources unchanged", () => {
    const imageUrl = "https://assets.tcgdex.net/en/sv/sv01/1/high.webp";

    expect(hasTcggoGeneratedCardBorder(imageUrl)).toBe(false);
    expect(getCardImageClassName(imageUrl, "rounded-[4.75%] object-fill")).toBe(
      "rounded-[4.75%] object-fill"
    );
  });
});
