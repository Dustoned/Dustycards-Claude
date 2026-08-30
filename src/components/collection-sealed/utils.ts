import type { SealedModalProductData } from "@/components/sealed-modal/types";
import type { CollectionSealedViewItem } from "./types";

export function selectionToggleTextClass(active: boolean): string {
  if (active) {
    return "shrink-0 text-[length:var(--ui-chip-font-size)] font-semibold text-blue-600 transition-colors hover:text-blue-500 dark:text-blue-300 dark:hover:text-blue-200";
  }

  return "shrink-0 text-[length:var(--ui-chip-font-size)] font-medium text-gray-400 transition-colors hover:text-gray-900 dark:text-white/45 dark:hover:text-white/75";
}

export function buildModalProduct(item: CollectionSealedViewItem): SealedModalProductData {
  return {
    id: item.product_id,
    collection_item_id: item.id,
    name: item.name,
    image_url: item.image_url,
    cardmarket_url: item.cardmarket_url,
    episode: {
      id: item.episode_id,
      name: item.episode_name,
      code: item.episode_code,
    },
    price: {
      cm_lowest: null,
      cm_lowest_eu: item.current_value_per_item,
      cm_lowest_de: null,
      cm_lowest_fr: null,
      cm_lowest_es: null,
      cm_lowest_it: null,
      cm_avg_7d: null,
      cm_avg_30d: null,
    },
  };
}

export function buildCollectionAddProduct(item: CollectionSealedViewItem) {
  return {
    id: item.product_id,
    name: item.name,
    image_url: item.image_url,
    episode: {
      id: item.episode_id,
      name: item.episode_name,
      code: item.episode_code,
    },
  };
}

export function getCollectionSealedCurrentTotal(item: CollectionSealedViewItem): number | null {
  if (item.current_value_per_item == null) {
    return null;
  }

  return Number((item.current_value_per_item * item.quantity).toFixed(2));
}

export function getCollectionSealedUnitValue(item: CollectionSealedViewItem): number | null {
  return item.current_value_per_item;
}

export function getCollectionSealedPaidTotal(item: CollectionSealedViewItem): number | null {
  if (item.purchase_price_per_item == null) {
    return null;
  }

  return Number((item.purchase_price_per_item * item.quantity).toFixed(2));
}

export function getCollectionSealedPnl(item: CollectionSealedViewItem): number | null {
  const currentTotal = getCollectionSealedCurrentTotal(item);
  const paidTotal = getCollectionSealedPaidTotal(item);

  if (currentTotal == null || paidTotal == null) {
    return null;
  }

  return Number((currentTotal - paidTotal).toFixed(2));
}

export function getCollectionSealedPnlPercent(
  item: CollectionSealedViewItem
): number | null {
  const paidTotal = getCollectionSealedPaidTotal(item);
  const pnl = getCollectionSealedPnl(item);

  if (paidTotal == null || paidTotal <= 0 || pnl == null) {
    return null;
  }

  return Number(((pnl / paidTotal) * 100).toFixed(1));
}

export interface CollectionSealedStats {
  productCount: number;
  unitCount: number;
  marketValue: number | null;
  investment: number | null;
  pnl: number | null;
  pnlPercent: number | null;
}

export function getCollectionSealedStats(
  items: CollectionSealedViewItem[]
): CollectionSealedStats {
  let marketValue = 0;
  let pricedProducts = 0;
  let investment = 0;
  let costedProducts = 0;
  let pnl = 0;
  let pnlBasis = 0;
  let comparableProducts = 0;

  for (const item of items) {
    const currentTotal = getCollectionSealedCurrentTotal(item);
    const paidTotal = getCollectionSealedPaidTotal(item);

    if (currentTotal != null) {
      marketValue += currentTotal;
      pricedProducts += 1;
    }
    if (paidTotal != null) {
      investment += paidTotal;
      costedProducts += 1;
    }
    if (currentTotal != null && paidTotal != null) {
      pnl += currentTotal - paidTotal;
      pnlBasis += paidTotal;
      comparableProducts += 1;
    }
  }

  const roundedPnl = Number(pnl.toFixed(2));
  return {
    productCount: items.length,
    unitCount: items.reduce((total, item) => total + item.quantity, 0),
    marketValue: pricedProducts > 0 ? Number(marketValue.toFixed(2)) : null,
    investment: costedProducts > 0 ? Number(investment.toFixed(2)) : null,
    pnl: comparableProducts > 0 ? roundedPnl : null,
    pnlPercent: pnlBasis > 0 ? Number(((roundedPnl / pnlBasis) * 100).toFixed(1)) : null,
  };
}

export function compareCollectionSealedItems(
  a: CollectionSealedViewItem,
  b: CollectionSealedViewItem
): number {
  const currentDiff =
    (getCollectionSealedCurrentTotal(b) ?? Number.NEGATIVE_INFINITY) -
    (getCollectionSealedCurrentTotal(a) ?? Number.NEGATIVE_INFINITY);
  if (currentDiff !== 0) {
    return currentDiff;
  }

  const paidDiff =
    (getCollectionSealedPaidTotal(b) ?? Number.NEGATIVE_INFINITY) -
    (getCollectionSealedPaidTotal(a) ?? Number.NEGATIVE_INFINITY);
  if (paidDiff !== 0) {
    return paidDiff;
  }

  return a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });
}
