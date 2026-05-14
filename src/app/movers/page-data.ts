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

const MOVERS_PAGE_CACHE_MS = 15_000;

const moversPageCache = new Map<
  string,
  {
    expiresAt: number;
    promise: Promise<CollectionMoversData | SealedMoversData>;
  }
>();

const valueDriversPageCache = new Map<
  string,
  {
    expiresAt: number;
    promise: Promise<CollectionValueDriversData>;
  }
>();

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

  if (cached && cached.expiresAt > now) {
    return cached.promise;
  }

  const promise =
    activeScope === "sealed"
      ? getSealedMovers(activeItemScope, userId, game)
      : getMovers(activePriceSource, activeScope, activeItemScope, userId, game);
  moversPageCache.set(key, {
    expiresAt: now + MOVERS_PAGE_CACHE_MS,
    promise,
  });
  promise.catch(() => {
    if (moversPageCache.get(key)?.promise === promise) {
      moversPageCache.delete(key);
    }
  });

  return promise;
}

function getCachedValueDrivers(
  userId: string,
  scope: CollectionValueDriversScope,
  game: TradingCardGameFilter
): Promise<CollectionValueDriversData> {
  const key = `${userId}:${game}:value-drivers:${scope}`;
  const now = Date.now();
  const cached = valueDriversPageCache.get(key);

  if (cached && cached.expiresAt > now) {
    return cached.promise;
  }

  const promise = getCollectionValueDriversData(userId, scope, game);
  valueDriversPageCache.set(key, {
    expiresAt: now + MOVERS_PAGE_CACHE_MS,
    promise,
  });
  promise.catch(() => {
    if (valueDriversPageCache.get(key)?.promise === promise) {
      valueDriversPageCache.delete(key);
    }
  });

  return promise;
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
