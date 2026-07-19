import { describe, expect, it } from "vitest";
import {
  getCollectionCardAddedEffects,
  rememberCollectionCardAdded,
  resolveCollectionCardOwnedState,
} from "./collection-client-events";

describe("collection card client effects", () => {
  it("marks a normal collection addition as owned and removes an existing want", () => {
    expect(
      getCollectionCardAddedEffects({ cardId: "card-1", destination: "collection" })
    ).toEqual({
      markOwned: true,
      removeWant: true,
      collectionCountDelta: 1,
      forSaleCountDelta: 0,
    });
  });

  it("keeps wants and owned state intact when a copy is saved for sale", () => {
    expect(
      getCollectionCardAddedEffects({ cardId: "card-1", destination: "for-sale" })
    ).toEqual({
      markOwned: false,
      removeWant: false,
      collectionCountDelta: 0,
      forSaleCountDelta: 1,
    });
  });

  it("keeps a normal quick add owned across a remount with stale server data", () => {
    const detail = { cardId: "remounted-owned-card", destination: "collection" } as const;

    rememberCollectionCardAdded(detail);

    expect(resolveCollectionCardOwnedState(detail.cardId, false)).toBe(true);
  });

  it("does not cache for-sale copies as owned across a remount", () => {
    const detail = { cardId: "remounted-for-sale-card", destination: "for-sale" } as const;

    rememberCollectionCardAdded(detail);

    expect(resolveCollectionCardOwnedState(detail.cardId, false)).toBe(false);
  });
});
