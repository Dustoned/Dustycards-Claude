import { describe, expect, it } from "vitest";
import {
  FORECAST_TARGET_DISPLAY,
  calculateWilsonInterval,
  collapseSignalPricesByUtcDay,
  evaluateMeaningfulVerdict,
  evaluateSignalOutcome,
  getMeaningfulSignalMove,
  scoreForecastOutcome,
  summarizeForecastCohort,
} from "@/lib/external-signal-forecast";

const DAY_MS = 24 * 60 * 60_000;

function day(start: Date, offset: number, hour = 12): Date {
  return new Date(start.getTime() + offset * DAY_MS + hour * 60 * 60_000);
}

describe("external signal outcome evaluation", () => {
  it("does not expose observations from after the evaluation time", () => {
    const entryAt = new Date("2026-01-01T00:00:00Z");
    const result = evaluateSignalOutcome({ entryAt, entryPrice: 10, horizonDays: 30,
      now: day(entryAt, 5), prices: [
        { observedAt: day(entryAt, 2), value: 11 },
        { observedAt: day(entryAt, 20), value: 100 },
        { observedAt: day(entryAt, 20), sourcePriceAt: day(entryAt, 3), value: 200 },
      ],
    });
    expect(result.status).toBe("pending");
    expect(result.observedDays).toBe(1);
    expect(result.maxReferencePrice).toBe(11);
  });
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

  it("collapses scheduler carry-forward copies back to their source day", () => {
    const start = new Date("2026-01-01T00:00:00.000Z");
    const sourceAt = day(start, 1, 9);
    expect(
      collapseSignalPricesByUtcDay([
        { observedAt: day(start, 1, 12), sourcePriceAt: sourceAt, value: 25 },
        { observedAt: day(start, 2, 12), sourcePriceAt: sourceAt, value: 25 },
        { observedAt: day(start, 3, 12), sourcePriceAt: sourceAt, value: 25 },
      ])
    ).toEqual([{ observedAt: sourceAt, value: 25 }]);
  });

  it("does not count one carried quote as a sustained threshold hit", () => {
    const entryAt = new Date("2026-01-01T00:00:00.000Z");
    const spikeSourceAt = day(entryAt, 27, 9);
    const prices = [
      // 26 real daily quotes below the threshold keep coverage sufficient.
      ...Array.from({ length: 26 }, (_, index) => ({
        observedAt: day(entryAt, index + 1),
        sourcePriceAt: day(entryAt, index + 1, 9),
        value: 12,
      })),
      // One real 2x spike that the scheduler carried forward for two days.
      { observedAt: day(entryAt, 27, 12), sourcePriceAt: spikeSourceAt, value: 21 },
      { observedAt: day(entryAt, 28, 12), sourcePriceAt: spikeSourceAt, value: 21 },
    ];
    const outcome = evaluateSignalOutcome({
      entryAt,
      entryPrice: 10,
      horizonDays: 30,
      prices,
      now: day(entryAt, 31),
    });

    expect(outcome.status).toBe("complete");
    expect(outcome.hit2x).toBe(false);
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
});

const scenarioJson = JSON.stringify({
  points: {
    d30: { low: 9, base: 10, high: 12 },
    d90: { low: 8, base: 11, high: 14 },
    d180: { low: 7, base: 12, high: 18 },
  },
});

function score(
  overrides: Partial<Parameters<typeof scoreForecastOutcome>[0]> = {}
): ReturnType<typeof scoreForecastOutcome> {
  return scoreForecastOutcome({
    entryOutlook: "modest_up",
    entryExpectedReturnPct180: 15,
    entryScenarioJson: scenarioJson,
    horizonDays: 90,
    entryPrice: 10,
    endPrice: 12,
    ...overrides,
  });
}

describe("scoreForecastOutcome", () => {
  it("computes the realized return in percent", () => {
    expect(score({ endPrice: 12 }).realizedReturnPct).toBe(20);
    expect(score({ endPrice: 8 }).realizedReturnPct).toBe(-20);
    expect(score({ endPrice: 10 }).realizedReturnPct).toBe(0);
  });

  it("scores every completed call symmetrically on the 15% and price-band euro rule", () => {
    expect(score({ entryPrice: 44, endPrice: 100 })).toMatchObject({
      absoluteChangeEur: 56,
      meaningfulMove: true,
      meaningfulDirectionHit: true,
    });
    // A directional call without a meaningful move is a miss, not a skip.
    expect(score({ entryPrice: 100, endPrice: 114 })).toMatchObject({
      meaningfulMove: false,
      meaningfulDirectionHit: false,
    });
    // EUR 40 -> 47 is +17.5% and EUR 7: above the EUR 5 floor of its band.
    expect(score({ entryPrice: 40, endPrice: 47 })).toMatchObject({
      meaningfulMove: true,
      meaningfulDirectionHit: true,
    });
    // The same percentage on a EUR 200 card needs EUR 10 of movement.
    expect(score({ entryPrice: 200, endPrice: 208 })).toMatchObject({
      meaningfulMove: false,
      meaningfulDirectionHit: false,
    });
    expect(score({ entryOutlook: "down", entryPrice: 44, endPrice: 100 })).toMatchObject({
      meaningfulMove: true,
      meaningfulDirectionHit: false,
    });
    // Flat is correct exactly when the meaningful move stays away...
    expect(score({ entryOutlook: "flat", entryPrice: 100, endPrice: 106 })).toMatchObject({
      meaningfulMove: false,
      meaningfulDirectionHit: true,
    });
    // ...and wrong on a breakout, mirroring the directional rule.
    expect(score({ entryOutlook: "flat", entryPrice: 44, endPrice: 100 })).toMatchObject({
      meaningfulMove: true,
      meaningfulDirectionHit: false,
    });
  });

  it("scores up outlooks as hits only above the +2pct dead zone", () => {
    expect(score({ entryOutlook: "strong_up", endPrice: 12 }).directionHit).toBe(true);
    expect(score({ entryOutlook: "modest_up", endPrice: 12 }).directionHit).toBe(true);
    // Exactly +2pct is inside the dead zone.
    expect(score({ entryOutlook: "strong_up", endPrice: 10.2 }).directionHit).toBe(false);
    expect(score({ entryOutlook: "modest_up", endPrice: 9 }).directionHit).toBe(false);
  });

  it("scores a down outlook as a hit only below -2pct", () => {
    expect(score({ entryOutlook: "down", endPrice: 9 }).directionHit).toBe(true);
    expect(score({ entryOutlook: "down", endPrice: 9.8 }).directionHit).toBe(false);
    expect(score({ entryOutlook: "down", endPrice: 12 }).directionHit).toBe(false);
  });

  it("gives a flat outlook a +/-7pct tolerance, inclusive", () => {
    expect(score({ entryOutlook: "flat", endPrice: 10.7 }).directionHit).toBe(true);
    expect(score({ entryOutlook: "flat", endPrice: 9.3 }).directionHit).toBe(true);
    expect(score({ entryOutlook: "flat", endPrice: 10.75 }).directionHit).toBe(false);
    expect(score({ entryOutlook: "flat", endPrice: 9.2 }).directionHit).toBe(false);
  });

  it("checks the band against the horizon that matches, bounds inclusive", () => {
    expect(score({ horizonDays: 90, endPrice: 12 }).bandWithin).toBe(true);
    expect(score({ horizonDays: 90, endPrice: 8 }).bandWithin).toBe(true);
    expect(score({ horizonDays: 90, endPrice: 14 }).bandWithin).toBe(true);
    expect(score({ horizonDays: 90, endPrice: 16 }).bandWithin).toBe(false);
    // 16 sits outside d90 [8,14] but inside d180 [7,18].
    expect(score({ horizonDays: 180, endPrice: 16 }).bandWithin).toBe(true);
    expect(score({ horizonDays: 30, endPrice: 12.5 }).bandWithin).toBe(false);
  });

  it("returns a null direction for a null or unknown outlook", () => {
    const nullOutlook = score({ entryOutlook: null });
    expect(nullOutlook.directionHit).toBeNull();
    expect(nullOutlook.realizedReturnPct).toBe(20);
    expect(nullOutlook.bandWithin).toBe(true);
    expect(score({ entryOutlook: "sideways_maybe" }).directionHit).toBeNull();
  });

  it("returns all nulls when the end price is missing", () => {
    expect(score({ endPrice: null })).toEqual({
      realizedReturnPct: null,
      directionHit: null,
      absoluteChangeEur: null,
      meaningfulMove: null,
      meaningfulDirectionHit: null,
      bandWithin: null,
    });
  });

  it("returns nulls for an invalid entry price instead of dividing by zero", () => {
    const result = score({ entryPrice: 0 });
    expect(result.realizedReturnPct).toBeNull();
    expect(result.directionHit).toBeNull();
  });

  it("never throws on malformed or incomplete scenario JSON", () => {
    expect(score({ entryScenarioJson: "{not json" }).bandWithin).toBeNull();
    expect(score({ entryScenarioJson: "null" }).bandWithin).toBeNull();
    expect(score({ entryScenarioJson: '{"points":{}}' }).bandWithin).toBeNull();
    expect(
      score({ entryScenarioJson: '{"points":{"d90":{"low":"8","high":14}}}' }).bandWithin
    ).toBeNull();
    expect(score({ entryScenarioJson: null }).bandWithin).toBeNull();
    // Direction scoring is unaffected by a broken band.
    expect(score({ entryScenarioJson: "{not json" }).directionHit).toBe(true);
  });
});

describe("price-band aware meaningful moves", () => {
  it("scales the euro floor with the entry price while keeping the 15% floor", () => {
    expect(getMeaningfulSignalMove(2)).toEqual({ percent: 15, absolute: 1 });
    expect(getMeaningfulSignalMove(10)).toEqual({ percent: 15, absolute: 2 });
    expect(getMeaningfulSignalMove(40)).toEqual({ percent: 15, absolute: 5 });
    expect(getMeaningfulSignalMove(250)).toEqual({ percent: 15, absolute: 10 });
  });

  it("lets a cheap card produce a meaningful directional verdict", () => {
    expect(score({ entryOutlook: "strong_up", entryPrice: 5, endPrice: 9 })).toMatchObject({
      meaningfulMove: true,
      meaningfulDirectionHit: true,
    });
    expect(score({ entryOutlook: "flat", entryPrice: 5, endPrice: 9 })).toMatchObject({
      meaningfulMove: true,
      meaningfulDirectionHit: false,
    });
  });

  it("still ignores cent-level drift on the cheapest cards", () => {
    expect(score({ entryOutlook: "strong_up", entryPrice: 3, endPrice: 3.6 })).toMatchObject({
      meaningfulMove: false,
      meaningfulDirectionHit: false,
    });
  });

  it("derives the same verdict from stored outcome fields as from prices", () => {
    const fromPrices = score({ entryOutlook: "modest_up", entryPrice: 40, endPrice: 47 });
    const fromFields = evaluateMeaningfulVerdict({
      entryOutlook: "modest_up",
      entryPrice: 40,
      realizedReturnPct: fromPrices.realizedReturnPct,
      absoluteChangeEur: fromPrices.absoluteChangeEur,
      directionHit: fromPrices.directionHit,
    });

    expect(fromFields).toEqual({
      meaningfulMove: fromPrices.meaningfulMove,
      meaningfulDirectionHit: fromPrices.meaningfulDirectionHit,
    });
    expect(fromFields.meaningfulMove).toBe(true);
  });
});

describe("forecast target display list", () => {
  it("derives one shared target list from the publish gates", () => {
    expect(FORECAST_TARGET_DISPLAY.map((target) => target.key)).toEqual([
      "1.5x-30d",
      "1.5x-90d",
      "2x-90d",
      "3x-180d",
    ]);
    expect(FORECAST_TARGET_DISPLAY.map((target) => target.minimumSamples)).toEqual([
      40, 50, 100, 200,
    ]);
    expect(FORECAST_TARGET_DISPLAY[0]).toMatchObject({
      multiplierLabel: "1.5x",
      horizonDays: 30,
      horizonLabel: "30 days",
    });
  });
});
