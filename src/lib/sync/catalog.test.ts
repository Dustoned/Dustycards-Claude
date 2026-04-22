import { describe, expect, it } from "vitest";
import {
  assessEpisodeSourceCheck,
  buildEpisodeSourceCheckUpdate,
} from "@/lib/sync/catalog";

describe("catalog source guardrails", () => {
  it("marks episodes as partial when the fetched card count is below the best known count", () => {
    expect(
      assessEpisodeSourceCheck({
        catalogCardCount: 25,
        localCardCount: 28,
        actualCardCount: 24,
      })
    ).toEqual({
      status: "partial",
      nextCardCount: 28,
    });
  });

  it("does not mark an episode synced when the source check is still incomplete", () => {
    const checkedAt = new Date("2026-04-22T12:00:00.000Z");

    expect(
      buildEpisodeSourceCheckUpdate({
        catalogCardCount: 25,
        localCardCount: 28,
        actualCardCount: 24,
        checkedAt,
        markSynced: true,
      })
    ).toEqual({
      card_count: 28,
      source_status: "partial",
      source_checked_at: checkedAt,
      source_actual_card_count: 24,
    });
  });

  it("marks an episode synced when the source check is healthy", () => {
    const checkedAt = new Date("2026-04-22T12:00:00.000Z");

    expect(
      buildEpisodeSourceCheckUpdate({
        catalogCardCount: 25,
        localCardCount: 25,
        actualCardCount: 25,
        checkedAt,
        markSynced: true,
      })
    ).toEqual({
      card_count: 25,
      source_status: "ok",
      source_checked_at: checkedAt,
      source_actual_card_count: 25,
      synced_at: checkedAt,
    });
  });
});
