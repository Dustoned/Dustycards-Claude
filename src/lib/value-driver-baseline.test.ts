import { describe, expect, it } from "vitest";
import {
  COLLECTION_VALUE_DRIVER_WINDOW_DAYS,
  isValueDriverBaselineTooOld,
  pickValueDriverWindowStartDate,
} from "./collection-data";

// The weekly anchor can use a baseline snapshot up to two days before its
// selected date. Anything older spans a longer, unknown period.
describe("isValueDriverBaselineTooOld", () => {
  const minBaselineDate = "2026-06-24";

  it("keeps a card whose baseline snapshot is within the window", () => {
    expect(isValueDriverBaselineTooOld("2026-06-26", minBaselineDate)).toBe(false);
    expect(isValueDriverBaselineTooOld("2026-06-24", minBaselineDate)).toBe(false);
  });

  it("drops a card whose baseline snapshot predates the window", () => {
    // The stale-baseline case: a move captured against a much older snapshot.
    expect(isValueDriverBaselineTooOld("2026-06-23", minBaselineDate)).toBe(true);
    expect(isValueDriverBaselineTooOld("2026-06-10", minBaselineDate)).toBe(true);
  });

  it("drops a card with no baseline snapshot at all", () => {
    expect(isValueDriverBaselineTooOld(null, minBaselineDate)).toBe(true);
    expect(isValueDriverBaselineTooOld(undefined, minBaselineDate)).toBe(true);
  });
});

describe("pickValueDriverWindowStartDate", () => {
  it("selects the date closest to seven days before the latest snapshot", () => {
    expect(COLLECTION_VALUE_DRIVER_WINDOW_DAYS).toBe(7);
    expect(
      pickValueDriverWindowStartDate(
        ["2026-07-14", "2026-07-13", "2026-07-09", "2026-07-08", "2026-07-07"],
        "2026-07-14"
      )
    ).toBe("2026-07-07");
  });

  it("allows a missing snapshot within the two-day weekly-anchor tolerance", () => {
    expect(
      pickValueDriverWindowStartDate(
        ["2026-07-14", "2026-07-13", "2026-07-09", "2026-07-08"],
        "2026-07-14"
      )
    ).toBe("2026-07-08");
  });

  it("rejects short-term and older snapshots as a weekly baseline", () => {
    expect(
      pickValueDriverWindowStartDate(
        ["2026-07-14", "2026-07-10", "2026-07-06"],
        "2026-07-14"
      )
    ).toBeNull();
  });
});
