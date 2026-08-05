import "server-only";

import { db } from "@/lib/db";

const MARKET_FINGERPRINT_TTL_MS = 15_000;

let cachedFingerprint:
  | {
      createdAt: number;
      promise: Promise<string>;
    }
  | null = null;

/**
 * A cheap version marker for every derived market cache. It changes when a
 * card or sealed price observation is written, without rebuilding any market
 * panel just to learn that its source data is still unchanged.
 */
export function getMarketDataFingerprint(): Promise<string> {
  const now = Date.now();
  if (cachedFingerprint && now - cachedFingerprint.createdAt < MARKET_FINGERPRINT_TTL_MS) {
    return cachedFingerprint.promise;
  }

  const promise = Promise.all([
    db.price.aggregate({ _max: { fetched_at: true } }),
    db.sealedPriceSnapshot.aggregate({ _max: { fetched_at: true } }),
  ]).then(([cards, sealed]) =>
    [cards._max.fetched_at?.toISOString() ?? "", sealed._max.fetched_at?.toISOString() ?? ""].join(
      "|"
    )
  );

  cachedFingerprint = { createdAt: now, promise };
  promise.catch(() => {
    if (cachedFingerprint?.promise === promise) cachedFingerprint = null;
  });

  return promise;
}
