import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  appSettingFindUnique: vi.fn(),
  appSettingUpsert: vi.fn(),
  getTavilyConfigSnapshot: vi.fn(() => ({ configured: false })),
  searchTavilyWeb: vi.fn(),
  runBudgetedFirecrawlRequest: vi.fn(),
  searchFirecrawlWeb: vi.fn(),
  getScrapeDoConfigSnapshot: vi.fn(() => ({ configured: false })),
  searchScrapeDoWeb: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: {
    appSetting: {
      findUnique: mocks.appSettingFindUnique,
      upsert: mocks.appSettingUpsert,
    },
  },
}));
vi.mock("@/lib/firecrawl", () => ({ searchFirecrawlWeb: mocks.searchFirecrawlWeb }));
vi.mock("@/lib/firecrawl-budget", () => ({
  FirecrawlBudgetError: class FirecrawlBudgetError extends Error {
    status: number;

    constructor(message: string, status = 429) {
      super(message);
      this.name = "FirecrawlBudgetError";
      this.status = status;
    }
  },
  runBudgetedFirecrawlRequest: mocks.runBudgetedFirecrawlRequest,
}));
vi.mock("@/lib/tavily", () => ({
  getTavilyConfigSnapshot: mocks.getTavilyConfigSnapshot,
  searchTavilyWeb: mocks.searchTavilyWeb,
}));
vi.mock("@/lib/scrapedo", () => ({
  getScrapeDoConfigSnapshot: mocks.getScrapeDoConfigSnapshot,
  searchScrapeDoWeb: mocks.searchScrapeDoWeb,
}));

import {
  buildExternalCardResearchQueries,
  rankExternalCardResearchResults,
  researchExternalRadarCard,
  type ExternalCardResearchInput,
} from "@/lib/external-card-research";
import { FirecrawlBudgetError } from "@/lib/firecrawl-budget";

type ResearchHit = Parameters<typeof rankExternalCardResearchResults>[0][number];

const input: ExternalCardResearchInput = {
  cardId: "sv8pt5-161",
  game: "pokemon",
  name: "Umbreon ex",
  cardNumber: "161/131",
  episodeName: "Prismatic Evolutions",
  episodeCode: "PRE",
  artist: "YASHIRO Nanaco",
  rarity: "Special Illustration Rare",
};

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.appSettingFindUnique.mockResolvedValue(null);
  mocks.appSettingUpsert.mockResolvedValue({});
  mocks.getTavilyConfigSnapshot.mockReturnValue({ configured: false });
  mocks.getScrapeDoConfigSnapshot.mockReturnValue({ configured: false });
});

function hit(
  url: string,
  title: string,
  options: {
    description?: string | null;
    lens?: ResearchHit["lens"]["id"];
  } = {}
): ResearchHit {
  const lensId = options.lens ?? "exact-card";
  const lens = {
    id: lensId,
    label:
      lensId === "exact-card"
        ? "Exact card"
        : lensId === "demand-news"
          ? "Demand and news"
          : "Set and supply",
    category:
      lensId === "exact-card"
        ? "Card-specific"
        : lensId === "demand-news"
          ? "Demand & news"
          : "Set & supply",
    topic: lensId === "demand-news" ? "news" : "general",
    ...(lensId === "demand-news" ? { tbs: "sbd:1,qdr:y" } : {}),
    query: "test query",
  } as ResearchHit["lens"];

  return {
    result: {
      url,
      title,
      description: options.description ?? null,
    },
    lens,
  };
}

