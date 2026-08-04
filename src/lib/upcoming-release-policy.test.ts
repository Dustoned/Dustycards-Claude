import { describe, expect, it } from "vitest";
import {
  isRelevantUpcomingReleaseDate,
  upcomingRecentReleaseFloor,
} from "@/lib/upcoming-release-policy";

describe("upcoming release policy", () => {
  it("keeps future and recently released sets but rejects archive releases", () => {
    const floor = upcomingRecentReleaseFloor(new Date("2026-08-04T12:00:00.000Z"));

    expect(floor).toBe("2026-06-20");
    expect(isRelevantUpcomingReleaseDate("2026-11-06", floor)).toBe(true);
    expect(isRelevantUpcomingReleaseDate("2026-06-20", floor)).toBe(true);
    expect(isRelevantUpcomingReleaseDate("2026-06-19", floor)).toBe(false);
    expect(isRelevantUpcomingReleaseDate("2019-11-01", floor)).toBe(false);
    expect(isRelevantUpcomingReleaseDate(null, floor)).toBe(false);
  });
});
