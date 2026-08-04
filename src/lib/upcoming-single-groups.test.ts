import { describe, expect, it } from "vitest";
import type { UpcomingSingleItem } from "@/lib/upcoming-releases";
import { groupUpcomingSingles } from "@/lib/upcoming-single-groups";

function single(set: string, number: number, name = `Card ${number}`): UpcomingSingleItem {
  return {
    id: `${set}:${number}:${name}`,
    cardId: null,
    name,
    imageUrl: `https://example.com/${number}.webp`,
    cardNumber: String(number).padStart(3, "0"),
    rarity: null,
    version: null,
    episodeId: null,
    episodeName: set,
    episodeCode: null,
    releaseDate: "2026-11-06",
    status: "reveal",
    headline: null,
    sourceName: "Source",
    sourceUrl: "https://example.com/source",
    observedAt: null,
  };
}

describe("upcoming single groups", () => {
  it("recognizes a near-complete numbered set and sorts its cards numerically", () => {
    const cards = Array.from({ length: 80 }, (_, index) => single("Complete Set", 80 - index));
    const [group] = groupUpcomingSingles(cards);

    expect(group.nearComplete).toBe(true);
    expect(group.coverage).toBe(1);
    expect(group.items[0].cardNumber).toBe("080");
    expect(group.items.at(-1)?.cardNumber).toBe("001");
  });

  it("does not call a partial high-number gallery complete", () => {
    const cards = Array.from({ length: 52 }, (_, index) => single("Partial Set", 118 + index));
    const [group] = groupUpcomingSingles(cards);

    expect(group.numberingCeiling).toBe(169);
    expect(group.coverage).toBeLessThan(0.4);
    expect(group.nearComplete).toBe(false);
  });

  it("uses one card per set number and prefers an official confirmation", () => {
    const community = single("Promos", 108, "Espeon ex reveal");
    const official = {
      ...single("Promos", 108, "Espeon ex"),
      id: "official:108",
      status: "confirmed" as const,
      sourceName: "Pokemon.com",
    };
    const [group] = groupUpcomingSingles([community, official]);

    expect(group.items).toHaveLength(1);
    expect(group.items[0]).toMatchObject({ name: "Espeon ex", status: "confirmed" });
  });
});
