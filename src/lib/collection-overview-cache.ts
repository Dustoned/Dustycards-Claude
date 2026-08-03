import "server-only";

import { db } from "@/lib/db";
import {
  getCollectionOverviewData,
  type CollectionOverviewData,
  type CollectionPageTab,
} from "@/lib/collection-data";
import { POKEMON_GAME, type TradingCardGameFilter } from "@/lib/games";

// The home page rebuilt the full collection overview on every request
// (~1s of queries). The build is only reused when a cheap fingerprint proves
// the inputs are unchanged: any collection edit, settings change, or new
// price snapshot produces a different fingerprint and forces a fresh build,
// so users never see stale data after their own actions.
const MAX_ENTRY_AGE_MS = 5 * 60_000;
const MAX_ENTRIES = 40;

interface CachedOverviewEntry {
  fingerprint: string;
  cachedAt: number;
  promise: Promise<CollectionOverviewData>;
}

const overviewCache = new Map<string, CachedOverviewEntry>();

interface UserTableStatsRow {
  total: number | bigint;
  latest: string | null;
}

async function computeOverviewFingerprint(userId: string): Promise<string> {
  const [cards, sealed, binders, user, priceRows, sealedRows] = await Promise.all([
    db.$queryRawUnsafe<UserTableStatsRow[]>(
      `SELECT COUNT(*) AS total, MAX(updated_at) AS latest FROM "CollectionCard" WHERE user_id = ?`,
      userId
    ),
    db.$queryRawUnsafe<UserTableStatsRow[]>(
      `SELECT COUNT(*) AS total, MAX(updated_at) AS latest FROM "CollectionSealed" WHERE user_id = ?`,
      userId
    ),
    db.$queryRawUnsafe<UserTableStatsRow[]>(
      `SELECT COUNT(*) AS total, MAX(updated_at) AS latest FROM "CollectionBinder" WHERE user_id = ?`,
      userId
    ),
    db.user.findUnique({ where: { id: userId }, select: { updated_at: true } }),
    db.$queryRawUnsafe<Array<{ latest: string | null }>>(
      `SELECT MAX(fetched_at) AS latest FROM "Price"`
    ),
    db.$queryRawUnsafe<Array<{ latest: string | null }>>(
      `SELECT MAX(synced_at) AS latest FROM "SealedProduct"`
    ),
  ]);

  return [
    cards[0]?.total,
    cards[0]?.latest,
    sealed[0]?.total,
    sealed[0]?.latest,
    binders[0]?.total,
    binders[0]?.latest,
    user?.updated_at?.toISOString(),
    priceRows[0]?.latest,
    sealedRows[0]?.latest,
  ].join("|");
}

export async function getCachedCollectionOverviewData(options: {
  userId: string;
  activeTab?: CollectionPageTab;
  game?: TradingCardGameFilter;
  deferDetailedRows?: boolean;
}): Promise<CollectionOverviewData> {
  const activeTab = options.activeTab ?? "overview";
  const game = options.game ?? POKEMON_GAME;
  const key = `${options.userId}:${activeTab}:${game}:${options.deferDetailedRows ? 1 : 0}`;
  const fingerprint = await computeOverviewFingerprint(options.userId);
  const now = Date.now();
  const cached = overviewCache.get(key);

  if (cached && cached.fingerprint === fingerprint && now - cached.cachedAt < MAX_ENTRY_AGE_MS) {
    return cached.promise;
  }

  const promise = getCollectionOverviewData(options);
  overviewCache.set(key, { fingerprint, cachedAt: now, promise });
  promise.catch(() => {
    if (overviewCache.get(key)?.promise === promise) {
      overviewCache.delete(key);
    }
  });

  if (overviewCache.size > MAX_ENTRIES) {
    const oldestKey = [...overviewCache.entries()].sort(
      (a, b) => a[1].cachedAt - b[1].cachedAt
    )[0]?.[0];
    if (oldestKey) overviewCache.delete(oldestKey);
  }

  return promise;
}
