import { describe, expect, it } from "vitest";
import { isCardCompatibleWithEpisodeCode } from "@/lib/card-episode-integrity";

describe("isCardCompatibleWithEpisodeCode", () => {
  it("keeps SV promo cards in SV Black Star Promos", () => {
    expect(isCardCompatibleWithEpisodeCode("svp-200", "PR-SV")).toBe(true);
    expect(isCardCompatibleWithEpisodeCode("svp-203", "pr_sv")).toBe(true);
  });

  it("rejects SV promo cards returned in the Scarlet & Violet base-set feed", () => {
    expect(isCardCompatibleWithEpisodeCode("svp-200", "SVI")).toBe(false);
  });

  it("does not restrict ordinary cards or episodes without a code", () => {
    expect(isCardCompatibleWithEpisodeCode("sv1-200", "SVI")).toBe(true);
    expect(isCardCompatibleWithEpisodeCode("svp-200", null)).toBe(true);
  });
});
