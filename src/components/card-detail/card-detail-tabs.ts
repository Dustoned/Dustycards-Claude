import type { CardDetailMode, CardDetailTabId } from "@/components/card-detail/CardDetailShell";

const CARD_DETAIL_TAB_ORDER = [
  "overview",
  "market",
  "collection",
  "forecast",
  "analysis",
  "evidence",
] as const satisfies readonly CardDetailTabId[];

const CARD_DETAIL_TAB_ORDERS: Record<CardDetailMode, readonly CardDetailTabId[]> = {
  standard: CARD_DETAIL_TAB_ORDER,
};

export function getCardDetailTabOrder(mode: CardDetailMode): readonly CardDetailTabId[] {
  return CARD_DETAIL_TAB_ORDERS[mode];
}

export function orderCardDetailTabs<T extends { id: CardDetailTabId }>(
  mode: CardDetailMode,
  tabs: readonly T[]
): T[] {
  const tabsById = new Map(tabs.map((tab) => [tab.id, tab]));
  return getCardDetailTabOrder(mode).flatMap((id) => {
    const tab = tabsById.get(id);
    return tab ? [tab] : [];
  });
}
