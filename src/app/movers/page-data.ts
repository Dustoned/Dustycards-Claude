import { cookies } from "next/headers";
import {
  getMovers,
  type CollectionMoversData,
  type MoversItemScope,
  type MoversScope,
} from "@/lib/movers";
import {
  DEFAULT_SETTINGS,
  parseCookieSettings,
  SETTINGS_COOKIE_NAME,
} from "@/lib/user-settings";
import {
  buildMoversSourceHref,
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
    promise: Promise<CollectionMoversData>;
  }
>();

function getCachedMovers(
  activePriceSource: ReturnType<typeof normalizeMoversPriceSource>,
  activeScope: MoversScope,
  activeItemScope: MoversItemScope
): Promise<CollectionMoversData> {
  const key = `${activePriceSource}:${activeScope}:${activeItemScope}`;
  const now = Date.now();
  const cached = moversPageCache.get(key);

  if (cached && cached.expiresAt > now) {
    return cached.promise;
  }

  const promise = getMovers(activePriceSource, activeScope, activeItemScope);
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

export async function loadMoversPageData(
  sourceOverride?: string | null,
  scopeOverride?: string | null,
  itemScopeOverride?: string | null
) {
  const cookieStore = await cookies();
  const settings =
    parseCookieSettings(cookieStore.get(SETTINGS_COOKIE_NAME)?.value) ?? DEFAULT_SETTINGS;
  const activePriceSource = normalizeMoversPriceSource(
    sourceOverride,
    settings.primaryPriceSource
  );
  const activeScope: MoversScope = normalizeMoversScope(scopeOverride);
  const activeItemScope: MoversItemScope =
    activeScope === "all"
      ? "all"
      : activeScope === "collection"
        ? "collection"
        : normalizeMoversItemScope(itemScopeOverride, "all");
  const data = await getCachedMovers(activePriceSource, activeScope, activeItemScope);

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
