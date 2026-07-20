import { describe, expect, it } from "vitest";
import { buildCompleteCollectionPayload } from "@/lib/complete-collection-payload";
import type { CollectionOverviewData } from "@/lib/collection-data";

function card(id: string, gradingCompany: string | null, gradingGrade: string | null) {
  return {
    card_id: id,
    grading_company: gradingCompany,
    grading_grade: gradingGrade,
  };
}

describe("buildCompleteCollectionPayload", () => {
  it("sends each loose card once and omits unrelated overview payloads", () => {
    const data = {
      looseSingles: [card("raw", null, null), card("graded", "PSA", "10")],
      binderCards: [card("binder", null, null)],
      sealed: [{ id: "sealed" }],
      binders: [{ id: "binder-summary" }],
      cards: [card("duplicate-full-list", null, null)],
      valueDrivers: { gains: [{ id: "large-unrelated-data" }] },
    } as unknown as CollectionOverviewData;

    const payload = buildCompleteCollectionPayload(data);

    expect(payload.gradedLooseSingles.map((item) => item.card_id)).toEqual(["graded"]);
    expect(payload.rawLooseSingles.map((item) => item.card_id)).toEqual(["raw"]);
    expect(payload.binderCards.map((item) => item.card_id)).toEqual(["binder"]);
    expect(Object.keys(payload).sort()).toEqual([
      "binderCards",
      "binders",
      "gradedLooseSingles",
      "rawLooseSingles",
      "sealed",
    ]);
  });
});
