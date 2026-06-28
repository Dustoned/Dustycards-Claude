import { describe, expect, it } from "vitest";
import { isValueDriverBaselineTooOld } from "./collection-data";

// Window is 2 days; baseline date is the previous chart point (e.g. Jun 26),
// minBaselineDate is 2 days before that (Jun 24). A baseline snapshot older
// than Jun 24 means the "change" really spans a longer, unknown period.
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
