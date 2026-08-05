import {
  getMovers,
  type CollectionMoversData,
  type MoversItemScope,
  type MoversScope,
} from "@/lib/movers";
import {
  getCollectionValueDriversData,
  type CollectionValueDriversData,
  type CollectionValueDriversScope,
} from "@/lib/collection-data";
import { getSealedMovers, type SealedMoversData } from "@/lib/sealed-movers";
import { getServerUserSettings } from "@/lib/user-settings-server";
import { POKEMON_GAME, type TradingCardGameFilter } from "@/lib/games";
import {
  readMoversSnapshot,
  writeMoversSnapshot,
  type MoversSnapshotKey,
} from "@/lib/movers-snapshot-store";
import {
  buildMoversSourceHref,
  type MoversPageScope,
  normalizeMoversItemScope,
  normalizeMoversPriceSource,
  normalizeMoversScope,
} from "@/app/movers/routing";

export {
  buildMoversSourceHref,
  normalizeMoversItemScope,
  normalizeMoversPriceSource,
  normalizeMoversScope,
};

// Fresh window: callers within this TTL get a no-op cache hit.
const MOVERS_FRESH_TTL_MS = 60_000;
// Stale window: callers up to this age get the stale value immediately while a
// background refresh refills the cache. Anything older blocks on a fresh fetch.
const MOVERS_STALE_TTL_MS = 5 * 60_000;
// A durable snapshot keeps the first request after a deploy fast. It is only
// used as a short-lived bridge while current market data refreshes in the
// background; it never replaces the normal live cache.
const MOVERS_SNAPSHOT_MAX_AGE_MS = 12 * 60 * 60_000;
const MOVERS_SNAPSHOT_REFRESH_DELAY_MS = 8_000;

interface CachedMoversEntry<T> {
  /** Absolute timestamp at which the entry stops being fresh. */
  expiresAt: number;
  /** Absolute timestamp at which the entry stops being usable at all. */
  staleAt: number;
  promise: Promise<T>;
  refreshing: boolean;
}

const moversPageCache = new Map<
  string,
  CachedMoversEntry<CollectionMoversData | SealedMoversData>
>();

const valueDriversPageCache = new Map<
  string,
  CachedMoversEntry<CollectionValueDriversData>
>();

function storeCachedEntry<T>(
  cache: Map<string, CachedMoversEntry<T>>,
  key: string,
  promise: Promise<T>
): CachedMoversEntry<T> {
  const now = Date.now();
  const entry: CachedMoversEntry<T> = {
    expiresAt: now + MOVERS_FRESH_TTL_MS,
    staleAt: now + MOVERS_STALE_TTL_MS,
    promise,
    refreshing: false,
  };
  cache.set(key, entry);
  promise.catch(() => {
    if (cache.get(key) === entry) {
      cache.delete(key);
    }
  });
  return entry;
}

function refreshInBackground<T>(
  cache: Map<string, CachedMoversEntry<T>>,
  key: string,
  staleEntry: CachedMoversEntry<T>,
  fetcher: () => Promise<T>
) {
  if (staleEntry.refreshing) return;
  staleEntry.refreshing = true;
  const refreshed = fetcher();
  refreshed
    .then(() => {
      // Replace the entry with a fresh promise resolving to the new value.
      storeCachedEntry(cache, key, refreshed);
    })
    .catch(() => {
      // Keep the stale entry; let it expire naturally so the next caller blocks.
      staleEntry.refreshing = false;
    });
}

