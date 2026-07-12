import { describe, expect, it, vi } from "vitest";

import {
  EXTERNAL_CATALYST_DISCOVERY_INTERVAL_MS,
  EXTERNAL_CATALYST_MAX_SCRAPES_PER_RUN,
  EXTERNAL_CATALYST_SEARCH_LIMIT,
  isExternalCatalystDiscoveryDue,
  runExternalCatalystDiscovery,
  type ExternalCatalystDiscoveryDependencies,
  type ExternalCatalystDiscoveryStore,
} from "@/lib/external-radar-catalyst-discovery";
import type {
  FirecrawlPageScrapeResult,
  FirecrawlWebSearchResponse,
} from "@/lib/firecrawl";

function makeStore(known: string[] = []): ExternalCatalystDiscoveryStore & {
  created: string[];
  persisted: string[];
} {
  let nextId = 0;
  return {
    created: [],
    persisted: [],
    async findKnownCanonicalUrls() {
      return known;
    },
    async touchKnownCanonicalUrls() {},
    async createSource(input) {
      this.created.push(input.canonicalUrl);
      nextId += 1;
      return { id: `source-${nextId}` };
    },
    async persistScrapedSource(input) {
      this.persisted.push(input.source.canonicalUrl);
      return input.matches.reduce((total, match) => total + match.classifications.length, 0);
    },
    async markSourceFailed() {},
  };
}

function scrape(url: string, title: string): FirecrawlPageScrapeResult {
  return {
    title,
    sourceUrl: url,
    markdown: `${title}. Meowth ex receives major new support cards and is gaining attention.`,
    html: "",
    links: [],
    creditsUsed: 1,
    metadata: { publishedTime: "2026-07-12T08:00:00Z" },
  };
}

function dependencies(input: {
  searchResults: Record<string, FirecrawlWebSearchResponse>;
  store?: ReturnType<typeof makeStore>;
}): ExternalCatalystDiscoveryDependencies & {
  searchWeb: ReturnType<typeof vi.fn>;
  scrapePage: ReturnType<typeof vi.fn>;
} {
  const searchWeb = vi.fn(async ({ query }: { query: string }) => {
    const game = query.startsWith("Pokemon") ? "pokemon" : "one-piece";
    return input.searchResults[game] ?? { results: [], creditsUsed: 1, warning: null };
  });
  const scrapePage = vi.fn(async (url: string) => scrape(url, "New support announced"));
  return {
    searchWeb,
    scrapePage,
    store: input.store ?? makeStore(),
    async runBudgetedRequest(request) {
      const response = await request.request();
      return {
        executed: true,
        result: response,
        creditsUsed: request.getCreditsUsed(response) ?? request.estimatedCredits,
        reservationId: request.idempotencyKey,
      };
    },
  };
}

const candidates = [
  {
    cardId: "pokemon-meowth",
    game: "pokemon" as const,
    name: "Meowth ex",
    episodeCode: "PRE",
    rank: 1,
    externalScore: 100,
  },
  {
    cardId: "op-zoro",
    game: "one-piece" as const,
    name: "Roronoa Zoro",
    episodeCode: "OP14",
    rank: 1,
    externalScore: 90,
  },
];

describe("external catalyst cadence", () => {
  it("is caller-controlled and due only after 72 hours", () => {
    const now = new Date("2026-07-12T12:00:00Z");
    expect(isExternalCatalystDiscoveryDue(null, now)).toBe(true);
    expect(
      isExternalCatalystDiscoveryDue(
        new Date(now.getTime() - EXTERNAL_CATALYST_DISCOVERY_INTERVAL_MS + 1),
        now
      )
    ).toBe(false);
    expect(
      isExternalCatalystDiscoveryDue(
        new Date(now.getTime() - EXTERNAL_CATALYST_DISCOVERY_INTERVAL_MS),
        now
      )
    ).toBe(true);
  });

  it("performs no work or credit reservation when the caller says it is fresh", async () => {
    const now = new Date("2026-07-12T12:00:00Z");
    const deps = dependencies({ searchResults: {} });
    const result = await runExternalCatalystDiscovery(
      { candidates, now, lastRunAt: new Date("2026-07-12T11:00:00Z") },
      deps
    );

    expect(result).toMatchObject({ status: "skipped", due: false, creditsUsed: 0 });
    expect(deps.searchWeb).not.toHaveBeenCalled();
  });
});

