import { describe, expect, it } from "vitest";
import {
  getUpcomingCardHref,
  isExactUpcomingLibraryReference,
  resolveUpcomingLibraryReferenceKind,
} from "@/lib/upcoming-card-links";

describe("upcoming card links", () => {
  it("treats a unique name-and-number match as an exact set-number match", () => {
    expect(resolveUpcomingLibraryReferenceKind({
      storedMethod: null,
      hasUniqueNumberMatch: true,
    })).toBe("set-number");
  });

  it("keeps ambiguous same-name printings searchable and clickable", () => {
    const reference = {
      kind: "name" as const,
      count: 10,
      href: "/search?q=Mew%20ex",
      label: "10 released printings found",
    };
    expect(isExactUpcomingLibraryReference(reference)).toBe(false);
    expect(getUpcomingCardHref({
      episodeId: null,
      cardId: null,
      libraryReference: reference,
    })).toBe("/search?q=Mew%20ex");
  });

  it("prefers the exact card detail route", () => {
    expect(getUpcomingCardHref({
      episodeId: "431",
      cardId: "card-168",
      libraryReference: null,
    })).toBe("/expansions/431?card=card-168");
  });
});
