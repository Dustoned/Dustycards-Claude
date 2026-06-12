import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consumeRateLimit, isRateLimited, recordRateLimitHit } from "./rate-limit";

describe("rate limit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests under the limit", () => {
    const key = `test:${Math.random()}`;
    expect(consumeRateLimit(key, 3, 60_000)).toBe(false);
    expect(consumeRateLimit(key, 3, 60_000)).toBe(false);
    expect(consumeRateLimit(key, 3, 60_000)).toBe(false);
  });

  it("rejects requests over the limit", () => {
    const key = `test:${Math.random()}`;
    consumeRateLimit(key, 2, 60_000);
    consumeRateLimit(key, 2, 60_000);
    expect(consumeRateLimit(key, 2, 60_000)).toBe(true);
    expect(isRateLimited(key, 2, 60_000)).toBe(true);
  });

  it("frees up after the window passes", () => {
    const key = `test:${Math.random()}`;
    consumeRateLimit(key, 1, 60_000);
    expect(isRateLimited(key, 1, 60_000)).toBe(true);

    vi.advanceTimersByTime(61_000);
    expect(isRateLimited(key, 1, 60_000)).toBe(false);
  });

  it("tracks keys independently", () => {
    const keyA = `test:${Math.random()}`;
    const keyB = `test:${Math.random()}`;
    consumeRateLimit(keyA, 1, 60_000);
    expect(isRateLimited(keyA, 1, 60_000)).toBe(true);
    expect(isRateLimited(keyB, 1, 60_000)).toBe(false);
  });

  it("recordRateLimitHit counts toward the limit without checking", () => {
    const key = `test:${Math.random()}`;
    recordRateLimitHit(key);
    recordRateLimitHit(key);
    expect(isRateLimited(key, 2, 60_000)).toBe(true);
  });
});
