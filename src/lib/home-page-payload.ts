import { getFeaturedCollectionCards } from "@/lib/featured-cards";
import type {
  CollectionOverviewData,
  CollectionValueDriversData,
} from "@/lib/collection-data";

// Home can use the full widescreen canvas. Keep enough ranked cards available
// for one complete ultrawide row; the client still renders only the measured
// desktop column count or two complete mobile rows.
export const HOME_FEATURED_CARD_LIMIT = 48;

// HomeValueDriversPanel displays six rows per lane so its widescreen density
// matches Sudden Price Drops (four card rows plus two sealed rows). Keep totals
// and source breakdown intact without shipping hidden rows through RSC.
export const HOME_VALUE_DRIVER_LANE_LIMIT = 6;

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