describe("external card research query planning", () => {
  it("builds three bounded lenses with exact card, set and artist identity", () => {
    const queries = buildExternalCardResearchQueries(
      input,
      new Date("2026-07-13T12:00:00.000Z")
    );

    expect(queries).toHaveLength(3);
    expect(queries.map((query) => query.id)).toEqual([
      "exact-card",
      "demand-news",
      "supply-context",
    ]);
    expect(queries[0]?.query).toContain(
      'Pokemon TCG "Umbreon ex" "161/131" "Prismatic Evolutions"'
    );
    expect(queries[1]).toMatchObject({ topic: "news", tbs: "sbd:1,qdr:y" });
    expect(queries[1]?.query).toContain('2026 illustrator "YASHIRO Nanaco"');
    expect(queries[2]?.query).toContain(
      '"Prismatic Evolutions" "PRE" "Umbreon ex"'
    );
    expect(queries.every((query) => query.query.length <= 500)).toBe(true);
  });

  it("keeps user-derived terms single-line and caps every query", () => {
    const oversized = "value\n\twith \"quotes\" ".repeat(80);
    const queries = buildExternalCardResearchQueries({
      ...input,
      name: oversized,
      episodeName: oversized,
      artist: oversized,
    });

    expect(queries).toHaveLength(3);
    expect(queries.every((query) => query.query.length <= 500)).toBe(true);
    expect(queries.every((query) => !/[\r\n\t]/.test(query.query))).toBe(true);
    expect(queries.every((query) => !query.query.includes('"quotes"'))).toBe(true);
  });
});

describe("external card research result ranking", () => {
  it("ranks exact card plus number above exact card plus set and set-only hits", () => {
    const ranked = rankExternalCardResearchResults(
      [
        hit(
          "https://set-only.example/article",
          "Prismatic Evolutions collector overview",
          { lens: "supply-context" }
        ),
        hit(
          "https://name-set.example/article",
          "Umbreon ex from Prismatic Evolutions market overview",
          { lens: "demand-news" }
        ),
        hit(
          "https://exact.example/article",
          "Umbreon ex 161/131 from Prismatic Evolutions market overview"
        ),
      ],
      input
    );

    expect(ranked.map((result) => result.domain)).toEqual([
      "exact.example",
      "name-set.example",
      "set-only.example",
    ]);
    expect(ranked[0]?.reason).toContain("Exact card name matched");
    expect(ranked[0]?.reason).toContain("Card number matched");
    expect(ranked[0]?.reason).toContain("Expansion matched");
  });

  it("puts a trusted source before a higher-scoring discovery source", () => {
    const ranked = rankExternalCardResearchResults(
      [
        hit(
          "https://collector-blog.example/umbreon",
          "Umbreon ex 161/131 Prismatic Evolutions by YASHIRO Nanaco buyout demand"
        ),
        hit(
          "https://www.pokebeach.com/2026/07/prismatic-evolutions-market",
          "Prismatic Evolutions sealed supply update",
          { lens: "supply-context" }
        ),
      ],
      input
    );

    expect(ranked[0]).toMatchObject({
      domain: "pokebeach.com",
      sourceTier: "trusted",
    });
    expect(ranked[1]).toMatchObject({
      domain: "collector-blog.example",
      sourceTier: "discovery",
    });
  });

  it("deduplicates canonical URLs and retains the strongest duplicate", () => {
    const ranked = rankExternalCardResearchResults(
      [
        hit(
          "http://WWW.collector.example/story/?utm_source=feed&b=2&a=1#top",
          "Prismatic Evolutions collector overview",
          { lens: "supply-context" }
        ),
        hit(
          "https://collector.example/story?a=1&b=2&fbclid=repeat",
          "Umbreon ex 161/131 Prismatic Evolutions demand rises"
        ),
      ],
      input
    );

    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.url).toBe("https://collector.example/story?a=1&b=2");
    expect(ranked[0]?.reason).toContain("Card number matched");
  });

  it("filters unsafe and irrelevant hits and caps output at ten", () => {
    const relevant = Array.from({ length: 12 }, (_, index) =>
      hit(
        `https://source-${String(index).padStart(2, "0")}.example/story`,
        `Umbreon ex 161/131 Prismatic Evolutions market story ${index}`
      )
    );
    const ranked = rankExternalCardResearchResults(
      [
        hit("javascript:alert(1)", "Umbreon ex 161/131 Prismatic Evolutions"),
        hit("https://irrelevant.example/coffee", "Best espresso machines of 2026"),
        ...relevant,
      ],
      input
    );

    expect(ranked).toHaveLength(10);
    expect(ranked.every((result) => result.url.startsWith("https://source-"))).toBe(true);
    expect(ranked.some((result) => result.domain === "irrelevant.example")).toBe(false);
  });
});