describe("external catalyst discovery orchestration", () => {
  it("bounds searches and scrapes, filters trust, matches cards and persists catalysts", async () => {
    const store = makeStore();
    const deps = dependencies({
      store,
      searchResults: {
        pokemon: {
          results: [
            {
              title: "Support story",
              description: "Meowth ex support",
              url: "https://www.pokebeach.com/news/meowth?utm_source=feed",
            },
            {
              title: "Duplicate",
              description: null,
              url: "http://pokebeach.com/news/meowth?fbclid=repeat",
            },
            {
              title: "Untrusted",
              description: null,
              url: "https://evil.example/meowth",
            },
          ],
          creditsUsed: 1,
          warning: null,
        },
        "one-piece": {
          results: [
            {
              title: "Zoro support",
              description: "Roronoa Zoro gets support",
              url: "https://onepiecetopdecks.com/news/zoro",
            },
          ],
          creditsUsed: 1,
          warning: null,
        },
      },
    });

    const result = await runExternalCatalystDiscovery(
      { candidates, now: new Date("2026-07-12T12:00:00Z") },
      deps
    );

    expect(result.queriesPlanned).toBeLessThanOrEqual(4);
    expect(result.sourcesScraped).toBe(EXTERNAL_CATALYST_MAX_SCRAPES_PER_RUN);
    expect(deps.searchWeb).toHaveBeenCalledTimes(2);
    expect(deps.searchWeb).toHaveBeenCalledWith(
      expect.objectContaining({ limit: EXTERNAL_CATALYST_SEARCH_LIMIT })
    );
    expect(deps.scrapePage).toHaveBeenCalledTimes(2);
    expect(store.created).toEqual([
      "https://pokebeach.com/news/meowth",
      "https://onepiecetopdecks.com/news/zoro",
    ]);
    expect(result.matches.map((match) => match.cardId)).toContain("pokemon-meowth");
    expect(result.catalystsPersisted).toBeGreaterThan(0);
    expect(result.creditsUsed).toBe(4); // 2 searches + 2 scrapes.
    expect(result.errors).toEqual([]);
  });

  it("does not scrape canonical URLs already known to Prisma", async () => {
    const knownUrl = "https://pokebeach.com/news/meowth";
    const store = makeStore([knownUrl]);
    const deps = dependencies({
      store,
      searchResults: {
        pokemon: {
          results: [
            {
              title: "Known",
              description: "Meowth ex support",
              url: `${knownUrl}?utm_source=again`,
            },
          ],
          creditsUsed: 1,
          warning: null,
        },
      },
    });

    const result = await runExternalCatalystDiscovery(
      {
        candidates: [candidates[0]],
        now: new Date("2026-07-12T12:00:00Z"),
      },
      deps
    );

    expect(result.knownUrlsSkipped).toBe(1);
    expect(deps.scrapePage).not.toHaveBeenCalled();
    expect(store.created).toEqual([]);
    expect(result.creditsUsed).toBe(1);
  });

  it("returns provider errors and continues with the remaining queries", async () => {
    const store = makeStore();
    const deps = dependencies({
      store,
      searchResults: {
        pokemon: { results: [], creditsUsed: 1, warning: null },
        "one-piece": { results: [], creditsUsed: 1, warning: null },
      },
    });
    deps.searchWeb.mockImplementationOnce(async () => {
      throw new Error("temporary provider failure");
    });

    const result = await runExternalCatalystDiscovery(
      { candidates, now: new Date("2026-07-12T12:00:00Z") },
      deps
    );

    expect(result.status).toBe("partial");
    expect(result.errors).toEqual([
      expect.objectContaining({ stage: "search", message: "temporary provider failure" }),
    ]);
    expect(deps.searchWeb).toHaveBeenCalledTimes(2);
    expect(result.creditsUsed).toBe(3); // failed 2-credit search estimate + successful search actual.
  });

  it("uses a new scrape reservation bucket so a failed source can retry later", async () => {
    const requestIds: string[] = [];
    const deps = dependencies({
      store: makeStore(),
      searchResults: {
        pokemon: {
          results: [
            {
              title: "Meowth support",
              description: "Meowth ex gets support",
              url: "https://pokebeach.com/news/retry-meowth",
            },
          ],
          creditsUsed: 1,
          warning: null,
        },
      },
    });
    deps.runBudgetedRequest = async (request) => {
      requestIds.push(request.idempotencyKey);
      const response = await request.request();
      return {
        executed: true,
        result: response,
        creditsUsed: request.getCreditsUsed(response) ?? request.estimatedCredits,
        reservationId: request.idempotencyKey,
      };
    };
    const firstRun = new Date("2026-07-12T12:00:00Z");
    const secondRun = new Date(firstRun.getTime() + EXTERNAL_CATALYST_DISCOVERY_INTERVAL_MS);

    await runExternalCatalystDiscovery({ candidates: [candidates[0]], now: firstRun }, deps);
    await runExternalCatalystDiscovery({ candidates: [candidates[0]], now: secondRun }, deps);

    const scrapeReservations = requestIds.filter((key) => key.includes(":scrape:"));
    expect(scrapeReservations).toHaveLength(2);
    expect(new Set(scrapeReservations).size).toBe(2);
  });
});
