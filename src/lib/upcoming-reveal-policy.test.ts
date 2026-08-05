import { describe, expect, it } from "vitest";
import { shouldShowUpcomingSourceReveal } from "@/lib/upcoming-reveal-policy";

describe("shouldShowUpcomingSourceReveal", () => {
  it("hides exact matches to released cards", () => {
    expect(shouldShowUpcomingSourceReveal({
      hasExactLibraryMatch: true,
      releasedNameMatchCount: 0,
      episodeName: "Delta Reign / Storm Emeralda",
    })).toBe(false);
  });

  it("hides name matches in explicit promo reprint galleries", () => {
    expect(shouldShowUpcomingSourceReveal({
      hasExactLibraryMatch: false,
      releasedNameMatchCount: 12,
      episodeName: "30th Celebration Promos",
    })).toBe(false);
  });

  it("keeps new artwork from normal upcoming set galleries", () => {
    expect(shouldShowUpcomingSourceReveal({
      hasExactLibraryMatch: false,
      releasedNameMatchCount: 12,
      episodeName: "Delta Reign / Storm Emeralda",
    })).toBe(true);
  });
});
