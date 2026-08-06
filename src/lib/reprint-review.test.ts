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

  it("does not hide distinct cards merely because they share confirmed groups", () => {
    expect(collapseReprintReviewCandidates({
      candidates: [
        candidate("a", "c", "a-to-c"),
        candidate("b", "c", "b-to-c"),
        candidate("a", "d", "a-to-d"),
      ],
      confirmedPairs: [{ sourceCardId: "a", targetCardId: "b" }],
      decisions: [],
    })).toEqual(["a-to-c", "b-to-c", "a-to-d"]);
  });

  it("retires only the approved pair while keeping other pairings", () => {
    expect(collapseReprintReviewCandidates({
      candidates: [
        candidate("a", "b", "already-approved"),
        candidate("a", "c", "reviewed-source"),
        candidate("b", "d", "reviewed-target"),
        candidate("e", "f", "untouched"),
      ],
      confirmedPairs: [],
      decisions: [{ sourceCardId: "a", targetCardId: "b", decision: "include" }],
    })).toEqual(["reviewed-source", "reviewed-target", "untouched"]);
  });

  it("keeps other exact cards from confirmed groups after a rejection", () => {
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
    })).toEqual(["also-excluded", "reviewed-source", "reviewed-target", "untouched"]);
  });

  it("does not retire a different card from the reviewed card's confirmed group", () => {
    expect(collapseReprintReviewCandidates({
      candidates: [
        candidate("confirmed-copy", "new-card", "same-group-resurfaced"),
        candidate("fresh-a", "fresh-b", "untouched"),
      ],
      confirmedPairs: [{ sourceCardId: "reviewed-card", targetCardId: "confirmed-copy" }],
      decisions: [{ sourceCardId: "reviewed-card", targetCardId: "other-card", decision: "exclude" }],
    })).toEqual(["same-group-resurfaced", "untouched"]);
  });

  it("never returns a decided pair with source and candidate reversed", () => {
    expect(collapseReprintReviewCandidates({
      candidates: [
        candidate("b", "a", "reversed-decision"),
        candidate("a", "c", "different-pair"),
      ],
      confirmedPairs: [],
      decisions: [{ sourceCardId: "a", targetCardId: "b", decision: "exclude" }],
    })).toEqual(["different-pair"]);
  });
});
