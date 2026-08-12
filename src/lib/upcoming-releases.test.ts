import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  findEpisodes: vi.fn(),
  findCards: vi.fn(),
  findSources: vi.fn(),
  findCatalysts: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    episode: { findMany: dbMocks.findEpisodes },
    card: { findMany: dbMocks.findCards },
    externalCatalystSource: { findMany: dbMocks.findSources },
    externalCardCatalyst: { findMany: dbMocks.findCatalysts },
  },
}));

import { getUpcomingReleaseFeed } from "@/lib/upcoming-releases";

describe("getUpcomingReleaseFeed", () => {
  beforeEach(() => {
    dbMocks.findEpisodes.mockReset();
    dbMocks.findCards.mockReset();
    dbMocks.findSources.mockReset();
    dbMocks.findCatalysts.mockReset();
  });

  it("never returns released cards as Upcoming Singles through catalyst or source paths", async () => {
    dbMocks.findEpisodes.mockResolvedValue([]);
    dbMocks.findCards
      // Deliberately include a released card to prove the final invariant also
      // protects the feed if a future query is widened accidentally.
      .mockResolvedValueOnce([
        {
          id: "pbl-card",
          name: "Finizen",
          card_number: "021",
          rarity: "Common",
          version: null,
          image_url: "https://images.example/pbl-021.png",
          episode: {
            id: "pitch-black",
            name: "Pitch Black",
            code: "PBL",
            release_date: "2026-07-17",
          },
        },
        {
          id: "future-card",
          name: "Future ex",
          card_number: "001",
          rarity: "Ultra Rare",
          version: null,
          image_url: "https://images.example/future-001.png",
          episode: {
            id: "future-set",
            name: "Future Set",
            code: "FTR",
            release_date: "2026-09-16",
          },
        },
      ])
      .mockResolvedValueOnce([]);
    dbMocks.findSources.mockResolvedValue([
      {
        id: "source-1",
        canonical_url: "https://example.com/reveals",
        domain: "example.com",
        source_type: "community",
        title: "Card reveals",
        description: null,
        content_excerpt: null,
        metadata_json: JSON.stringify({
          upcomingReveals: [
            {
              name: "Released source card",
              imageUrl: "https://images.example/released-source.png",
              releaseDate: "2026-07-17",
              episodeName: "Pitch Black",
              status: "reveal",
            },
            {
              name: "Unknown-date leak",
              imageUrl: "https://images.example/unknown-leak.png",
              releaseDate: null,
              episodeName: "Unannounced set",
              status: "leak",
            },
          ],
        }),
        published_at: new Date("2026-08-11T12:00:00.000Z"),
        last_seen_at: new Date("2026-08-11T12:00:00.000Z"),
      },
    ]);
    dbMocks.findCatalysts.mockResolvedValue([
      {
        id: "pbl-catalyst",
        card_id: "pbl-card",
        headline: "Pitch Black localization",
        evidence_excerpt: null,
        observed_at: new Date("2026-08-05T12:00:00.000Z"),
        source: {
          canonical_url: "https://example.com/pbl",
          domain: "example.com",
          source_type: "community",
          title: "Pitch Black cards",
          description: null,
          published_at: new Date("2026-08-05T12:00:00.000Z"),
        },
      },
      {
        id: "future-catalyst",
        card_id: "future-card",
        headline: "Future reveal",
        evidence_excerpt: null,
        observed_at: new Date("2026-08-11T12:00:00.000Z"),
        source: {
          canonical_url: "https://example.com/future",
          domain: "example.com",
          source_type: "community",
          title: "Future cards",
          description: null,
          published_at: new Date("2026-08-11T12:00:00.000Z"),
        },
      },
    ]);

    const feed = await getUpcomingReleaseFeed(new Date("2026-08-12T12:00:00.000Z"));

    expect(feed.singles.map((item) => item.name)).toEqual([
      "Future ex",
      "Unknown-date leak",
    ]);
    expect(feed.singles.some((item) => item.episodeName === "Pitch Black")).toBe(false);
    expect(dbMocks.findCards).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({
        episode: { release_date: { not: null, gt: "2026-08-12" } },
      }),
    }));
  });
});
