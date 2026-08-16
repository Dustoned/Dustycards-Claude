import { describe, expect, it } from "vitest";
import {
  buildNavigationMarketHref,
  formatNavigationCount,
  getNavigationBadge,
  getNavigationDisplayName,
  getNavigationCustomizationOptions,
  isNavigationItemActive,
  resolveNavigationItems,
  type NavigationMarketMode,
} from "./navigation-model";

function searchParams(value = ""): URLSearchParams {
  return new URLSearchParams(value);
}

function expectMarketHref(
  mode: NavigationMarketMode,
  pathname: string,
  query: string,
  expected: Record<string, string>
): void {
  const href = buildNavigationMarketHref(mode, pathname, searchParams(query));
  const url = new URL(href, "https://dustycards.test");

  expect(url.pathname).toBe("/movers");
  expect(Object.fromEntries(url.searchParams)).toEqual(expected);
}

describe("navigation-model active state", () => {
  it.each([
    ["home", "/", null, null, true],
    ["home", "/", "overview", null, true],
    ["home", "/", "complete", null, false],
    ["complete", "/", "complete", null, true],
    ["complete", "/", "cards", null, true],
    ["singles", "/", "singles", null, true],
    ["binders", "/", "binders", null, true],
    ["binders", "/binders/weekly-trades", null, null, true],
    ["sealed", "/", "sealed", null, true],
    ["graded", "/", "graded", null, true],
    ["selling", "/", "selling", null, true],
    ["wants", "/wants", null, null, true],
    ["wants", "/wants/shared", null, null, true],
    ["expansions", "/expansions/415", null, null, true],
    ["one-piece", "/one-piece/expansions", null, null, true],
    ["categories", "/illustrators", null, null, false],
  ] as const)(
    "%s on %s (tab=%s, scope=%s) is active=%s",
    (key, pathname, tab, scope, expected) => {
      expect(isNavigationItemActive(pathname, tab, key, scope)).toBe(expected);
    }
  );

  it.each([
    [null, true, false, false],
    ["collection", true, false, false],
    ["all", true, false, false],
    ["value", false, false, false],
    ["graded", false, true, false],
    ["grading", false, true, false],
    ["sealed", false, false, true],
  ] as const)(
    "groups both grading views into one market destination for scope=%s",
    (scope, raw, grading, sealed) => {
      expect(isNavigationItemActive("/movers", null, "market-raw", scope)).toBe(raw);
      expect(isNavigationItemActive("/movers", null, "market-graded", scope)).toBe(grading);
      expect(isNavigationItemActive("/movers", null, "market-targets", scope)).toBe(false);
      expect(isNavigationItemActive("/movers", null, "market-sealed", scope)).toBe(sealed);
    }
  );

  it("keeps Signal Radar separate from the raw movers route", () => {
    expect(isNavigationItemActive("/movers/signal-radar", null, "market-raw", null)).toBe(false);
    expect(isNavigationItemActive("/movers/signal-radar/18530", null, "market-radar", null)).toBe(
      true
    );
    expect(isNavigationItemActive("/movers", null, "market-radar", null)).toBe(false);
  });
});

describe("navigation-model market links", () => {
  it("preserves game, source and trend when switching to raw in collection context", () => {
    expectMarketHref(
      "raw",
      "/movers",
      "game=one-piece&source=cardmarket&trend=gainers",
      {
        game: "one-piece",
        source: "cardmarket",
        trend: "gainers",
        scope: "collection",
      }
    );
  });

  it("preserves the explicit all context when switching to graded", () => {
    expectMarketHref(
      "graded",
      "/movers",
      "game=pokemon&source=tcgplayer&trend=losers&scope=all&view=collection",
      {
        game: "pokemon",
        source: "tcgplayer",
        trend: "losers",
        scope: "graded",
      }
    );
  });

  it.each([
    ["targets", "grading"],
    ["sealed", "sealed"],
  ] as const)(
    "keeps collection context for %s without carrying an incompatible trend",
    (mode, scope) => {
      expectMarketHref(
        mode,
        "/movers",
        "game=one-piece&source=ebay&trend=gainers&scope=collection",
        {
          game: "one-piece",
          source: "ebay",
          scope,
          view: "collection",
        }
      );
    }
  );

  it("defaults to all context away from movers", () => {
    expectMarketHref("raw", "/wants", "source=cardmarket", {
      source: "cardmarket",
      scope: "all",
    });
  });

  it("honors a view-only collection context", () => {
    expectMarketHref("graded", "/wants", "view=collection", {
      scope: "graded",
      view: "collection",
    });
  });
});

describe("navigation-model badges and labels", () => {
  it("formats navigation counts with stable en-US grouping", () => {
    expect(formatNavigationCount(0)).toBe("0");
    expect(formatNavigationCount(1_234_567)).toBe("1,234,567");
  });

  it("keeps zero collection and wants badges visible but hides an empty for-sale badge", () => {
    expect(getNavigationBadge("cards", 0, 0, 0)).toBe("0");
    expect(getNavigationBadge("wants", 0, 0, 0)).toBe("0");
    expect(getNavigationBadge("forSale", 0, 0, 0)).toBeNull();
    expect(getNavigationBadge(null, 10, 20, 30)).toBeNull();
  });

  it("formats positive badge values", () => {
    expect(getNavigationBadge("cards", 12_345, 0, 0)).toBe("12,345");
    expect(getNavigationBadge("forSale", 0, 2_345, 0)).toBe("2,345");
    expect(getNavigationBadge("wants", 0, 0, 345)).toBe("345");
  });

  it.each([
    ["dusty.beckmann@example.com", "Dusty"],
    ["misty_waters@example.com", "Misty"],
    ["brock-rocks@example.com", "Brock"],
    ["ash@example.com", "Ash"],
    ["@example.com", "Dusty"],
    ["   @example.com", "Dusty"],
  ])("derives display name from %s", (email, expected) => {
    expect(getNavigationDisplayName(email)).toBe(expected);
  });
});

describe("navigation customization", () => {
  it("offers direct search and distinct sealed destinations", () => {
    const labels = Object.fromEntries(
      getNavigationCustomizationOptions(true).map((option) => [option.key, option.label])
    );

    expect(labels.search).toBe("Search cards");
    expect(labels.sealed).toBe("Sealed collection");
    expect(labels["market-sealed"]).toBe("Sealed market");
    expect(labels["market-graded"]).toBe("Grading market");
    expect(labels["market-targets"]).toBeUndefined();
  });

  it("filters disabled libraries and fills fixed shortcut rows from fallbacks", () => {
    const items = resolveNavigationItems(
      ["one-piece", "market-sealed"],
      false,
      {
        fallbackKeys: ["home", "complete", "wants", "market-raw"],
        fill: true,
        limit: 4,
      }
    );

    expect(items.map((item) => item.key)).toEqual([
      "market-sealed",
      "home",
      "complete",
      "wants",
    ]);
  });
});
