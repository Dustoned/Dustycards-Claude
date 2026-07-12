import { describe, expect, it } from "vitest";
import {
  calculateWilsonInterval,
  collapseSignalPricesByUtcDay,
  evaluateSignalOutcome,
  getSignalPriceBand,
  summarizeForecastCohort,
} from "@/lib/external-signal-forecast";

const DAY_MS = 24 * 60 * 60_000;

function day(start: Date, offset: number, hour = 12): Date {
  return new Date(start.getTime() + offset * DAY_MS + hour * 60 * 60_000);
}

describe("external signal outcome evaluation", () => {
  it("keeps the last valid price for every UTC day", () => {
    const start = new Date("2026-01-01T00:00:00.000Z");
    expect(
      collapseSignalPricesByUtcDay([
        { observedAt: day(start, 1, 8), value: 10 },
        { observedAt: day(start, 1, 18), value: 11 },
        { observedAt: "invalid", value: 99 },
        { observedAt: day(start, 2), value: null },
      ])
    ).toEqual([{ observedAt: day(start, 1, 18), value: 11 }]);
  });

  it("requires two threshold days and sufficient end coverage", () => {
    const entryAt = new Date("2026-01-01T00:00:00.000Z");
    const prices = Array.from({ length: 27 }, (_, index) => ({
      observedAt: day(entryAt, index + 1),
      value: index === 9 || index === 12 ? 21 : 12,
    }));
    const outcome = evaluateSignalOutcome({
      entryAt,
      entryPrice: 10,
      horizonDays: 30,
      prices,
      now: day(entryAt, 31),
    });

    expect(outcome.status).toBe("complete");
    expect(outcome.coverageRatio).toBe(0.9);
    expect(outcome.hit15x).toBe(true);
    expect(outcome.hit2x).toBe(true);
    expect(outcome.hit3x).toBe(false);
  });

  it("does not turn sparse completed history into a false failure", () => {
    const entryAt = new Date("2026-01-01T00:00:00.000Z");
    const outcome = evaluateSignalOutcome({
      entryAt,
      entryPrice: 10,
      horizonDays: 30,
      prices: [{ observedAt: day(entryAt, 5), value: 40 }],
      now: day(entryAt, 31),
    });

    expect(outcome.status).toBe("insufficient");
    expect(outcome.hit2x).toBeNull();
  });

  it("keeps an unfinished horizon pending", () => {
    const entryAt = new Date("2026-01-01T00:00:00.000Z");
    expect(
      evaluateSignalOutcome({
        entryAt,
        entryPrice: 10,
        horizonDays: 90,
        prices: [],
        now: day(entryAt, 20),
      }).status
    ).toBe("pending");
  });
});

describe("forecast publication gates", () => {
  it("calculates a bounded Wilson interval", () => {
    const interval = calculateWilsonInterval(20, 100);
    expect(interval?.estimate).toBe(0.2);
    expect(interval?.lower).toBeGreaterThan(0);
    expect(interval?.upper).toBeLessThan(1);
  });

  it("stays in learning mode until sample and validation gates pass", () => {
    const learning = summarizeForecastCohort({
      targetMultiplier: 1.5,
      hits: 4,
      samples: 40,
      uniqueCards: 25,
    });
    expect(learning.status).toBe("learning");
    expect(learning.reason).toContain("more completed");

    const calibrated = summarizeForecastCohort({
      targetMultiplier: 1.5,
      hits: 20,
      samples: 200,
      uniqueCards: 150,
      holdoutSamples: 40,
      holdoutCalibrationError: 0.06,
    });
    expect(calibrated.status).toBe("calibrated");
  });

  it("uses stable EUR price bands", () => {
    expect(getSignalPriceBand(2)).toBe("EUR 1-5");
    expect(getSignalPriceBand(24.99)).toBe("EUR 5-25");
    expect(getSignalPriceBand(100)).toBe("EUR 100+");
    expect(getSignalPriceBand(null)).toBeNull();
  });
});
