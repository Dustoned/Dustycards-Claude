import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env.RAPIDAPI_KEY = process.env.RAPIDAPI_KEY ?? "test-key";
process.env.RAPIDAPI_HOST = process.env.RAPIDAPI_HOST ?? "test-host";
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "file:./test.db";

const healthMocks = vi.hoisted(() => ({
  recordObservation: vi.fn(),
}));

vi.mock("@/lib/tcggo-usage", () => ({
  recordTcggoQuotaSnapshot: vi.fn(),
}));

vi.mock("@/lib/tcggo-health", () => ({
  recordTcggoHealthObservation: healthMocks.recordObservation,
}));

vi.mock("@/lib/tcgdex", () => ({
  getTcgdexImageLookup: vi.fn(async () => new Map<string, string>()),
  resolveTcgdexImageUrl: vi.fn(() => null),
}));

import {
  __tcggoTestUtils,
  checkTcggoHealth,
  extractEbaySoldGradedPrices,
  fetchAllEpisodes,
  fetchCardsByCardMarketIds,
  fetchCardsByIds,
  fetchCardsForEpisode,
  fetchSealedProductsByCardMarketIds,
  fetchSealedProductsByIds,
  fetchSealedProductsForEpisode,
  extractPrices,
  isTcggoHttpStatusError,
  TCGGO_REQUEST_CONCURRENCY,
  TcggoHttpStatusError,
  TcggoQuotaExceededError,
} from "@/lib/tcggo";
import { ONE_PIECE_GAME, POKEMON_JAPANESE_GAME } from "@/lib/games";

