import { getFeaturedCollectionCards } from "@/lib/featured-cards";
import type {
  CollectionOverviewData,
  CollectionValueDriversData,
} from "@/lib/collection-data";

// Home can use the full widescreen canvas. Keep enough ranked cards available
// for one complete ultrawide row; the client still renders only the measured
// desktop column count or two complete mobile rows.
export const HOME_FEATURED_CARD_LIMIT = 48;
export const HOME_FEATURED_SEALED_LIMIT = 8;

// Keep twelve ranked items per lane available for a compact six-column card
// wall on ultra-wide screens while phones continue to use two columns.
export const HOME_VALUE_DRIVER_LANE_LIMIT = 12;

export function getHomeFeaturedCards(cards: CollectionOverviewData["cards"]) {
  return getFeaturedCollectionCards(cards, HOME_FEATURED_CARD_LIMIT);
}

export function getHomeFeaturedSealed(sealed: CollectionOverviewData["sealed"]) {
  return [...sealed]
    .sort((left, right) => {
      const leftMarket = left.current_value_per_item == null
        ? Number.NEGATIVE_INFINITY
        : left.current_value_per_item * left.quantity;
      const rightMarket = right.current_value_per_item == null
        ? Number.NEGATIVE_INFINITY
        : right.current_value_per_item * right.quantity;
      if (leftMarket !== rightMarket) return rightMarket - leftMarket;

      const leftPaid = left.purchase_price_per_item == null
        ? Number.NEGATIVE_INFINITY
        : left.purchase_price_per_item * left.quantity;
      const rightPaid = right.purchase_price_per_item == null
        ? Number.NEGATIVE_INFINITY
        : right.purchase_price_per_item * right.quantity;
      if (leftPaid !== rightPaid) return rightPaid - leftPaid;

      return left.name.localeCompare(right.name, undefined, {
        sensitivity: "base",
        numeric: true,
      });
    })
    .slice(0, HOME_FEATURED_SEALED_LIMIT);
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
