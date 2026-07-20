import { describe, expect, it } from "vitest";
import { buildSearchHref, shouldSyncSearchInputValue } from "./search-navigation";

describe("search navigation", () => {
  it("preserves a manually selected game while the query changes", () => {
    expect(
      buildSearchHref({
        query: "  Mew ex  ",
        game: "pokemon",
        autoSwitch: "0",
      })
    ).toBe("/search?q=Mew+ex&game=pokemon&autoswitch=0");
  });

  it("does not let a stale route commit overwrite focused input", () => {
    expect(shouldSyncSearchInputValue("Mew ex", "Mew", true)).toBe(false);
    expect(shouldSyncSearchInputValue("Mew ex", "Mew", false)).toBe(true);
    expect(shouldSyncSearchInputValue("Mew ex", "Mew ex", true)).toBe(false);
  });
});
