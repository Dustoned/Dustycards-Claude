import { describe, expect, it } from "vitest";

import {
  buildDailyMarketHistory,
  calculateRobustPriceTrend,
  type PriceHistoryObservation,
} from "@/lib/robust-price-history";

const DAY_MS = 86_400_000;
const latest = Date.parse("2026-07-14T12:00:00.000Z");

function observation(
  daysAgo: number,
  primaryValue: number | null,
  fallbackValue: number | null = null,
  hour = 12
): PriceHistoryObservation {
  const date = new Date(latest - daysAgo * DAY_MS);
  date.setUTCHours(hour, 0, 0, 0);
  return { observedAt: date, primaryValue, fallbackValues: [fallbackValue] };
}

describe("robust price history", () => {
  it("does not mistake 28 days of observations for a 90-day trend", () => {
    const daily = buildDailyMarketHistory(
      Array.from({ length: 29 }, (_, index) => observation(28 - index, 100 + index))
    );

    expect(calculateRobustPriceTrend(daily, 90)).toBeNull();
    expect(calculateRobustPriceTrend(daily, 30)).not.toBeNull();
  });

  it("counts duplicate refreshes on one UTC day only once", () => {
    const rows: PriceHistoryObservation[] = [];
    for (let daysAgo = 70; daysAgo >= 0; daysAgo -= 7) {
      rows.push(observation(daysAgo, 100, null, 1));
      rows.push(observation(daysAgo, 102, null, 12));
      rows.push(observation(daysAgo, 104, null, 23));
    }
    const daily = buildDailyMarketHistory(rows);

    expect(daily).toHaveLength(11);
    expect(daily[0].value).toBe(102);
    expect(calculateRobustPriceTrend(daily, 90)).toBeNull();
  });

  it("prefers the stable English 7-day average over a volatile listing floor", () => {
    const rows: PriceHistoryObservation[] = [];
    for (let daysAgo = 90; daysAgo >= 0; daysAgo -= 5) {
      const progress = (90 - daysAgo) / 90;
      rows.push(
        observation(
          daysAgo,
          700 - progress * 420,
          daysAgo === 0 ? 435 : 250
        )
      );
    }
    const daily = buildDailyMarketHistory(rows);
    const trend = calculateRobustPriceTrend(daily, 90);

    expect(trend).not.toBeNull();
    expect(trend?.percent).toBeLessThan(-40);
  });

  it("falls back to English NM values and smooths endpoint outliers", () => {
    const rows: PriceHistoryObservation[] = [];
    for (let daysAgo = 90; daysAgo >= 0; daysAgo -= 5) {
      const regularValue = 100 + ((90 - daysAgo) / 90) * 20;
      const finalOutlier = daysAgo === 0 ? 240 : regularValue;
      rows.push(observation(daysAgo, null, finalOutlier));
    }
    const daily = buildDailyMarketHistory(rows);
    const trend = calculateRobustPriceTrend(daily, 90);

    expect(trend).not.toBeNull();
    expect(trend?.percent).toBeGreaterThan(10);
    expect(trend?.percent).toBeLessThan(30);
  });

  it("enforces the 180-day span and distinct-day requirements", () => {
    const insufficientSpan = buildDailyMarketHistory(
      Array.from({ length: 25 }, (_, index) => observation(100 - index * 4, 100 + index))
    );
    const sufficient = buildDailyMarketHistory(
      Array.from({ length: 21 }, (_, index) => observation(140 - index * 7, 100 + index))
    );

    expect(calculateRobustPriceTrend(insufficientSpan, 180)).toBeNull();
    expect(calculateRobustPriceTrend(sufficient, 180)).not.toBeNull();
  });
});
