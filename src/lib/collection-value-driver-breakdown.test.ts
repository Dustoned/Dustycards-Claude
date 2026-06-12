import { describe, expect, it } from "vitest";
import { buildValueDriverSourceBreakdown } from "./collection-data";

describe("value driver source breakdown", () => {
  it("sums changes per source and sorts by impact", () => {
    const breakdown = buildValueDriverSourceBreakdown([
      { currentSource: "Raw", change: 10 },
      { currentSource: "Raw", change: -2.5 },
      { currentSource: "Graded", change: -12 },
      { currentSource: "Sealed", change: 3 },
    ]);

    expect(breakdown).toEqual([
      { source: "Graded", change: -12 },
      { source: "Raw", change: 7.5 },
      { source: "Sealed", change: 3 },
    ]);
  });

  it("drops sources that net out to zero", () => {
    const breakdown = buildValueDriverSourceBreakdown([
      { currentSource: "Raw", change: 5 },
      { currentSource: "Raw", change: -5 },
      { currentSource: "Sealed", change: 1 },
    ]);

    expect(breakdown).toEqual([{ source: "Sealed", change: 1 }]);
  });

  it("returns empty for no drivers", () => {
    expect(buildValueDriverSourceBreakdown([])).toEqual([]);
  });
});
