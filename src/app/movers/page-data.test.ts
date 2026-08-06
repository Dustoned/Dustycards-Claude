import { describe, expect, it } from "vitest";
import { applyMoverOwnedCounts } from "@/app/movers/page-data";
import type { CollectionMoverItem, CollectionMoversData } from "@/lib/movers";

function mover(cardId: string, ownedCount: number): CollectionMoverItem {
  return { cardId, ownedCount } as CollectionMoverItem;
}

describe("applyMoverOwnedCounts", () => {
  it("personalizes every shared snapshot section without mutating the base snapshot", () => {
    const sharedMover = mover("card-1", 99);
    const unownedMover = mover("card-2", 99);
    const snapshot = {
      movers: [sharedMover, unownedMover],
      topOpportunities: [sharedMover],
      cheapestHighRarityMovers: [sharedMover],
      discountedHighRarity: [unownedMover],
      suddenDropDeals: [unownedMover],
      strongest7d: sharedMover,
      strongest30d: unownedMover,
    } as CollectionMoversData;

    const personalized = applyMoverOwnedCounts(
      snapshot,
      new Map([["card-1", 3]])
    );

    expect(personalized.movers.map((item) => item.ownedCount)).toEqual([3, 0]);
    expect(personalized.topOpportunities[0]?.ownedCount).toBe(3);
    expect(personalized.cheapestHighRarityMovers[0]?.ownedCount).toBe(3);
    expect(personalized.discountedHighRarity[0]?.ownedCount).toBe(0);
    expect(personalized.suddenDropDeals[0]?.ownedCount).toBe(0);
    expect(personalized.strongest7d?.ownedCount).toBe(3);
    expect(personalized.strongest30d?.ownedCount).toBe(0);
    expect(sharedMover.ownedCount).toBe(99);
    expect(unownedMover.ownedCount).toBe(99);
  });
});