describe("TCGGO request limiter", () => {
  beforeEach(() => {
    vi.stubEnv("DUSTYCARDS_ENABLE_LOCAL_SYNC", "1");
    __tcggoTestUtils.resetRequestRuntime();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("limits concurrent scraper requests", async () => {
    let activeRequests = 0;
    let maxActiveRequests = 0;

    await Promise.all(
      Array.from({ length: TCGGO_REQUEST_CONCURRENCY * 2 }, (_, index) =>
        __tcggoTestUtils.runQueuedRequest(`/test/${index}`, async () => {
          activeRequests += 1;
          maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
          await new Promise((resolve) => setTimeout(resolve, 5));
          activeRequests -= 1;
          return index;
        })
      )
    );

    expect(maxActiveRequests).toBe(TCGGO_REQUEST_CONCURRENCY);
  });

  it("stops queued requests when runtime quota is exhausted", async () => {
    __tcggoTestUtils.setRuntimeQuota({
      requestsRemaining: 0,
      quotaResetsAt: new Date(Date.now() + 60_000),
    });

    await expect(
      __tcggoTestUtils.runQueuedRequest("/quota-stop", async () => "ok")
    ).rejects.toBeInstanceOf(TcggoQuotaExceededError);
  });

  it("forgets a leftover reserve after its quota window has reset", async () => {
    __tcggoTestUtils.setRuntimeQuota({
      requestsRemaining: 1_197,
      quotaResetsAt: new Date(Date.now() - 1_000),
    });

    await expect(
      __tcggoTestUtils.runQueuedRequest("/new-window", async () => "ok")
    ).resolves.toBe("ok");
  });

  it("turns scraper 429 responses into quota errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ data: [] }), {
          status: 429,
          headers: {
            "x-ratelimit-requests-limit": "3000",
            "x-ratelimit-requests-remaining": "0",
            "x-ratelimit-requests-reset": "3600",
          },
        })
      )
    );

    await expect(fetchCardsForEpisode("1")).rejects.toBeInstanceOf(
      TcggoQuotaExceededError
    );
  });

  it("exposes scraper status errors for catalog recovery", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ data: [] }), {
          status: 403,
        })
      )
    );

    try {
      await fetchAllEpisodes(ONE_PIECE_GAME);
      throw new Error("Expected fetchAllEpisodes to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(TcggoHttpStatusError);
      expect(isTcggoHttpStatusError(error, 403)).toBe(true);
      expect(error).toMatchObject({
        path: "/one-piece/episodes?page=1&per_page=100",
        status: 403,
      });
    }
  });

  it("checks the dedicated Pokemon health endpoint without retrying", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ status: "ok" }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await checkTcggoHealth({ reason: "manual" });

    expect(result).toMatchObject({
      state: "healthy",
      ok: true,
      reason: "manual",
      httpStatus: 200,
      message: "ok",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://cardmarket-api-tcg.p.rapidapi.com/pokemon/healthcheck",
      expect.any(Object)
    );
    expect(healthMocks.recordObservation).toHaveBeenCalledWith(result);
  });

  it("runs at most one reactive healthcheck after two failed API operations", async () => {
    let requestCount = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      requestCount += 1;
      if (String(input).endsWith("/pokemon/healthcheck")) {
        return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
      }
      return new Response(JSON.stringify({ message: "upstream unavailable" }), {
        status: 503,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchCardsForEpisode("413")).rejects.toBeInstanceOf(
      TcggoHttpStatusError
    );
    await expect(fetchCardsForEpisode("413")).rejects.toBeInstanceOf(
      TcggoHttpStatusError
    );

    await vi.waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(([input]) =>
          String(input).endsWith("/pokemon/healthcheck")
        )
      ).toHaveLength(1);
    });
    expect(requestCount).toBe(7);
  });

  it("fetches cards with an over-100 page size to avoid empty first pages from TCGGO", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: [
            {
              id: 35127,
              name: "Mega Greninja ex",
              card_number: 100,
              prices: {},
            },
          ],
          paging: { current: 1, total: 1, per_page: 100 },
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const cards = await fetchCardsForEpisode("413");

    expect(cards).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/pokemon/episodes/413/cards?page=1&per_page=150"),
      expect.any(Object)
    );
  });

  it("loads Japanese cards through the dedicated catalog and prefers their English name", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: [
            {
              id: 51925,
              name: "メガヤンマex",
              name_en: "Yanmega ex",
              card_number: 1,
              image: "https://example.test/yanmega.png",
              prices: { tcg_player: { market_price: 0 } },
            },
          ],
          paging: { current: 1, total: 1, per_page: 100 },
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const cards = await fetchCardsForEpisode(
      "pokemon-jp:444",
      POKEMON_JAPANESE_GAME
    );

    expect(cards).toMatchObject([
      {
        id: "pokemon-jp:51925",
        game: POKEMON_JAPANESE_GAME,
        name: "Yanmega ex",
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/pokemon-jp/episodes/444/cards?page=1&per_page=150"),
      expect.any(Object)
    );
  });

  it("chunks exact card batch lookups into at most 20 IDs per request", async () => {
    const requestedIds = Array.from({ length: 21 }, (_, index) => String(index + 1));
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const ids = url.searchParams.get("ids")?.split(",") ?? [];
      return new Response(
        JSON.stringify({
          data: ids.map((id) => ({ id: Number(id), name: `Card ${id}`, prices: {} })),
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const cards = await fetchCardsByIds([...requestedIds, requestedIds[0]]);

    expect(cards).toHaveLength(21);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    const secondUrl = new URL(String(fetchMock.mock.calls[1]?.[0]));
    expect(firstUrl.pathname).toBe("/pokemon/cards/search");
    expect(firstUrl.searchParams.get("ids")?.split(",")).toHaveLength(20);
    expect(firstUrl.searchParams.get("per_page")).toBe("20");
    expect(secondUrl.searchParams.get("ids")).toBe("21");
  });

  it("supports exact card batch lookup by CardMarket ID", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      void input;
      return new Response(
        JSON.stringify({
          data: [{ id: 42, name: "Exact card", cardmarket_id: 12345, prices: {} }],
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const cards = await fetchCardsByCardMarketIds([12345]);

    expect(cards).toHaveLength(1);
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/pokemon/cards/search");
    expect(url.searchParams.get("cardmarket_ids")).toBe("12345");
  });

  it("treats a short sealed catalog total as an item count instead of page count", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: [
            { id: 1, name: "Booster Box", prices: {} },
            { id: 2, name: "Elite Trainer Box", prices: {} },
          ],
          paging: { current: 1, total: 2, per_page: 100 },
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const products = await fetchSealedProductsForEpisode("413");

    expect(products).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("converts a large sealed item total into pages and fetches them sequentially", async () => {
    const firstPageProducts = Array.from({ length: 100 }, (_, index) => ({
      id: index + 1,
      name: `Product ${index + 1}`,
      prices: {},
    }));
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("products?page=1&")) {
        return new Response(
          JSON.stringify({
            data: firstPageProducts,
            paging: { current: 1, total: 101, per_page: 100 },
          }),
          { status: 200 }
        );
      }

      return new Response(
        JSON.stringify({
          data: [{ id: 101, name: "Product 101", prices: {} }],
          paging: { current: 2, total: 101, per_page: 100 },
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const products = await fetchSealedProductsForEpisode("413");

    expect(products).toHaveLength(101);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toEqual(
      expect.stringContaining("products?page=2&per_page=100")
    );
  });

  it("batches exact sealed-product IDs and preserves game-scoped IDs", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const ids = url.searchParams.get("ids")?.split(",") ?? [];
      return new Response(
        JSON.stringify({
          data: ids.map((id) => ({ id: Number(id), name: `Product ${id}`, prices: {} })),
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const products = await fetchSealedProductsByIds(
      ["one-piece:1", "one-piece:2"],
      ONE_PIECE_GAME
    );

    expect(products.map((product) => product.id)).toEqual(["one-piece:1", "one-piece:2"]);
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/one-piece/products/search");
    expect(url.searchParams.get("ids")).toBe("1,2");
  });

  it("supports exact sealed-product lookup by CardMarket ID", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      void input;
      return new Response(
        JSON.stringify({
          data: [{ id: 7, name: "Exact product", cardmarket_id: 777, prices: {} }],
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const products = await fetchSealedProductsByCardMarketIds([777]);

    expect(products).toHaveLength(1);
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/pokemon/products/search");
    expect(url.searchParams.get("cardmarket_ids")).toBe("777");
  });
});

describe("TCGGO price extraction", () => {
  it("treats zero and negative marketplace values as missing prices", () => {
    expect(
      extractPrices({
        cardmarket: { lowest_near_mint: 0, "30d_average": -1 },
        tcg_player: { market_price: 0, mid_price: 12.5, low_price: -2 },
      })
    ).toMatchObject({
      cm_en_lowest_nm: null,
      cm_en_avg_30d: null,
      tcp_market: null,
      tcp_mid: 12.5,
      tcp_low: null,
    });
  });

  it("extracts eBay sold graded medians separately from CardMarket graded prices", () => {
    const prices = {
      ebay: {
        currency: "USD",
        graded: {
          psa: {
            "10": { median_price: 4320.8, sample_size: 5 },
            "9": { median_price: 110, sample_size: 5 },
          },
          bgs: {
            "9": { median_price: 1205.7, sample_size: 1 },
          },
          cgc: {
            "10": { median_price: 250, sample_size: 3 },
          },
          sgc: {
            "10": { median_price: 220, sample_size: 2 },
          },
          ace: {
            "10": { median_price: 210, sample_size: 4 },
          },
          tag: {
            "9": { median_price: 180, sample_size: 2 },
          },
        },
      },
      cardmarket: {
        graded: {
          psa: {
            psa10: 199,
          },
        },
      },
    };

    expect(extractEbaySoldGradedPrices(prices)).toEqual([
      {
        source: "ebay_sold",
        label: "ACE 10",
        company: "ACE",
        grade: "10",
        median_price: 210,
        currency: "USD",
        sample_size: 4,
      },
      {
        source: "ebay_sold",
        label: "BGS 9",
        company: "BGS",
        grade: "9",
        median_price: 1205.7,
        currency: "USD",
        sample_size: 1,
      },
      {
        source: "ebay_sold",
        label: "CGC 10",
        company: "CGC",
        grade: "10",
        median_price: 250,
        currency: "USD",
        sample_size: 3,
      },
      {
        source: "ebay_sold",
        label: "PSA 10",
        company: "PSA",
        grade: "10",
        median_price: 4320.8,
        currency: "USD",
        sample_size: 5,
      },
      {
        source: "ebay_sold",
        label: "PSA 9",
        company: "PSA",
        grade: "9",
        median_price: 110,
        currency: "USD",
        sample_size: 5,
      },
      {
        source: "ebay_sold",
        label: "SGC 10",
        company: "SGC",
        grade: "10",
        median_price: 220,
        currency: "USD",
        sample_size: 2,
      },
      {
        source: "ebay_sold",
        label: "TAG 9",
        company: "TAG",
        grade: "9",
        median_price: 180,
        currency: "USD",
        sample_size: 2,
      },
    ]);
  });
});
