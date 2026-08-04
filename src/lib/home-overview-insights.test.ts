import { describe, expect, it } from "vitest";
import type { CollectionOverviewData } from "@/lib/collection-data";
import { buildHomeOverviewInsights } from "@/lib/home-overview-insights";

const EMPTY_DRIVERS: CollectionOverviewData["valueDrivers"] = {
  latestDate: null,
  latestLabel: null,
  previousDate: null,
  previousLabel: null,
  totalChange: null,
  gainsTotal: 0,
  dropsTotal: 0,
  sourceBreakdown: [],
  gains: [],
  drops: [],
};

describe("buildHomeOverviewInsights", () => {
  it("returns compact allocation totals without needing every card on the Home document", () => {
    const rawLoose = {
      current_value: 12.5,
      grading_company: null,
      grading_grade: null,
    } as CollectionOverviewData["cards"][number];
    const rawBinder = {
      current_value: 20,
      grading_company: null,
      grading_grade: null,
    } as CollectionOverviewData["cards"][number];
    const gradedBinder = {
      current_value: 70,
      grading_company: "PSA",
      grading_grade: "10",
    } as CollectionOverviewData["cards"][number];
    const data = {
      cards: [rawLoose, rawBinder, gradedBinder],
      looseSingles: [rawLoose],
      binderCards: [rawBinder, gradedBinder],
      sealed: [{ quantity: 2, current_value_per_item: 30 }],
      valueDrivers: EMPTY_DRIVERS,
    } as CollectionOverviewData;

    const result = buildHomeOverviewInsights(data);

    expect(result.allocation).toEqual([
      expect.objectContaining({ key: "loose-raw", itemCount: 1, value: 12.5 }),
      expect.objectContaining({ key: "binder-raw", itemCount: 1, value: 20 }),
      expect.objectContaining({ key: "graded", itemCount: 1, value: 70 }),
      expect.objectContaining({ key: "sealed", itemCount: 2, value: 60 }),
    ]);
  });
});
