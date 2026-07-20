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
const wantsListenersByCard = new Map<
  string,
  Set<(detail: WantsChangedDetail) => void>
>();
let wantsWindowListener: ((event: Event) => void) | null = null;

function ensureWantsWindowListener() {
  if (wantsWindowListener || typeof window === "undefined") return;
  wantsWindowListener = (event: Event) => {
    const detail = (event as CustomEvent<WantsChangedDetail>).detail;
    if (!detail) return;
    rememberWantState(detail);
    wantsListenersByCard.get(detail.cardId)?.forEach((listener) => listener(detail));
  };
  window.addEventListener(WANTS_CHANGED_EVENT, wantsWindowListener);
}

export function subscribeWantsChanged(
  cardId: string,
  listener: (detail: WantsChangedDetail) => void
): () => void {
  ensureWantsWindowListener();
  const listeners = wantsListenersByCard.get(cardId) ?? new Set();
  listeners.add(listener);
  wantsListenersByCard.set(cardId, listeners);

  return () => {
    const current = wantsListenersByCard.get(cardId);
    current?.delete(listener);
    if (current?.size === 0) wantsListenersByCard.delete(cardId);
    if (wantsListenersByCard.size === 0 && wantsWindowListener && typeof window !== "undefined") {
      window.removeEventListener(WANTS_CHANGED_EVENT, wantsWindowListener);
      wantsWindowListener = null;
    }
  };
}

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
