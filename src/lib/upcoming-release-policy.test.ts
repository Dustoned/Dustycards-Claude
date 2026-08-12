import { describe, expect, it } from "vitest";
import {
  isRelevantUpcomingReleaseDate,
  isUnreleasedUpcomingSingleDate,
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

  it("keeps only genuinely upcoming singles once a release date is known", () => {
    const today = "2026-08-12";

    expect(isUnreleasedUpcomingSingleDate("2026-09-16", today)).toBe(true);
    expect(isUnreleasedUpcomingSingleDate(null, today)).toBe(true);
    expect(isUnreleasedUpcomingSingleDate("2026-08-12", today)).toBe(false);
    expect(isUnreleasedUpcomingSingleDate("2026-07-17", today)).toBe(false);
  });
});
