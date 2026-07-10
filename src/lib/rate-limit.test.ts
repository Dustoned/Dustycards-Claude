import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  consumeRateLimit,
  getClientIp,
  isRateLimited,
  recordRateLimitHit,
} from "./rate-limit";

function requestWithHeaders(headers: Record<string, string>) {
  return new NextRequest("http://localhost:3000/api/auth/login", { headers });
}

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

  it("uses the trusted proxy hop from x-forwarded-for", () => {
    const req = requestWithHeaders({
      "x-forwarded-for": "198.51.100.1, 203.0.113.10",
      "x-real-ip": "198.51.100.200",
    });

    expect(getClientIp(req)).toBe("203.0.113.10");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const req = requestWithHeaders({
      "x-real-ip": "203.0.113.20:443",
    });

    expect(getClientIp(req)).toBe("203.0.113.20");
  });
});
