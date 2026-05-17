import { describe, expect, it } from "vitest";
import {
  WANT_SOURCE_BINDER_MISSING,
  WANT_SOURCE_MANUAL,
  buildMissingBinderWantSyncPlan,
} from "@/lib/wantlist-planner";

const linkedEpisodeIds = ["set-1"];
const setCards = [
  { id: "card-1", episodeId: "set-1" },
  { id: "card-2", episodeId: "set-1" },
  { id: "card-3", episodeId: "set-1" },
];

describe("wantlist planner sync plan", () => {
  it("creates wants for missing linked binder cards", () => {
    const plan = buildMissingBinderWantSyncPlan({
      linkedEpisodeIds,
      setCards,
      ownedCardIds: ["card-1"],
      existingWants: [],
    });

    expect(plan.create).toEqual([
      { cardId: "card-2", episodeId: "set-1" },
      { cardId: "card-3", episodeId: "set-1" },
    ]);
  });

  it("does not duplicate manual wants", () => {
    const plan = buildMissingBinderWantSyncPlan({
      linkedEpisodeIds,
      setCards,
      ownedCardIds: ["card-1"],
      existingWants: [
        {
          id: "want-2",
          cardId: "card-2",
          source: WANT_SOURCE_MANUAL,
          sourceEpisodeId: null,
          dismissedAt: null,
        },
      ],
    });

    expect(plan.create).toEqual([{ cardId: "card-3", episodeId: "set-1" }]);
  });

  it("skips owned cards and removes stale auto wants for owned cards", () => {
    const plan = buildMissingBinderWantSyncPlan({
      linkedEpisodeIds,
      setCards,
      ownedCardIds: ["card-1", "card-2"],
      existingWants: [
        {
          id: "want-2",
          cardId: "card-2",
          source: WANT_SOURCE_BINDER_MISSING,
          sourceEpisodeId: "set-1",
          dismissedAt: null,
        },
      ],
    });

    expect(plan.create).toEqual([{ cardId: "card-3", episodeId: "set-1" }]);
    expect(plan.deleteStaleIds).toEqual(["want-2"]);
  });

  it("respects dismissed hidden wants", () => {
    const plan = buildMissingBinderWantSyncPlan({
      linkedEpisodeIds,
      setCards,
      ownedCardIds: ["card-1"],
      existingWants: [
        {
          id: "want-2",
          cardId: "card-2",
          source: WANT_SOURCE_BINDER_MISSING,
          sourceEpisodeId: "set-1",
          dismissedAt: new Date("2026-05-17T00:00:00Z"),
        },
      ],
    });

    expect(plan.create).toEqual([{ cardId: "card-3", episodeId: "set-1" }]);
    expect(plan.hiddenKept).toBe(1);
  });

  it("re-adds an auto want when a card becomes missing again", () => {
    const plan = buildMissingBinderWantSyncPlan({
      linkedEpisodeIds,
      setCards,
      ownedCardIds: [],
      existingWants: [],
    });

    expect(plan.create.map((item) => item.cardId)).toEqual(["card-1", "card-2", "card-3"]);
  });

  it("removes stale auto wants when a binder is deleted", () => {
    const plan = buildMissingBinderWantSyncPlan({
      linkedEpisodeIds: [],
      setCards,
      ownedCardIds: [],
      existingWants: [
        {
          id: "want-2",
          cardId: "card-2",
          source: WANT_SOURCE_BINDER_MISSING,
          sourceEpisodeId: "set-1",
          dismissedAt: null,
        },
      ],
    });

    expect(plan.create).toEqual([]);
    expect(plan.deleteStaleIds).toEqual(["want-2"]);
  });
});
