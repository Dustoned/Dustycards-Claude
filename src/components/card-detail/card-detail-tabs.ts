import type { CardDetailMode, CardDetailTabId } from "@/components/card-detail/CardDetailShell";

const STANDARD_CARD_DETAIL_TAB_ORDER = [
  "overview",
  "market",
  "collection",
] as const satisfies readonly CardDetailTabId[];

const RADAR_CARD_DETAIL_TAB_ORDER = [
  ...STANDARD_CARD_DETAIL_TAB_ORDER,
  "forecast",
  "analysis",
  "evidence",
] as const satisfies readonly CardDetailTabId[];

export function getCardDetailTabOrder(mode: CardDetailMode): readonly CardDetailTabId[] {
  return mode === "radar"
    ? RADAR_CARD_DETAIL_TAB_ORDER
    : STANDARD_CARD_DETAIL_TAB_ORDER;
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
