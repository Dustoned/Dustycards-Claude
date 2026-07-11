import type { CollectionCardViewItem } from "@/types/collection-view";

export const FEATURED_COLLECTION_CARD_LIMIT = 24;

export function getFeaturedCollectionCards(
  cards: CollectionCardViewItem[],
  limit = FEATURED_COLLECTION_CARD_LIMIT
): CollectionCardViewItem[] {
  return [...cards]
    .filter((item) => item.current_value != null && item.current_value > 0)
    .sort((a, b) => (b.current_value ?? 0) - (a.current_value ?? 0))
    .slice(0, limit);
}