function getCachedMovers(
  activePriceSource: ReturnType<typeof normalizeMoversPriceSource>,
  activeScope: MoversScope,
  activeItemScope: MoversItemScope,
  userId: string,
  game: TradingCardGameFilter
): Promise<CollectionMoversData | SealedMoversData> {
  const key = `${userId}:${game}:${activePriceSource}:${activeScope}:${activeItemScope}`;
  const now = Date.now();
  const cached = moversPageCache.get(key);
  const snapshotKey: MoversSnapshotKey | null =
    activeScope === "sealed"
      ? null
      : {
          userId,
          game,
          source: activePriceSource,
          scope: activeScope,
          itemScope: activeItemScope,
        };
  const fetcher = async () => {
    if (activeScope === "sealed") {
      return getSealedMovers(activeItemScope, userId, game);
    }

    const data = await getMovers(activePriceSource, activeScope, activeItemScope, userId, game);
    if (snapshotKey) {
      void writeMoversSnapshot(snapshotKey, data).catch(() => undefined);
    }
    return data;
  };

  if (cached && cached.expiresAt > now) {
    return cached.promise;
  }

  if (cached && cached.staleAt > now) {
    refreshInBackground(moversPageCache, key, cached, fetcher);
    return cached.promise;
  }

  if (!snapshotKey) {
    return storeCachedEntry(moversPageCache, key, fetcher()).promise;
  }

  const coldStart = (async () => {
    const snapshot = await readMoversSnapshot(snapshotKey);
    const writtenAt = snapshot ? Date.parse(snapshot.writtenAt) : Number.NaN;
    if (
      snapshot &&
      Number.isFinite(writtenAt) &&
      Date.now() - writtenAt <= MOVERS_SNAPSHOT_MAX_AGE_MS
    ) {
      const snapshotEntry = moversPageCache.get(key);
      if (snapshotEntry) {
        snapshotEntry.expiresAt = Date.now() + MOVERS_SNAPSHOT_REFRESH_DELAY_MS;
        snapshotEntry.staleAt = Date.now() + MOVERS_STALE_TTL_MS;
        const refreshTimer = setTimeout(() => {
          if (moversPageCache.get(key) === snapshotEntry) {
            refreshInBackground(moversPageCache, key, snapshotEntry, fetcher);
          }
        }, MOVERS_SNAPSHOT_REFRESH_DELAY_MS);
        refreshTimer.unref?.();
      }
      return snapshot.data;
    }

    return fetcher() as Promise<CollectionMoversData>;
  })();

  return storeCachedEntry(moversPageCache, key, coldStart).promise;
}

function getCachedValueDrivers(
  userId: string,
  scope: CollectionValueDriversScope,
  game: TradingCardGameFilter
): Promise<CollectionValueDriversData> {
  const key = `${userId}:${game}:value-drivers:${scope}`;
  const now = Date.now();
  const cached = valueDriversPageCache.get(key);
  const fetcher = () => getCollectionValueDriversData(userId, scope, game);

  if (cached && cached.expiresAt > now) {
    return cached.promise;
  }

  if (cached && cached.staleAt > now) {
    refreshInBackground(valueDriversPageCache, key, cached, fetcher);
    return cached.promise;
  }

  return storeCachedEntry(valueDriversPageCache, key, fetcher()).promise;
}

export async function loadMoversPageData(
  sourceOverride?: string | null,
  scopeOverride?: string | null,
  itemScopeOverride?: string | null,
  userId?: string | null,
  game: TradingCardGameFilter = POKEMON_GAME
) {
  if (!userId) {
    throw new Error("loadMoversPageData requires a user id.");
  }

  const settings = await getServerUserSettings(userId);
  const activePriceSource = normalizeMoversPriceSource(
    sourceOverride,
    settings.primaryPriceSource
  );
  const activeScope: MoversPageScope = normalizeMoversScope(scopeOverride);
  const activeItemScope: MoversItemScope =
    activeScope === "value"
      ? normalizeMoversItemScope(itemScopeOverride, "collection")
      : activeScope === "all"
      ? "all"
      : activeScope === "collection"
        ? "collection"
        : activeScope === "sealed"
          ? normalizeMoversItemScope(itemScopeOverride, "all")
          : normalizeMoversItemScope(itemScopeOverride, "all");
  const data =
    activeScope === "value"
      ? await getCachedValueDrivers(userId, activeItemScope, game)
      : await getCachedMovers(
          activePriceSource,
          activeScope as MoversScope,
          activeItemScope,
          userId,
          game
        );

  return { settings, data, activePriceSource, activeScope, activeItemScope };
}

export function getDisplayedCheapHighRarityMovers(data: CollectionMoversData) {
  if (data.cheapestHighRarityMovers.length > 0) {
    return data.cheapestHighRarityMovers;
  }

  if (data.topOpportunities.length > 0) {
    return data.topOpportunities;
  }

  return data.movers.filter((item) => item.moverScore > 0).slice(0, 12);
}
