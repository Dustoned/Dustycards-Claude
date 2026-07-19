import { describe, expect, it } from "vitest";
import {
  getCachedWantState,
  rememberWantState,
  resolveWantState,
} from "./wants-client-events";

describe("wants client state", () => {
  it("keeps the latest state for a card when a button remounts with stale server data", () => {
    const cardId = "remounted-card";
    const addedItem = { id: "want-42", created_at: "2026-07-19T12:00:00.000Z" };

    expect(getCachedWantState(cardId)).toBeUndefined();

    rememberWantState({ cardId, wanted: true, item: addedItem });

    expect(getCachedWantState(cardId)).toEqual({
      cardId,
      wanted: true,
      item: addedItem,
    });
    expect(resolveWantState(cardId, { wanted: false, itemId: null })).toEqual({
      wanted: true,
      itemId: addedItem.id,
    });

    rememberWantState({ cardId, wanted: false, item: null });

    expect(getCachedWantState(cardId)).toEqual({ cardId, wanted: false, item: null });
    expect(resolveWantState(cardId, { wanted: true, itemId: "stale-server-item" })).toEqual({
      wanted: false,
      itemId: null,
    });
  });
});
