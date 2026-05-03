import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  fetchCardsForEpisode,
  TCGGO_REQUEST_CONCURRENCY,
  TcggoQuotaExceededError,
} from "@/lib/tcggo";

describe("TCGGO request limiter", () => {
  beforeEach(() => {
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
