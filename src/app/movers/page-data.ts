import { cookies } from "next/headers";
import { getMovers, type CollectionMoversData, type MoversScope } from "@/lib/movers";
import {
  DEFAULT_SETTINGS,
  parseCookieSettings,
  SETTINGS_COOKIE_NAME,
} from "@/lib/user-settings";
import {
  buildMoversSourceHref,
  normalizeMoversPriceSource,
  normalizeMoversScope,
} from "@/app/movers/routing";

export { buildMoversSourceHref, normalizeMoversPriceSource, normalizeMoversScope };

export async function loadMoversPageData(
  sourceOverride?: string | null,
  scopeOverride?: string | null
) {
  const cookieStore = await cookies();
  const settings =
    parseCookieSettings(cookieStore.get(SETTINGS_COOKIE_NAME)?.value) ?? DEFAULT_SETTINGS;
  const activePriceSource = normalizeMoversPriceSource(
    sourceOverride,
    settings.primaryPriceSource
  );
  const activeScope: MoversScope = normalizeMoversScope(scopeOverride);
  const data = await getMovers(activePriceSource, activeScope);

  return { settings, data, activePriceSource, activeScope };
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
