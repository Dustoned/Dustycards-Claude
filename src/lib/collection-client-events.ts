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
const collectionListenersByCard = new Map<
  string,
  Set<(detail: CollectionCardAddedDetail) => void>
>();
let collectionWindowListener: ((event: Event) => void) | null = null;

function ensureCollectionWindowListener() {
  if (collectionWindowListener || typeof window === "undefined") return;
  collectionWindowListener = (event: Event) => {
    const detail = (event as CustomEvent<CollectionCardAddedDetail>).detail;
    if (!detail) return;
    rememberCollectionCardAdded(detail);
    collectionListenersByCard.get(detail.cardId)?.forEach((listener) => listener(detail));
  };
  window.addEventListener(COLLECTION_CARD_ADDED_EVENT, collectionWindowListener);
}

export function subscribeCollectionCardAdded(
  cardId: string,
  listener: (detail: CollectionCardAddedDetail) => void
): () => void {
  ensureCollectionWindowListener();
  const listeners = collectionListenersByCard.get(cardId) ?? new Set();
  listeners.add(listener);
  collectionListenersByCard.set(cardId, listeners);

  return () => {
    const current = collectionListenersByCard.get(cardId);
    current?.delete(listener);
    if (current?.size === 0) collectionListenersByCard.delete(cardId);
    if (
      collectionListenersByCard.size === 0 &&
      collectionWindowListener &&
      typeof window !== "undefined"
    ) {
      window.removeEventListener(COLLECTION_CARD_ADDED_EVENT, collectionWindowListener);
      collectionWindowListener = null;
    }
  };
}

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
