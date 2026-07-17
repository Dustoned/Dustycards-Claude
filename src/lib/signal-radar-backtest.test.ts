import { describe, expect, it } from "vitest";

import type { DailyMarketValue } from "@/lib/robust-price-history";
import {
  backtestDirectionHit,
  buildBacktestInputsAt,
  runCardBacktest,
  summarizeBacktest,
  type BacktestPrediction,
} from "@/lib/signal-radar-backtest";

const DAY_MS = 86_400_000;
const START = Date.parse("2023-01-01T00:00:00.000Z");

function series(days: number, valueAt: (dayIndex: number) => number): DailyMarketValue[] {
  return Array.from({ length: days }, (_, index) => ({
    day: new Date(START + index * DAY_MS),
    value: valueAt(index),
  }));
}

function prediction(overrides: Partial<BacktestPrediction>): BacktestPrediction {
  return {
    asOfDay: "2024-01-01",
    horizonDays: 90,
    entryPrice: 100,
    confidence: "High",
    outlook: "modest_up",
    predictedLow: 90,
    predictedBase: 105,
    predictedHigh: 120,
    predictedBasePct: 5,
    realizedPrice: 110,
    realizedReturnPct: 10,
    directionHit: true,
    bandWithin: true,
    absErrorPct: 5,
    ...overrides,
  };
}

describe("signal radar backtest", () => {
  it("computes extended features without future leakage", () => {
    const flat = series(200, () => 50);
    const flatInputs = buildBacktestInputsAt(flat, flat.length - 1);

    expect(flatInputs).not.toBeNull();
    expect(flatInputs?.currentPrice).toBe(50);
    expect(flatInputs?.extendedHistory.volatilityDaily90Pct).toBe(0);
    expect(flatInputs?.extendedHistory.athDistancePct).toBe(0);
    // 199 days of span is below the 365d coverage requirement.
    expect(flatInputs?.extendedHistory.momentum365Pct).toBeNull();
    expect(flatInputs?.extendedHistory.jpLeadLagPct).toBeNull();
    expect(flatInputs?.extendedHistory.setRelativeStrength90Pct).toBeNull();
    expect(flatInputs?.extendedHistory.avg30AnchorGapPct).toBeNull();
  });

  it("scores up-predictions as hits on a steady riser", () => {
    const riser = series(700, (index) => 100 * 1.0015 ** index);
    const results = runCardBacktest(riser);
    const summary = summarizeBacktest([results]);

    expect(results.length).toBeGreaterThan(10);
    expect(results.every((item) => item.outlook === "modest_up")).toBe(true);
    expect(results.every((item) => item.directionHit === true)).toBe(true);
    expect(summary.byOutlook.modest_up.samples).toBe(results.length);
    expect(summary.byOutlook.modest_up.directionHitRate).toBe(1);
    expect(summary.byOutlook.modest_up.meanRealizedPct ?? 0).toBeGreaterThan(10);
    expect(summary.byOutlook.strong_up.samples).toBe(0);
    expect(summary.byOutlook.down.samples).toBe(0);

    const inputs = buildBacktestInputsAt(riser, riser.length - 1);
    expect(inputs?.extendedHistory.athDistancePct).toBe(0);
    expect(inputs?.extendedHistory.momentum365Pct ?? 0).toBeGreaterThan(30);
  });

  it("classifies a tight mean-reverter as flat and keeps it inside the band", () => {
    const reverter = series(
      700,
      (index) => 100 + 2 * Math.sin((2 * Math.PI * index) / 30)
    );
    const results = runCardBacktest(reverter);
    const summary = summarizeBacktest([results]);

    expect(results.length).toBeGreaterThan(10);
    expect(results.every((item) => item.outlook === "flat")).toBe(true);
    expect(summary.byOutlook.flat.directionHitRate).toBe(1);
    expect(summary.byOutlook.flat.bandCoverage).toBe(1);
    // Flat scenarios keep the base line at the entry price; only euro
    // rounding of the base point remains.
    expect(Math.abs(summary.byOutlook.flat.meanPredictedPct ?? 99)).toBeLessThan(0.5);
  });

  it("measures a volatile chopper without crashing the harness", () => {
    const chopper = series(700, (index) => (index % 2 === 0 ? 122 : 100));
    const inputs = buildBacktestInputsAt(chopper, chopper.length - 1);

    expect(inputs?.extendedHistory.volatilityDaily90Pct ?? 0).toBeGreaterThan(15);
    // The last value (100) sits 18% under the 122 all-time high.
    expect(inputs?.extendedHistory.athDistancePct).toBe(-18);
    expect(inputs?.extendedHistory.momentum365Pct).not.toBeNull();

    const results = runCardBacktest(chopper);
    expect(Array.isArray(results)).toBe(true);
    expect(results.every((item) => item.realizedReturnPct != null)).toBe(true);
  });

  it("mirrors the pinned direction-hit semantics", () => {
    expect(backtestDirectionHit("strong_up", 2.1)).toBe(true);
    expect(backtestDirectionHit("modest_up", 2)).toBe(false);
    expect(backtestDirectionHit("down", -2.1)).toBe(true);
    expect(backtestDirectionHit("down", 2)).toBe(false);
    expect(backtestDirectionHit("flat", 7)).toBe(true);
    expect(backtestDirectionHit("flat", -7.1)).toBe(false);
    expect(backtestDirectionHit(null, 10)).toBeNull();
    expect(backtestDirectionHit("flat", null)).toBeNull();
  });

  it("aggregates per-outlook summary math exactly", () => {
    const hit = prediction({
      realizedReturnPct: 10,
      directionHit: true,
      bandWithin: true,
      absErrorPct: 5,
    });
    const miss = prediction({
      realizedReturnPct: -3,
      realizedPrice: 97,
      directionHit: false,
      bandWithin: false,
      absErrorPct: 8,
    });
    const unresolved = prediction({
      outlook: "flat",
      predictedBasePct: 0,
      realizedPrice: null,
      realizedReturnPct: null,
      directionHit: null,
      bandWithin: null,
      absErrorPct: null,
    });
    const summary = summarizeBacktest([[hit, miss], [unresolved]]);

    expect(summary.totalPredictions).toBe(3);
    expect(summary.scoredPredictions).toBe(2);
    expect(summary.byOutlook.modest_up).toEqual({
      samples: 2,
      directionHitRate: 0.5,
      bandCoverage: 0.5,
      meanAbsErrorPct: 6.5,
      meanPredictedPct: 5,
      meanRealizedPct: 3.5,
    });
    expect(summary.byOutlook.flat.samples).toBe(0);
    expect(summary.byOutlook.flat.directionHitRate).toBeNull();
    expect(summary.byOutlook.flat.meanAbsErrorPct).toBeNull();
  });
});