describe("external card research provider fallback", () => {
  it("uses Scrape.do when Firecrawl cannot reserve credits and keeps ledgers separate", async () => {
    mocks.getScrapeDoConfigSnapshot.mockReturnValue({ configured: true });
    mocks.runBudgetedFirecrawlRequest.mockRejectedValue(
      new FirecrawlBudgetError("Firecrawl monthly budget is reached.")
    );
    mocks.searchScrapeDoWeb.mockResolvedValue({
      results: [
        {
          url: "https://collector.example/umbreon",
          title: "Umbreon ex 161/131 Prismatic Evolutions market update",
          description: "Fresh collector demand and supply context.",
        },
      ],
      creditsUsed: 10,
      warning: null,
    });

    const research = await researchExternalRadarCard(
      { ...input, cardId: "scrapedo-budget-fallback" },
      new Date("2026-07-13T12:00:00.000Z")
    );

    expect(research).toMatchObject({
      provider: "scrapedo",
      creditsUsed: 0,
      tavilyCreditsUsed: 0,
      scrapedoCreditsUsed: 10,
      queriesRun: 1,
    });
    expect(research.results).toHaveLength(1);
    expect(mocks.searchFirecrawlWeb).not.toHaveBeenCalled();
    expect(mocks.searchScrapeDoWeb).toHaveBeenCalledTimes(1);
  });

  it("short-circuits after Firecrawl succeeds instead of calling Scrape.do", async () => {
    mocks.getScrapeDoConfigSnapshot.mockReturnValue({ configured: true });
    mocks.searchFirecrawlWeb.mockResolvedValue({
      results: [
        {
          url: "https://collector.example/umbreon-firecrawl",
          title: "Umbreon ex 161/131 Prismatic Evolutions market update",
          description: "Fresh collector demand and supply context.",
        },
      ],
      creditsUsed: 1,
      warning: null,
    });
    mocks.runBudgetedFirecrawlRequest.mockImplementation(async (request) => {
      const response = await request.request();
      return {
        executed: true,
        result: response,
        creditsUsed: request.getCreditsUsed(response) ?? request.estimatedCredits,
        reservationId: request.idempotencyKey,
      };
    });

    const research = await researchExternalRadarCard(
      { ...input, cardId: "firecrawl-short-circuit" },
      new Date("2026-07-13T12:00:00.000Z")
    );

    expect(research).toMatchObject({
      provider: "firecrawl",
      creditsUsed: 1,
      tavilyCreditsUsed: 0,
      scrapedoCreditsUsed: 0,
      queriesRun: 1,
    });
    expect(mocks.searchFirecrawlWeb).toHaveBeenCalledTimes(1);
    expect(mocks.searchScrapeDoWeb).not.toHaveBeenCalled();
  });

  it("short-circuits after Tavily succeeds without touching either fallback", async () => {
    mocks.getTavilyConfigSnapshot.mockReturnValue({ configured: true });
    mocks.getScrapeDoConfigSnapshot.mockReturnValue({ configured: true });
    mocks.searchTavilyWeb.mockResolvedValue({
      results: [],
      creditsUsed: 1,
      warning: null,
    });

    const research = await researchExternalRadarCard(
      { ...input, cardId: "tavily-short-circuit" },
      new Date("2026-07-13T12:00:00.000Z")
    );

    expect(research).toMatchObject({
      provider: "tavily",
      creditsUsed: 0,
      tavilyCreditsUsed: 3,
      scrapedoCreditsUsed: 0,
      queriesRun: 3,
    });
    expect(mocks.runBudgetedFirecrawlRequest).not.toHaveBeenCalled();
    expect(mocks.searchScrapeDoWeb).not.toHaveBeenCalled();
  });
});
