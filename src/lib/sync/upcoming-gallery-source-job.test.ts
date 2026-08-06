import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FirecrawlPageScrapeResult } from "@/lib/firecrawl";

const dbMock = vi.hoisted(() => ({
  externalCatalystSource: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
  },
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
});
