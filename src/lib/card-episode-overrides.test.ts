import { describe, expect, it } from "vitest";
import {
  buildCardEpisodeAssignment,
  getCardEpisodeOverride,
} from "@/lib/card-episode-overrides";

describe("card episode overrides", () => {
  it("routes the metal 151 UPC Mew to Scarlet & Violet promos", () => {
    expect(getCardEpisodeOverride("47943")).toBe("23");
    expect(buildCardEpisodeAssignment("47943", "16")).toEqual({ episode_id: "23" });
  });

  it("keeps normal cards in their source episode", () => {
    expect(getCardEpisodeOverride("2689")).toBeNull();
    expect(buildCardEpisodeAssignment("2689", "16")).toEqual({ episode_id: "16" });
  });
});
