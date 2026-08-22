import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { state, dbMock } = vi.hoisted(() => {
  const entries = new Map<string, { hits_json: string; expires_at: Date }>();
  const mock: Record<string, unknown> = {};
  Object.assign(mock, {
    rateLimitBucket: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) => entries.get(where.key) ?? null),
      upsert: vi.fn(async ({ where, create, update }: { where: { key: string }; create: { hits_json: string; expires_at: Date }; update: { hits_json: string; expires_at: Date } }) => {
        const value = entries.has(where.key) ? update : create;
        entries.set(where.key, value);
        return value;
      }),
    },
    $transaction: vi.fn(async (callback: (transaction: unknown) => unknown) => callback(mock)),
  });
  return { state: entries, dbMock: mock };
});

vi.mock("@/lib/db", () => ({ db: dbMock }));

import { consumeRateLimit, getClientIp, isRateLimited, recordRateLimitHit } from "./rate-limit";

function request(headers: Record<string, string>) {
  return new NextRequest("http://localhost:3000/api/auth/login", { headers });
}

describe("persistent rate limit", () => {
  beforeEach(() => {
    state.clear();
    vi.clearAllMocks();
  });

  it("blocks after the configured number of durable hits", async () => {
    const key = "login:test";
    await expect(consumeRateLimit(key, 2, 60_000)).resolves.toBe(false);
    await expect(consumeRateLimit(key, 2, 60_000)).resolves.toBe(false);
    await expect(consumeRateLimit(key, 2, 60_000)).resolves.toBe(true);
    await expect(isRateLimited(key, 2, 60_000)).resolves.toBe(true);
  });

  it("records a standalone failed attempt", async () => {
    await recordRateLimitHit("login:email:test", 60_000);
    await expect(isRateLimited("login:email:test", 1, 60_000)).resolves.toBe(true);
  });

  it("keeps keys independent", async () => {
    await consumeRateLimit("a", 1, 60_000);
    await expect(isRateLimited("a", 1, 60_000)).resolves.toBe(true);
    await expect(isRateLimited("b", 1, 60_000)).resolves.toBe(false);
  });

  it("uses the last trusted proxy hop", () => {
    expect(getClientIp(request({ "x-forwarded-for": "198.51.100.5, 127.0.0.1" }))).toBe("127.0.0.1");
  });
});
