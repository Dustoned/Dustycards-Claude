import { describe, expect, it } from "vitest";
import {
  getSignalRadarSortOptions,
  getComparableRadarPrice,
  resolveSignalRadarSortKey,
} from "@/lib/signal-radar-sort-options";

describe("Signal Radar sort options", () => {
  it("compares EUR and USD quotes in EUR and leaves unknown conversions unpriced", () => {
    const usd = getComparableRadarPrice({ currentPrice: 100, currency: "USD", currentPriceEur: 85 });
    const eur = getComparableRadarPrice({ currentPrice: 90, currency: "EUR" });
    expect(usd).toBeLessThan(eur!);
    expect(getComparableRadarPrice({ currentPrice: 100, currency: "USD" })).toBeNull();
  });
  it("keeps Radar intelligence sorts for the regular signal cohort", () => {
    const values = getSignalRadarSortOptions(false).map((option) => option.value);
    expect(values).toContain("sealed");
    expect(values).toContain("meta");
    expect(values).toContain("reach");
  });

  it("replaces zero-value Radar sorts with meaningful old-card sorts", () => {
    const values = getSignalRadarSortOptions(true).map((option) => option.value);
    expect(values).toEqual([
      "opportunity",
      "price_asc",
      "price_desc",
      "release_oldest",
      "release_newest",
      "rarity_cohort",
      "history",
    ]);
    expect(values).not.toContain("sealed");
    expect(values).not.toContain("meta");
  });

  it("falls back from an inapplicable sort when the cohort changes", () => {
    expect(resolveSignalRadarSortKey("sealed", true)).toBe("opportunity");
    expect(resolveSignalRadarSortKey("rarity_cohort", false)).toBe("opportunity");
    expect(resolveSignalRadarSortKey("price_desc", true)).toBe("price_desc");
  });
});
