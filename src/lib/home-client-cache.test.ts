import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  invalidateCollectionHomeClientCache,
  invalidateMarketHomeClientCache,
  readHomeClientCache,
  writeHomeClientCache,
} from "./home-client-cache";

describe("Home client cache", () => {
  beforeEach(() => {
    invalidateMarketHomeClientCache();
    vi.useRealTimers();
  });

  it("keeps cached panels separate per account", () => {
    writeHomeClientCache("collection-insights", "user-a", "/api/home", { value: 1 });

    expect(readHomeClientCache("collection-insights", "user-a", "/api/home")).toEqual({
      value: 1,
    });
    expect(readHomeClientCache("collection-insights", "user-b", "/api/home")).toBeNull();
  });

  it("invalidates collection insights without dropping the shared market snapshot", () => {
    writeHomeClientCache("collection-insights", "user-a", "/api/home", { value: 1 });
    writeHomeClientCache("sudden-drops", "user-a", "/api/drops", { total: 4 });

    invalidateCollectionHomeClientCache();

    expect(readHomeClientCache("collection-insights", "user-a", "/api/home")).toBeNull();
    expect(readHomeClientCache("sudden-drops", "user-a", "/api/drops")).toEqual({ total: 4 });
  });

  it("expires a successful snapshot after one day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T10:00:00Z"));
    writeHomeClientCache("collection-insights", "user-a", "/api/home", { value: 1 });

    vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1);

    expect(readHomeClientCache("collection-insights", "user-a", "/api/home")).toBeNull();
  });
});
