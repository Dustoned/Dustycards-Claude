import { cookies } from "next/headers";
import { getCollectionMovers, type CollectionMoversData } from "@/lib/movers";
import {
  DEFAULT_SETTINGS,
  parseCookieSettings,
  SETTINGS_COOKIE_NAME,
  type PriceSource,
} from "@/lib/user-settings";

export function normalizeMoversPriceSource(
  value: string | null | undefined,
  fallback: PriceSource
): PriceSource {
  return value === "cm_en" || value === "tcp" ? value : fallback;
}

export function buildMoversSourceHref(pathname: string, source: PriceSource): string {
  return `${pathname}?source=${source}`;
}

export async function loadMoversPageData(sourceOverride?: string | null) {
  const cookieStore = await cookies();
  const settings =
    parseCookieSettings(cookieStore.get(SETTINGS_COOKIE_NAME)?.value) ?? DEFAULT_SETTINGS;
  const activePriceSource = normalizeMoversPriceSource(
    sourceOverride,
    settings.primaryPriceSource
  );
  const data = await getCollectionMovers(activePriceSource);

  return { settings, data, activePriceSource };
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
