export const COLLECTION_CARD_ADDED_EVENT = "dustycards:collection-card-added";

export type CollectionCardAddDestination = "collection" | "for-sale";

export interface CollectionCardAddedDetail {
  cardId: string;
  destination: CollectionCardAddDestination;
}

export interface CollectionCardAddedEffects {
  markOwned: boolean;
  removeWant: boolean;
  collectionCountDelta: number;
  forSaleCountDelta: number;
}

const locallyOwnedCardIds = new Set<string>();

export function getCollectionCardAddedEffects(
  detail: CollectionCardAddedDetail
): CollectionCardAddedEffects {
  const addedForSale = detail.destination === "for-sale";

  return {
    markOwned: !addedForSale,
    removeWant: !addedForSale,
    collectionCountDelta: addedForSale ? 0 : 1,
    forSaleCountDelta: addedForSale ? 1 : 0,
  };
}

export function rememberCollectionCardAdded(detail: CollectionCardAddedDetail) {
  if (getCollectionCardAddedEffects(detail).markOwned) {
    locallyOwnedCardIds.add(detail.cardId);
  }
}

export function resolveCollectionCardOwnedState(cardId: string, serverOwned: boolean): boolean {
  return locallyOwnedCardIds.has(cardId) || serverOwned;
}

export function dispatchCollectionCardAdded(detail: CollectionCardAddedDetail) {
  rememberCollectionCardAdded(detail);
  window.dispatchEvent(
    new CustomEvent<CollectionCardAddedDetail>(COLLECTION_CARD_ADDED_EVENT, { detail })
  );
}
