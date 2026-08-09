import { getFeaturedCollectionCards } from "@/lib/featured-cards";
import type {
  CollectionOverviewData,
  CollectionValueDriversData,
} from "@/lib/collection-data";

// Home can use the full widescreen canvas. Keep enough ranked cards available
// for one complete ultrawide row; the client still renders only the measured
// desktop column count or two complete mobile rows.
export const HOME_FEATURED_CARD_LIMIT = 48;

// Keep twelve ranked items per lane available for a compact six-column card
// wall on ultra-wide screens while phones continue to use two columns.
export const HOME_VALUE_DRIVER_LANE_LIMIT = 12;

export function getHomeFeaturedCards(cards: CollectionOverviewData["cards"]) {
  return getFeaturedCollectionCards(cards, HOME_FEATURED_CARD_LIMIT);
}

export function getHomeValueDriversPreview(
  data: CollectionValueDriversData
): CollectionValueDriversData {
  return {
    ...data,
    gains: data.gains.slice(0, HOME_VALUE_DRIVER_LANE_LIMIT),
    drops: data.drops.slice(0, HOME_VALUE_DRIVER_LANE_LIMIT),
  };
}
