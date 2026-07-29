import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env.RAPIDAPI_KEY = process.env.RAPIDAPI_KEY ?? "test-key";
process.env.RAPIDAPI_HOST = process.env.RAPIDAPI_HOST ?? "test-host";
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "file:./test.db";

vi.mock("@/lib/tcggo-usage", () => ({
  recordTcggoQuotaSnapshot: vi.fn(),
}));

vi.mock("@/lib/tcgdex", () => ({
  getTcgdexImageLookup: vi.fn(async () => new Map<string, string>()),
  resolveTcgdexImageUrl: vi.fn(() => null),
}));

import {
  __tcggoTestUtils,
  extractEbaySoldGradedPrices,
  fetchAllEpisodes,
  fetchCardsForEpisode,
  fetchSealedProductsForEpisode,
  isTcggoHttpStatusError,
  TCGGO_REQUEST_CONCURRENCY,
  TcggoHttpStatusError,
  TcggoQuotaExceededError,
} from "@/lib/tcggo";
import { ONE_PIECE_GAME } from "@/lib/games";

describe("TCGGO request limiter", () => {
  beforeEach(() => {
    vi.stubEnv("DUSTYCARDS_ENABLE_LOCAL_SYNC", "1");
    __tcggoTestUtils.resetRequestRuntime();
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
});

describe("TCGGO price extraction", () => {
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
