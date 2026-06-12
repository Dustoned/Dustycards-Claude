import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearRecentSearches,
  readRecentSearches,
  rememberRecentSearch,
} from "./recent-searches";

const store = new Map<string, string>();

beforeAll(() => {
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
  });
});

describe("recent searches", () => {
  beforeEach(() => {
    store.clear();
  });

  it("remembers queries newest-first", () => {
    rememberRecentSearch("charizard");
    rememberRecentSearch("pikachu");
    expect(readRecentSearches()).toEqual(["pikachu", "charizard"]);
  });

  it("dedupes case-insensitively and moves repeats to the front", () => {
    rememberRecentSearch("charizard");
    rememberRecentSearch("pikachu");
    rememberRecentSearch("CHARIZARD");
    expect(readRecentSearches()).toEqual(["CHARIZARD", "pikachu"]);
  });

  it("caps the list at eight entries", () => {
    for (let i = 1; i <= 12; i += 1) {
      rememberRecentSearch(`query ${i}`);
    }
    const recents = readRecentSearches();
    expect(recents).toHaveLength(8);
    expect(recents[0]).toBe("query 12");
    expect(recents[7]).toBe("query 5");
  });

  it("ignores empty queries and survives corrupt storage", () => {
    rememberRecentSearch("   ");
    expect(readRecentSearches()).toEqual([]);

    store.set("dustycards-recent-searches", "{not json");
    expect(readRecentSearches()).toEqual([]);
  });

  it("clears the list", () => {
    rememberRecentSearch("charizard");
    expect(clearRecentSearches()).toEqual([]);
    expect(readRecentSearches()).toEqual([]);
  });
});
