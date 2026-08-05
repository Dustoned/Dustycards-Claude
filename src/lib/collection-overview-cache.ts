import "server-only";

import { db } from "@/lib/db";
import {
  getCollectionOverviewData,
  type CollectionOverviewData,
  type CollectionHistoryRange,
  type CollectionPageTab,
} from "@/lib/collection-data";
import { POKEMON_GAME, type TradingCardGameFilter } from "@/lib/games";
import { getMarketDataFingerprint } from "@/lib/market-data-fingerprint";

// Collection edits invalidate immediately. Market values may be refreshed by
// background jobs without touching the collection rows, so the market-data
// fingerprint participates in the cache key too. An unchanged collection can
// then safely reuse one overview for a day instead of rebuilding every minute.
const MAX_ENTRIES = 40;
const OVERVIEW_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CachedOverviewEntry {
  fingerprint: string;
  createdAt: number;
  lastAccessAt: number;
  promise: Promise<CollectionOverviewData>;
}

const overviewCache = new Map<string, CachedOverviewEntry>();

interface OverviewFingerprintRow {
  card_total: number | bigint;
  card_latest: string | null;
  sealed_total: number | bigint;
  sealed_latest: string | null;
  binder_total: number | bigint;
  binder_latest: string | null;
  user_latest: string | null;
}

async function computeOverviewFingerprint(userId: string): Promise<string> {
  const [rows, marketFingerprint] = await Promise.all([
    db.$queryRawUnsafe<OverviewFingerprintRow[]>(
      `SELECT
         (SELECT COUNT(*) FROM "CollectionCard" WHERE user_id = ?) AS card_total,
         (SELECT MAX(updated_at) FROM "CollectionCard" WHERE user_id = ?) AS card_latest,
         (SELECT COUNT(*) FROM "CollectionSealed" WHERE user_id = ?) AS sealed_total,
         (SELECT MAX(updated_at) FROM "CollectionSealed" WHERE user_id = ?) AS sealed_latest,
         (SELECT COUNT(*) FROM "CollectionBinder" WHERE user_id = ?) AS binder_total,
         (SELECT MAX(updated_at) FROM "CollectionBinder" WHERE user_id = ?) AS binder_latest,
         (SELECT updated_at FROM "User" WHERE id = ?) AS user_latest`,
      userId,
      userId,
      userId,
      userId,
      userId,
      userId,
      userId
    ),
    getMarketDataFingerprint(),
  ]);
  const stats = rows[0];

  return [
    stats?.card_total,
    stats?.card_latest,
    stats?.sealed_total,
    stats?.sealed_latest,
    stats?.binder_total,
    stats?.binder_latest,
    stats?.user_latest,
    marketFingerprint,
  ].join("|");
}

export async function getCachedCollectionOverviewData(options: {
  userId: string;
  activeTab?: CollectionPageTab;
  game?: TradingCardGameFilter;
  deferDetailedRows?: boolean;
  historyRange?: CollectionHistoryRange;
}): Promise<CollectionOverviewData> {
  const activeTab = options.activeTab ?? "overview";
  const game = options.game ?? POKEMON_GAME;
  const historyRange = options.historyRange ?? "recent";
  const key = `${options.userId}:${activeTab}:${game}:${options.deferDetailedRows ? 1 : 0}:${historyRange}`;
  const fingerprint = await computeOverviewFingerprint(options.userId);
  const now = Date.now();
  const cached = overviewCache.get(key);

  if (
    cached &&
    cached.fingerprint === fingerprint &&
    now - cached.createdAt < OVERVIEW_CACHE_TTL_MS
  ) {
    cached.lastAccessAt = now;
    return cached.promise;
  }

  const promise = getCollectionOverviewData(options);
  overviewCache.set(key, {
    fingerprint,
    createdAt: now,
    lastAccessAt: now,
    promise,
  });
  promise.catch(() => {
    if (overviewCache.get(key)?.promise === promise) {
      overviewCache.delete(key);
    }
  });

  if (overviewCache.size > MAX_ENTRIES) {
    const oldestKey = [...overviewCache.entries()].sort(
      (a, b) => a[1].lastAccessAt - b[1].lastAccessAt
    )[0]?.[0];
    if (oldestKey) overviewCache.delete(oldestKey);
  }

  return promise;
}
