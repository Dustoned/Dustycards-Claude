import { describe, expect, it } from "vitest";
import { groupMoverVariantsByCard } from "./MoversBrowser.utils";

describe("groupMoverVariantsByCard", () => {
  it("renders one physical card group with all distinct grade targets", () => {
    const groups = groupMoverVariantsByCard([
      { cardId: "gardevoir", gradedLabel: "PSA 9", source: "graded" as const },
      { cardId: "gardevoir", gradedLabel: "CGC 10", source: "graded" as const },
      { cardId: "charizard", gradedLabel: "PSA 10", source: "graded" as const },
      { cardId: "gardevoir", gradedLabel: "BGS 9", source: "graded" as const },
    ]);

    expect(groups.map((group) => group.cardId)).toEqual(["gardevoir", "charizard"]);
    expect(groups[0]?.variants.map((variant) => variant.gradedLabel)).toEqual([
      "PSA 9",
      "CGC 10",
      "BGS 9",
    ]);
    expect(groups[1]?.variants).toEqual([
      { cardId: "charizard", gradedLabel: "PSA 10", source: "graded" },
    ]);
  });

  it("preserves the sorted representative and removes duplicate grade rows", () => {
    const first = {
      cardId: "gardevoir",
      gradedLabel: "CGC 10",
      source: "graded" as const,
      score: 100,
    };
    const groups = groupMoverVariantsByCard([
      first,
      { cardId: "gardevoir", gradedLabel: " cgc 10 ", source: "graded" as const, score: 92 },
      { cardId: "gardevoir", gradedLabel: "PSA 9", source: "graded" as const, score: 91 },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.variants).toHaveLength(2);
    expect(groups[0]?.variants[0]).toBe(first);
  });

  it("keeps an equally named variant when it comes from another market source", () => {
    const groups = groupMoverVariantsByCard([
      { cardId: "gardevoir", gradedLabel: "PSA 10", source: "graded" as const },
      { cardId: "gardevoir", gradedLabel: "PSA 10", source: "cardmarket" as const },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.variants.map((variant) => variant.source)).toEqual([
      "graded",
      "cardmarket",
    ]);
  });
});
