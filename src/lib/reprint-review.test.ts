import { describe, expect, it } from "vitest";
import { collapseReprintReviewCandidates } from "@/lib/reprint-review";

const candidate = (sourceCardId: string, targetCardId: string, value: string) => ({
  sourceCardId,
  targetCardId,
  value,
});

describe("reprint review grouping", () => {
  it("shows an exact pair only once even when both relation directions exist", () => {
    expect(collapseReprintReviewCandidates({
      candidates: [candidate("a", "b", "forward"), candidate("b", "a", "reverse")],
      confirmedPairs: [],
      decisions: [],
    })).toEqual(["forward"]);
  });

  it("shows only one comparison between already-confirmed reprint groups", () => {
    expect(collapseReprintReviewCandidates({
      candidates: [
        candidate("a", "c", "a-to-c"),
        candidate("b", "c", "b-to-c"),
        candidate("a", "d", "a-to-d"),
      ],
      confirmedPairs: [{ sourceCardId: "a", targetCardId: "b" }],
      decisions: [],
    })).toEqual(["a-to-c", "a-to-d"]);
  });

  it("uses approved decisions to merge groups and hides internal comparisons", () => {
    expect(collapseReprintReviewCandidates({
      candidates: [
        candidate("a", "b", "already-approved"),
        candidate("a", "c", "first-cross-pair"),
        candidate("b", "c", "redundant-cross-pair"),
      ],
      confirmedPairs: [],
      decisions: [{ sourceCardId: "a", targetCardId: "b", decision: "include" }],
    })).toEqual(["first-cross-pair"]);
  });

  it("applies one rejection to every redundant comparison between two groups", () => {
    expect(collapseReprintReviewCandidates({
      candidates: [
        candidate("a", "c", "excluded"),
        candidate("b", "d", "also-excluded"),
        candidate("a", "e", "different-group"),
      ],
      confirmedPairs: [
        { sourceCardId: "a", targetCardId: "b" },
        { sourceCardId: "c", targetCardId: "d" },
      ],
      decisions: [{ sourceCardId: "a", targetCardId: "c", decision: "exclude" }],
    })).toEqual(["different-group"]);
  });
});
