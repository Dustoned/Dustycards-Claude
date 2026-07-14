import { describe, expect, it } from "vitest";
import { buildAttachedBasePrediction } from "@/lib/signal-price-history";

describe("attached Signal Radar prediction", () => {
  it("starts at the latest observed value and keeps only sorted base targets", () => {
    const result = buildAttachedBasePrediction({
      history: [
        { date: "2026-06-01", label: "Jun 1", value: 80 },
        { date: "2026-07-01", label: "Jul 1", value: 100 },
      ],
      currentPrice: 95,
      points: [
        { days: 180, base: 140 },
        { days: 30, base: 110 },
        { days: 90, base: 125 },
      ],
      modelDate: "2026-07-01T12:00:00.000Z",
    });

    expect(result).toEqual([
      { date: "2026-07-01", label: "Jul 1", value: 100 },
      { date: "2026-07-31", label: "30d", value: 110 },
      { date: "2026-09-29", label: "90d", value: 125 },
      { date: "2026-12-28", label: "180d", value: 140 },
    ]);
  });

  it("uses the current market price only when no valid history exists", () => {
    const result = buildAttachedBasePrediction({
      history: [{ date: "invalid", label: "Broken", value: 9001 }],
      currentPrice: 25,
      points: [{ days: 30, base: 27 }],
      modelDate: new Date("2026-07-13T12:00:00.000Z"),
    });

    expect(result).toEqual([
      { date: "2026-07-13", label: "Now", value: 25 },
      { date: "2026-08-12", label: "30d", value: 27 },
    ]);
  });

  it("bridges stale observed history to model-now before the forecast horizons", () => {
    const result = buildAttachedBasePrediction({
      history: [{ date: "2026-05-17", label: "May 17", value: 300 }],
      currentPrice: 290,
      modelDate: "2026-07-13T12:00:00.000Z",
      points: [
        { days: 30, base: 280 },
        { days: 180, base: 250 },
      ],
    });

    expect(result).toEqual([
      { date: "2026-05-17", label: "May 17", value: 300 },
      { date: "2026-07-13", label: "Now", value: 290 },
      { date: "2026-08-12", label: "30d", value: 280 },
      { date: "2027-01-09", label: "180d", value: 250 },
    ]);
  });

  it("does not manufacture a forecast without a usable anchor price", () => {
    expect(
      buildAttachedBasePrediction({
        history: [],
        currentPrice: null,
        points: [{ days: 30, base: 5 }],
      })
    ).toEqual([]);
  });
});
