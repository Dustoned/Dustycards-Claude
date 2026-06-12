import type { NextRequest } from "next/server";

// In-memory sliding-window rate limiter. Buckets live in module state, so limits
// reset on server restart and are per-process — fine for a self-hosted single
// instance, which is the only supported deployment.

const buckets = new Map<string, number[]>();

const SWEEP_THRESHOLD = 2_000;
const MAX_WINDOW_MS = 1000 * 60 * 60;

function pruneBucket(key: string, now: number): number[] {
  const cutoff = now - MAX_WINDOW_MS;
  const hits = buckets.get(key)?.filter((at) => at > cutoff) ?? [];
  if (hits.length === 0) {
    buckets.delete(key);
  } else {
    buckets.set(key, hits);
  }
  return hits;
}

function sweepIfNeeded(now: number) {
  if (buckets.size < SWEEP_THRESHOLD) return;
  for (const key of buckets.keys()) {
    pruneBucket(key, now);
  }
}

function countRecentHits(hits: number[], windowMs: number, now: number): number {
  const cutoff = now - windowMs;
  let count = 0;
  for (const at of hits) {
    if (at > cutoff) count += 1;
  }
  return count;
}

export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = pruneBucket(key, now);
  return countRecentHits(hits, windowMs, now) >= limit;
}

export function recordRateLimitHit(key: string): void {
  const now = Date.now();
  sweepIfNeeded(now);
  const hits = pruneBucket(key, now);
  hits.push(now);
  buckets.set(key, hits);
}

/** Check and record in one step: returns true when the request must be rejected. */
export function consumeRateLimit(key: string, limit: number, windowMs: number): boolean {
  if (isRateLimited(key, limit, windowMs)) return true;
  recordRateLimitHit(key);
  return false;
}

export function getClientIp(req: NextRequest): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}
