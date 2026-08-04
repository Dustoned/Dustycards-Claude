import { describe, expect, it, vi } from "vitest";
import {
  __resetExchangeRateCacheForTests,
  convertUsdToEur,
  getUsdToEurRate,
  parseUsdToEurRateResponse,
} from "@/lib/exchange-rates";

describe("exchange rates", () => {
  it("parses Frankfurter v2 USD to EUR rates", () => {
    const rate = parseUsdToEurRateResponse([
      {
        date: "2026-04-29",
        base: "USD",
        quote: "EUR",
        rate: 0.8552,
      },
    ]);

    expect(rate).toEqual({
      from: "USD",
      to: "EUR",
      rate: 0.8552,
      date: "2026-04-29",
      source: "frankfurter",
    });
  });

  it("converts USD amounts to EUR cents", () => {
    expect(
      convertUsdToEur(1200, {
        from: "USD",
        to: "EUR",
        rate: 0.8552,
        date: "2026-04-29",
        source: "frankfurter",
      })
    ).toBe(1026.24);
  });

  it("stops an unavailable rate provider from blocking a cold request", async () => {
    vi.useFakeTimers();
    __resetExchangeRateCacheForTests();
    const fetchMock = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    const ratePromise = getUsdToEurRate();
    await vi.advanceTimersByTimeAsync(801);

    await expect(ratePromise).resolves.toBeNull();
    await expect(getUsdToEurRate()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
    vi.useRealTimers();
    __resetExchangeRateCacheForTests();
  });
});
