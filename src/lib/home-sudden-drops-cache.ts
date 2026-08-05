import "server-only";

import {
  getFastSealedSuddenDropsData,
  getFastSuddenDropsData,
} from "@/lib/home-sudden-drops-server";
import type { HomeSuddenDropsResponse } from "@/lib/home-sudden-drops";
import type { TradingCardGameFilter } from "@/lib/games";
import { getMarketDataFingerprint } from "@/lib/market-data-fingerprint";
import type { PriceSource } from "@/lib/user-settings";

const HOME_SUDDEN_DROPS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const HOME_SUDDEN_DROPS_MAX_ENTRIES = 12;

interface CachedHomeSuddenDropsEntry {
  fingerprint: string;
  createdAt: number;
  lastAccessAt: number;
  promise: Promise<HomeSuddenDropsResponse>;
}

const homeSuddenDropsCache = new Map<string, CachedHomeSuddenDropsEntry>();

async function buildHomeSuddenDropsPayload(
  source: PriceSource,
  game: TradingCardGameFilter
): Promise<HomeSuddenDropsResponse> {
  const [data, sealed] = await Promise.all([
    getFastSuddenDropsData(source, game),
    getFastSealedSuddenDropsData(game, 12),
  ]);

  return {
    ...data.preview,
    sealedItems: sealed.items.slice(0, 4).map((item) => ({
      productId: item.productId,
      name: item.name,
      episodeId: item.episodeId,
      episodeName: item.episodeName,
      episodeCode: item.episodeCode,
      currentPrice: item.currentPrice,
      currency: item.currency,
      dropAmount: item.dropAmount,
      dropPercent: item.dropPercent,
    })),
    sealedTotal: sealed.total,
  };
}

export async function getCachedHomeSuddenDropsData(
  source: PriceSource,
  game: TradingCardGameFilter
): Promise<HomeSuddenDropsResponse> {
  const [fingerprint] = await Promise.all([getMarketDataFingerprint()]);
  const key = `${source}:${game}`;
  const now = Date.now();
  const cached = homeSuddenDropsCache.get(key);

  if (
    cached &&
    cached.fingerprint === fingerprint &&
    now - cached.createdAt < HOME_SUDDEN_DROPS_CACHE_TTL_MS
  ) {
    cached.lastAccessAt = now;
    return cached.promise;
  }

  const promise = buildHomeSuddenDropsPayload(source, game);
  homeSuddenDropsCache.set(key, {
    fingerprint,
    createdAt: now,
    lastAccessAt: now,
    promise,
  });
  promise.catch(() => {
    if (homeSuddenDropsCache.get(key)?.promise === promise) homeSuddenDropsCache.delete(key);
  });

  if (homeSuddenDropsCache.size > HOME_SUDDEN_DROPS_MAX_ENTRIES) {
    const oldestKey = [...homeSuddenDropsCache.entries()].sort(
      (a, b) => a[1].lastAccessAt - b[1].lastAccessAt
    )[0]?.[0];
    if (oldestKey) homeSuddenDropsCache.delete(oldestKey);
  }

  return promise;
}
