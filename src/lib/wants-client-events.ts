export const WANTS_CHANGED_EVENT = "dustycards:wants-changed";

export interface WantsChangedItem {
  id: string;
  created_at: string;
}

export interface WantsChangedDetail {
  cardId: string;
  wanted: boolean;
  item: WantsChangedItem | null;
}

export interface ClientWantState {
  wanted: boolean;
  itemId: string | null;
}

const wantStateByCard = new Map<string, WantsChangedDetail>();

export function getCachedWantState(cardId: string): WantsChangedDetail | undefined {
  return wantStateByCard.get(cardId);
}

export function rememberWantState(detail: WantsChangedDetail) {
  wantStateByCard.set(detail.cardId, detail);
}

export function resolveWantState(cardId: string, fallback: ClientWantState): ClientWantState {
  const cached = getCachedWantState(cardId);
  if (!cached) return fallback;

  return {
    wanted: cached.wanted,
    itemId: cached.item?.id ?? null,
  };
}

export function dispatchWantsChanged(detail: WantsChangedDetail) {
  rememberWantState(detail);
  window.dispatchEvent(new CustomEvent<WantsChangedDetail>(WANTS_CHANGED_EVENT, { detail }));
}
