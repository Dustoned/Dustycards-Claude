import { afterEach, describe, expect, it, vi } from "vitest";
import { createSwrCache } from "@/lib/server-swr-cache";

afterEach(() => {
  vi.useRealTimers();
});

describe("createSwrCache", () => {
  it("shares a fresh promise for the same key", async () => {
    const cache = createSwrCache<number>(1_000, 5_000);
    const fetcher = vi.fn(async () => 42);

    await expect(cache.get("card", fetcher)).resolves.toBe(42);
    await expect(cache.get("card", fetcher)).resolves.toBe(42);

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("evicts the least recently used key at the configured bound", async () => {
    const cache = createSwrCache<string>(10_000, 20_000, { maxEntries: 2 });
    const calls = new Map<string, number>();
    const load = (key: string) => async () => {
      calls.set(key, (calls.get(key) ?? 0) + 1);
      return key;
    };

    await cache.get("a", load("a"));
    await cache.get("b", load("b"));
    await cache.get("a", load("a"));
    await cache.get("c", load("c"));
    await cache.get("b", load("b"));

    expect(calls.get("a")).toBe(1);
    expect(calls.get("b")).toBe(2);
    expect(calls.get("c")).toBe(1);
  });

  it("serves stale data once while one background refresh runs", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-20T10:00:00.000Z"));
    const cache = createSwrCache<number>(1_000, 10_000);
    let value = 1;
    const fetcher = vi.fn(async () => value);

    await expect(cache.get("score", fetcher)).resolves.toBe(1);
    value = 2;
    vi.advanceTimersByTime(1_500);

    await expect(cache.get("score", fetcher)).resolves.toBe(1);
    await expect(cache.get("score", fetcher)).resolves.toBe(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
