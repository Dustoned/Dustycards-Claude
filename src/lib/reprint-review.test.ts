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

  it("retires both complete groups after an approved decision", () => {
    expect(collapseReprintReviewCandidates({
      candidates: [
        candidate("a", "b", "already-approved"),
        candidate("a", "c", "reviewed-source"),
        candidate("b", "d", "reviewed-target"),
        candidate("e", "f", "untouched"),
      ],
      confirmedPairs: [],
      decisions: [{ sourceCardId: "a", targetCardId: "b", decision: "include" }],
    })).toEqual(["untouched"]);
  });

  it("retires both sides after a rejection instead of offering new pairings", () => {
    expect(collapseReprintReviewCandidates({
      candidates: [
        candidate("a", "c", "excluded"),
        candidate("b", "d", "also-excluded"),
        candidate("a", "e", "reviewed-source"),
        candidate("c", "f", "reviewed-target"),
        candidate("g", "h", "untouched"),
      ],
      confirmedPairs: [
        { sourceCardId: "a", targetCardId: "b" },
        { sourceCardId: "c", targetCardId: "d" },
      ],
      decisions: [{ sourceCardId: "a", targetCardId: "c", decision: "exclude" }],
    })).toEqual(["untouched"]);
  });

  it("retires every confirmed reprint of a reviewed card", () => {
    expect(collapseReprintReviewCandidates({
      candidates: [
        candidate("confirmed-copy", "new-card", "same-group-resurfaced"),
        candidate("fresh-a", "fresh-b", "untouched"),
      ],
      confirmedPairs: [{ sourceCardId: "reviewed-card", targetCardId: "confirmed-copy" }],
      decisions: [{ sourceCardId: "reviewed-card", targetCardId: "other-card", decision: "exclude" }],
    })).toEqual(["untouched"]);
  });
});
