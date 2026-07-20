// A tiny in-process stale-while-revalidate cache for expensive, shareable
// server computations (catalog aggregates, price history, etc.). Callers within
// the fresh window get an instant cache hit; callers within the stale window get
// the stale value immediately while a background refresh refills the cache;
// anything older blocks on a fresh fetch. Modelled on the movers page cache.
//
// Use this only for data that is NOT user-specific (or where brief staleness is
// acceptable), since entries are keyed by string and shared across requests.

interface SwrEntry<T> {
  expiresAt: number;
  staleAt: number;
  promise: Promise<T>;
  refreshing: boolean;
}

export interface SwrCache<T> {
  get(key: string, fetcher: () => Promise<T>): Promise<T>;
  delete(key: string): void;
  clear(): void;
}

export interface SwrCacheOptions {
  /** Hard cap prevents high-cardinality page keys from retaining data forever. */
  maxEntries?: number;
}

export function createSwrCache<T>(
  freshMs: number,
  staleMs: number,
  options: SwrCacheOptions = {}
): SwrCache<T> {
  const cache = new Map<string, SwrEntry<T>>();
  const maxEntries = Math.max(1, Math.floor(options.maxEntries ?? 128));

  const touch = (key: string, entry: SwrEntry<T>) => {
    cache.delete(key);
    cache.set(key, entry);
  };

  const prune = (now: number) => {
    for (const [key, entry] of cache) {
      if (entry.staleAt <= now) cache.delete(key);
    }
  };

  const enforceCapacity = () => {
    while (cache.size > maxEntries) {
      const oldestKey = cache.keys().next().value as string | undefined;
      if (oldestKey == null) return;
      cache.delete(oldestKey);
    }
  };

  const store = (key: string, promise: Promise<T>): SwrEntry<T> => {
    const now = Date.now();
    const entry: SwrEntry<T> = {
      expiresAt: now + freshMs,
      staleAt: now + staleMs,
      promise,
      refreshing: false,
    };
    cache.set(key, entry);
    enforceCapacity();
    // Never cache a rejection: drop it so the next caller retries.
    promise.catch(() => {
      if (cache.get(key) === entry) cache.delete(key);
    });
    return entry;
  };

  return {
    get(key, fetcher) {
      const now = Date.now();
      prune(now);
      const cached = cache.get(key);

      if (cached && cached.expiresAt > now) {
        touch(key, cached);
        return cached.promise;
      }

      if (cached && cached.staleAt > now) {
        touch(key, cached);
        if (!cached.refreshing) {
          cached.refreshing = true;
          const refreshed = fetcher();
          refreshed
            .then(() => {
              store(key, refreshed);
            })
            .catch(() => {
              cached.refreshing = false;
            });
        }
        return cached.promise;
      }

      return store(key, fetcher()).promise;
    },
    delete(key) {
      cache.delete(key);
    },
    clear() {
      cache.clear();
    },
  };
}
