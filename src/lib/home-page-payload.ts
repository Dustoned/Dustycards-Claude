import { getFeaturedCollectionCards } from "@/lib/featured-cards";
import type {
  CollectionOverviewData,
  CollectionValueDriversData,
} from "@/lib/collection-data";

// The home card rail is one desktop row or two mobile rows. Even the smallest
// desktop card setting cannot fit more than ten cards inside the 1280px home
// canvas, so sixteen leaves comfortable resize headroom without serializing all
// 24 rich collection records into every Home response.
export const HOME_FEATURED_CARD_LIMIT = 16;

// HomeValueDriversPanel displays four rows per lane. Keep its totals and source
// breakdown intact, but do not ship the hidden rows through the RSC boundary.
export const HOME_VALUE_DRIVER_LANE_LIMIT = 4;

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
