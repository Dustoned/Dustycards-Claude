import type { NextRequest } from "next/server";
import { db } from "@/lib/db";

const MAX_WINDOW_MS = 1000 * 60 * 60;
let lastSweepAt = 0;

function parseHits(value: string | null | undefined): number[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is number => Number.isFinite(entry))
      : [];
  } catch {
    return [];
  }
}

function recentHits(value: string | null | undefined, windowMs: number, now: number): number[] {
  const cutoff = now - Math.min(Math.max(windowMs, 1), MAX_WINDOW_MS);
  return parseHits(value).filter((at) => at > cutoff);
}

async function sweepExpired(now: number): Promise<void> {
  if (now - lastSweepAt < 5 * 60_000) return;
  lastSweepAt = now;
  await db.rateLimitBucket.deleteMany({
    where: { expires_at: { lte: new Date(now) } },
  }).catch(() => undefined);
}

export async function isRateLimited(key: string, limit: number, windowMs: number): Promise<boolean> {
  const now = Date.now();
  await sweepExpired(now);
  const bucket = await db.rateLimitBucket.findUnique({ where: { key }, select: { hits_json: true } });
  return recentHits(bucket?.hits_json, windowMs, now).length >= limit;
}

export async function recordRateLimitHit(key: string, windowMs = MAX_WINDOW_MS): Promise<void> {
  const now = Date.now();
  await sweepExpired(now);
  await db.$transaction(async (transaction) => {
    const bucket = await transaction.rateLimitBucket.findUnique({
      where: { key },
      select: { hits_json: true },
    });
    const hits = recentHits(bucket?.hits_json, windowMs, now);
    hits.push(now);
    await transaction.rateLimitBucket.upsert({
      where: { key },
      create: {
        key,
        hits_json: JSON.stringify(hits),
        expires_at: new Date(now + Math.min(Math.max(windowMs, 1), MAX_WINDOW_MS)),
      },
      update: {
        hits_json: JSON.stringify(hits),
        expires_at: new Date(now + Math.min(Math.max(windowMs, 1), MAX_WINDOW_MS)),
      },
    });
  });
}

/** Atomically checks and records a request. Returns true when it must be rejected. */
export async function consumeRateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const now = Date.now();
  await sweepExpired(now);
  return db.$transaction(async (transaction) => {
    const bucket = await transaction.rateLimitBucket.findUnique({
      where: { key },
      select: { hits_json: true },
    });
    const hits = recentHits(bucket?.hits_json, windowMs, now);
    if (hits.length >= limit) return true;
    hits.push(now);
    await transaction.rateLimitBucket.upsert({
      where: { key },
      create: { key, hits_json: JSON.stringify(hits), expires_at: new Date(now + windowMs) },
      update: { hits_json: JSON.stringify(hits), expires_at: new Date(now + windowMs) },
    });
    return false;
  });
}

function normalizeForwardedIp(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw || raw.toLowerCase() === "unknown") return null;
  if (raw.startsWith("[") && raw.includes("]")) return raw.slice(1, raw.indexOf("]"));
  const withoutPort = raw.includes(":") && raw.split(":").length === 2 ? raw.split(":")[0] : raw;
  return withoutPort.replace(/^"|"$/g, "").trim() || null;
}

export function getClientIp(req: NextRequest): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const trustedProxyHop = forwardedFor.split(",").map(normalizeForwardedIp)
      .filter((part): part is string => Boolean(part)).at(-1);
    if (trustedProxyHop) return trustedProxyHop;
  }
  return normalizeForwardedIp(req.headers.get("x-real-ip")) ?? "unknown";
}

export const __rateLimitTestUtils = { parseHits, recentHits };
