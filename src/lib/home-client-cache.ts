const HOME_CLIENT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const HOME_CLIENT_CACHE_VERSION = 3;

type HomeCacheNamespace = "collection-insights" | "sudden-drops";

interface HomeClientCacheEntry {
  version: number;
  expiresAt: number;
  value: unknown;
}

const homeClientCache = new Map<string, HomeClientCacheEntry>();

function buildCacheKey(namespace: HomeCacheNamespace, accountId: string, endpoint: string): string {
  return `${namespace}:${accountId}:${endpoint}`;
}

export function readHomeClientCache<T>(
  namespace: HomeCacheNamespace,
  accountId: string,
  endpoint: string
): T | null {
  const key = buildCacheKey(namespace, accountId, endpoint);
  const entry = homeClientCache.get(key);
  if (!entry) return null;

  if (entry.version !== HOME_CLIENT_CACHE_VERSION || entry.expiresAt <= Date.now()) {
    homeClientCache.delete(key);
    return null;
  }

  return entry.value as T;
}

export function writeHomeClientCache<T>(
  namespace: HomeCacheNamespace,
  accountId: string,
  endpoint: string,
  value: T
) {
  homeClientCache.set(buildCacheKey(namespace, accountId, endpoint), {
    version: HOME_CLIENT_CACHE_VERSION,
    expiresAt: Date.now() + HOME_CLIENT_CACHE_TTL_MS,
    value,
  });
}

export function invalidateCollectionHomeClientCache() {
  for (const key of homeClientCache.keys()) {
    if (key.startsWith("collection-insights:")) homeClientCache.delete(key);
  }
}

export function invalidateMarketHomeClientCache() {
  homeClientCache.clear();
}
