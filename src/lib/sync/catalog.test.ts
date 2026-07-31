import { describe, expect, it } from "vitest";
import {
  assessEpisodeSourceCheck,
  buildEpisodeSourceCheckUpdate,
  planAutoCatalogSyncFromEpisodes,
  shouldRunAutoCatalogSync,
} from "@/lib/sync/catalog";
import { POKEMON_GAME } from "@/lib/games";
import type { NormalizedEpisode } from "@/lib/tcggo";

function remoteEpisode(overrides: Partial<NormalizedEpisode> = {}): NormalizedEpisode {
  return {
    id: "sv10",
    game: POKEMON_GAME,
    name: "Destined Rivals",
    code: "SV10",
    release_date: "2026-05-22",
    card_count: 0,
    logo_url: null,
    symbol_url: null,
    series: "Scarlet & Violet",
    ...overrides,
  };
}

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

  it("runs the auto catalog check when an empty local expansion is stale", () => {
    const now = new Date("2026-05-22T12:00:00.000Z");

    expect(
      shouldRunAutoCatalogSync(
        [
          {
            id: "sv10",
            name: "Destined Rivals",
            card_count: 0,
            source_status: "ok",
            source_checked_at: new Date("2026-05-22T10:30:00.000Z"),
            synced_at: new Date("2026-05-22T10:30:00.000Z"),
            _count: { cards: 0 },
          },
        ],
        now,
        60 * 60 * 1000,
        new Date("2026-05-22T11:45:00.000Z")
      )
    ).toBe(true);
  });

  it("does not let permanent partial feeds force hourly source refetches", () => {
    const now = new Date("2026-05-22T12:00:00.000Z");
    const partialEpisode = {
      id: "sv10",
      name: "Destined Rivals",
      card_count: 300,
      source_status: "partial",
      source_checked_at: new Date("2026-05-22T10:00:00.000Z"),
      synced_at: new Date("2026-05-01T10:00:00.000Z"),
      _count: { cards: 180 },
    };

    expect(
      shouldRunAutoCatalogSync(
        [partialEpisode],
        now,
        60 * 60 * 1000,
        new Date("2026-05-22T11:45:00.000Z"),
        7 * 24 * 60 * 60 * 1000
      )
    ).toBe(false);

    expect(
      shouldRunAutoCatalogSync(
        [
          {
            ...partialEpisode,
            source_checked_at: new Date("2026-05-14T10:00:00.000Z"),
          },
        ],
        now,
        60 * 60 * 1000,
        new Date("2026-05-22T11:45:00.000Z"),
        7 * 24 * 60 * 60 * 1000
      )
    ).toBe(true);
  });

  it("does not select a known partial feed from its catalog count before the weekly retry", () => {
    const now = new Date("2026-05-22T12:00:00.000Z");
    const plan = planAutoCatalogSyncFromEpisodes({
      remoteEpisodes: [remoteEpisode({ card_count: 300 })],
      localEpisodes: [
        {
          id: "sv10",
          name: "Destined Rivals",
          card_count: 300,
          source_status: "partial",
          source_checked_at: new Date("2026-05-22T10:00:00.000Z"),
          synced_at: new Date("2026-05-01T10:00:00.000Z"),
          _count: { cards: 180 },
        },
      ],
      now,
      maxEpisodes: 6,
      minIntervalMs: 60 * 60 * 1000,
      sourceRecheckIntervalMs: 7 * 24 * 60 * 60 * 1000,
    });

    expect(plan.selectedEpisodes).toEqual([]);
  });

  it("selects empty local expansions even when the catalog card count is still zero", () => {
    const now = new Date("2026-05-22T12:00:00.000Z");

    const plan = planAutoCatalogSyncFromEpisodes({
      remoteEpisodes: [remoteEpisode()],
      localEpisodes: [
        {
          id: "sv10",
          name: "Destined Rivals",
          card_count: 0,
          source_status: "ok",
          source_checked_at: new Date("2026-05-22T10:30:00.000Z"),
          synced_at: new Date("2026-05-22T10:30:00.000Z"),
          _count: { cards: 0 },
        },
      ],
      now,
      maxEpisodes: 6,
      minIntervalMs: 60 * 60 * 1000,
    });

    expect(plan.selectedEpisodes.map((episode) => episode.id)).toEqual(["sv10"]);
  });

  it("does not keep retrying empty local expansions before their recheck interval", () => {
    const now = new Date("2026-05-22T12:00:00.000Z");

    const plan = planAutoCatalogSyncFromEpisodes({
      remoteEpisodes: [remoteEpisode()],
      localEpisodes: [
        {
          id: "sv10",
          name: "Destined Rivals",
          card_count: 0,
          source_status: "ok",
          source_checked_at: new Date("2026-05-22T11:30:00.000Z"),
          synced_at: new Date("2026-05-22T11:30:00.000Z"),
          _count: { cards: 0 },
        },
      ],
      now,
      maxEpisodes: 6,
      minIntervalMs: 60 * 60 * 1000,
    });

    expect(plan.selectedEpisodes).toEqual([]);
  });
});
