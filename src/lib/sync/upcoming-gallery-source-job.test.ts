import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FirecrawlPageScrapeResult } from "@/lib/firecrawl";

const dbMock = vi.hoisted(() => ({
  externalCatalystSource: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
  },
  card: { findMany: vi.fn() },
  episode: { findMany: vi.fn() },
  cardPrintingEvidence: { findMany: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/lib/scrapedo", () => ({
  getScrapeDoConfigSnapshot: () => ({ configured: false }),
  scrapeScrapeDoPage: vi.fn(),
}));
vi.mock("@/lib/sync/image-warmer", () => ({
  warmUpcomingImages: vi.fn(),
}));

import {
  extractOfficialPokemonPortraitReveals,
  matchStoredUpcomingRevealBacklog,
  refreshUpcomingGallerySources,
  UPCOMING_GALLERY_SOURCES,
} from "@/lib/sync/upcoming-gallery-source-job";

function scrape(html: string): FirecrawlPageScrapeResult {
  return {
    title: "Official Pokemon reveal",
    sourceUrl: "https://www.pokemon.com/us/news/example",
    markdown: "",
    html,
    links: [],
    creditsUsed: 0,
    metadata: {},
  };
}

describe("official Pokemon upcoming gallery extraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps a numbered promo while ignoring resize numbers and product artwork", () => {
    const result = extractOfficialPokemonPortraitReveals(scrape([
      '<img width="456" height="637" alt="Pokemon TCG product showcase" src="https://mcdn.pokemon.com/images/w_639/product-showcase.jpg">',
      '<img width="456" height="637" alt="" src="https://mcdn.pokemon.com/images/MEP_EN_092.png">',
    ].join("")), {
      episodeName: "2026 Pokemon World Championships",
      releaseDate: "2026-08-28",
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({
      name: "2026 Paradise Resort",
      cardNumber: "092",
      status: "confirmed",
    }));
  });

  it("keeps the last stored galleries when every live provider is unavailable", async () => {
    dbMock.externalCatalystSource.findMany.mockResolvedValue([]);
    dbMock.externalCatalystSource.findUnique.mockResolvedValue({
      metadata_json: JSON.stringify({ upcomingReveals: [{ name: "Stored card" }] }),
    });
    dbMock.externalCatalystSource.update.mockResolvedValue({});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("source offline")));

    const result = await refreshUpcomingGallerySources({ force: true });

    expect(result.storedFallback).toBe(UPCOMING_GALLERY_SOURCES.length);
    expect(result.refreshed).toBe(0);
    expect(dbMock.externalCatalystSource.update).toHaveBeenCalledTimes(UPCOMING_GALLERY_SOURCES.length);
    expect(dbMock.externalCatalystSource.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ last_scraped_at: expect.any(Date) }),
    }));
    expect(dbMock.externalCatalystSource.upsert).not.toHaveBeenCalled();
  });

  it("matches newly discovered upcoming sources first without requiring a static source URL", async () => {
    dbMock.externalCatalystSource.findMany.mockResolvedValue([]);

    await matchStoredUpcomingRevealBacklog(new Date("2026-08-06T12:00:00.000Z"));

    expect(dbMock.externalCatalystSource.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        game: "pokemon",
        source_type: { in: ["official", "community"] },
        metadata_json: { contains: '"upcomingReveals"' },
      },
      orderBy: [{ updated_at: "desc" }],
      take: 160,
    }));
  });

  it("never deletes a hidden stored gallery while matching another reveal", async () => {
    const hidden = {
      name: "Victini",
      imageUrl: "https://cdn.example.com/victini.webp",
      cardNumber: "102",
      rarity: "Official promo",
      episodeName: "30th Celebration MEP Promos",
      releaseDate: "2026-09-16",
      status: "confirmed",
      libraryMatch: {
        cardId: "hidden-card",
        episodeId: "mep",
        episodeName: "MEP Black Star Promos",
        episodeCode: "MEP",
        method: "set-number",
        confidence: 1,
      },
      libraryMatchCheckedAt: "2026-08-10T00:00:00.000Z",
      libraryMatchVersion: 2,
    };
    const visible = {
      name: "Raikou ex",
      imageUrl: "https://cdn.example.com/raikou.webp",
      cardNumber: "002",
      rarity: null,
      episodeName: "Visible Set",
      releaseDate: "2026-10-01",
      status: "reveal",
      libraryMatch: null,
      libraryMatchCheckedAt: null,
      libraryMatchVersion: 0,
    };
    dbMock.externalCatalystSource.findMany.mockResolvedValue([{
      id: "source-1",
      metadata_json: JSON.stringify({ upcomingReveals: [hidden, visible] }),
    }]);
    dbMock.card.findMany.mockResolvedValue([]);
    dbMock.episode.findMany.mockResolvedValue([{
      id: "visible-set",
      name: "Visible Set",
      code: "VIS",
      release_date: "2026-10-01",
      cards: [{
        id: "visible-card",
        name: "Raikou ex",
        card_number: "002",
        printingEvidence: null,
      }],
    }]);
    dbMock.externalCatalystSource.update.mockResolvedValue({});

    await matchStoredUpcomingRevealBacklog(new Date("2026-08-11T12:00:00.000Z"), 3);

    const update = dbMock.externalCatalystSource.update.mock.calls[0]?.[0];
    const stored = JSON.parse(update.data.metadata_json).upcomingReveals;
    expect(stored).toHaveLength(2);
    expect(stored[0]).toEqual(hidden);
    expect(stored[1]).toEqual(expect.objectContaining({
      name: "Raikou ex",
      libraryMatch: expect.objectContaining({ cardId: "visible-card" }),
    }));
  });
});
