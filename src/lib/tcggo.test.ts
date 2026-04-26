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
