import { describe, expect, it } from "vitest";
import { getEpisodeDisplayCardCount } from "@/lib/episodes";

describe("getEpisodeDisplayCardCount", () => {
  it("prefers the higher local count when the source set count is too low", () => {
    expect(
      getEpisodeDisplayCardCount({
        card_count: 25,
        _count: { cards: 28 },
      })
    ).toBe(28);
  });

  it("falls back to the local count when the source set count is missing", () => {
    expect(
      getEpisodeDisplayCardCount({
        card_count: null,
        _count: { cards: 143 },
      })
    ).toBe(143);
  });
});
