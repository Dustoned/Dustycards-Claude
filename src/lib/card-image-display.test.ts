import { describe, expect, it } from "vitest";
import {
  getCardImageClassName,
  hasTcggoGeneratedCardBorder,
} from "@/lib/card-image-display";

describe("card image display", () => {
  it("marks TCGGO storage card images for visual border cropping", () => {
    const imageUrl = "https://images.tcggo.com/tcggo/storage/35966/mega-greninja-ex.webp";

    expect(hasTcggoGeneratedCardBorder(imageUrl)).toBe(true);
    expect(getCardImageClassName(imageUrl, "rounded-[4.75%] object-fill")).toContain(
      "scale-[1.075]"
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
