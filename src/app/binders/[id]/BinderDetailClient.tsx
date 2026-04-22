"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import CollectionBinderIcon from "@/components/CollectionBinderIcon";
import CollectionCardsView from "@/components/CollectionCardsView";
import EditBinderButton from "@/components/EditBinderButton";
import PriceHistoryPanel from "@/components/PriceHistoryPanel";
import {
  buildOwnedCardValueHistory,
  formatCollectionCurrency,
} from "@/lib/collection";
import type { BinderPageData } from "@/lib/collection-data";
import type { CollectionCardViewItem } from "@/types/collection-view";

function buildVisibleQuantityMap(
  items: CollectionCardViewItem[]
): Map<string, number> {
  const quantities = new Map<string, number>();

  for (const item of items) {
    if (!item.owned) continue;

    quantities.set(
      item.card_id,
      (quantities.get(item.card_id) ?? 0) + (item.owned_count ?? 1)
    );
  }

  return quantities;
}

export default function BinderDetailClient({ data }: { data: BinderPageData }) {
  const [visibleItems, setVisibleItems] = useState<CollectionCardViewItem[]>(data.items);
  const totalCardsLabel =
    data.metrics.totalCards != null
      ? `${data.metrics.ownedCount}/${data.metrics.totalCards}`
      : `${data.metrics.ownedCount}`;
  const accentColor = data.binder.accent_color;

  const visibleOwnedItems = useMemo(
    () => visibleItems.filter((item) => item.owned),
    [visibleItems]
  );
  const visibleQuantities = useMemo(
    () => buildVisibleQuantityMap(visibleItems),
    [visibleItems]
  );
  const visibleCardIds = useMemo(
    () => new Set(visibleOwnedItems.map((item) => item.card_id)),
    [visibleOwnedItems]
  );
  const visibleHistory = useMemo(
    () =>
      buildOwnedCardValueHistory(
        data.priceSnapshots.filter((snapshot) => visibleCardIds.has(snapshot.card_id)),
        visibleQuantities
      ).map((point) => ({
        date: point.date,
        label: point.label,
        value: point.total_market,
      })),
    [data.priceSnapshots, visibleCardIds, visibleQuantities]
  );
  const visibleTotals = useMemo(
    () =>
      visibleOwnedItems.reduce(
        (acc, item) => {
          if (item.current_value == null) return acc;

          acc.total += item.current_value;
          acc.priced += 1;
          return acc;
        },
        { total: 0, priced: 0 }
      ),
    [visibleOwnedItems]
  );
  const currentValue =
    visibleTotals.priced > 0 ? Number(visibleTotals.total.toFixed(2)) : null;
  const showingFilteredSubset = visibleItems.length !== data.items.length;
  const chartPoints =
    !showingFilteredSubset && data.chart.length > 0
      ? data.chart
      : visibleHistory.length > 0
      ? visibleHistory
      : currentValue != null
        ? [{ date: "current", label: "Nu", value: currentValue }]
        : [];
  const priceSubtitle = showingFilteredSubset
    ? visibleOwnedItems.length > 0
      ? `${visibleTotals.priced}/${visibleOwnedItems.length} visible owned cards priced`
      : "No owned cards in the current filter"
    : `Current value ${formatCollectionCurrency(data.metrics.currentValue)}`;

  return (
    <>
      <div
        className="glass relative mb-8 overflow-hidden rounded-3xl px-6 py-6 shadow-lg shadow-black/5 sm:px-8"
        style={
          data.binder.accent_color
            ? { boxShadow: `inset 0 0 0 1px ${data.binder.accent_color}2f` }
            : undefined
        }
      >
        {data.binder.accent_color && (
          <div
            className="absolute inset-x-8 top-0 h-1 rounded-b-full"
            style={{ backgroundColor: accentColor ?? undefined }}
          />
        )}

        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <div
              className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl border border-black/8 bg-white/80 text-gray-500 dark:border-white/10 dark:bg-white/8 dark:text-white/70"
              style={accentColor ? { color: accentColor } : undefined}
            >
              {data.binder.episode?.logo_url ? (
                <div className="relative h-12 w-12">
                  <Image
                    src={data.binder.episode.logo_url}
                    alt={data.binder.name}
                    fill
                    className="object-contain"
                    unoptimized
                  />
                </div>
              ) : (
                <CollectionBinderIcon iconName={data.binder.icon_name} className="h-8 w-8" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                {data.binder.name}
              </h1>
              <p className="mt-2 text-sm text-gray-500 dark:text-white/50">
                {data.binder.episode
                  ? `${data.binder.episode.series ?? "Set"} / ${data.binder.episode.name}`
                  : "Custom binder"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-gray-500 dark:text-white/50">
                <span className="rounded-full border border-black/8 bg-black/[0.03] px-3 py-1 dark:border-white/8 dark:bg-white/[0.04]">
                  {data.metrics.totalCards != null ? "Set progress" : "Cards"} {totalCardsLabel}
                </span>
                <span className="rounded-full border border-black/8 bg-black/[0.03] px-3 py-1 dark:border-white/8 dark:bg-white/[0.04]">
                  Invested {formatCollectionCurrency(data.metrics.investment)}
                </span>
                <span className="rounded-full border border-black/8 bg-black/[0.03] px-3 py-1 dark:border-white/8 dark:bg-white/[0.04]">
                  P&amp;L {data.metrics.pnl >= 0 ? "+" : ""}
                  {formatCollectionCurrency(data.metrics.pnl)}
                </span>
              </div>
            </div>
          </div>

          <EditBinderButton
            binder={{
              id: data.binder.id,
              name: data.binder.name,
              type: data.binder.type,
              accent_color: data.binder.accent_color,
              icon_name: data.binder.icon_name,
              base_purchase_price: data.binder.base_purchase_price,
              episode: data.binder.episode
                ? {
                    name: data.binder.episode.name,
                    code: data.binder.episode.code,
                    logo_url: data.binder.episode.logo_url,
                  }
                : null,
            }}
          />
        </div>

        <div className="mt-6">
          <PriceHistoryPanel
            title={showingFilteredSubset ? "Filtered Collection Value" : "Binder Value"}
            currency="EUR"
            points={chartPoints}
            currentValue={currentValue}
            subtitle={priceSubtitle}
            emptyText="Add cards to start tracking this binder"
          />
        </div>
      </div>

      <CollectionCardsView
        items={data.items}
        blurMissing={data.binder.type === "linked_set"}
        showFilters
        onVisibleItemsChange={setVisibleItems}
        emptyTitle="No cards in this binder"
        emptyText={
          data.binder.type === "linked_set"
            ? "This linked binder has no cards in the source set yet."
            : "Add cards and assign them to this binder to see them here."
        }
        bulkAddBinder={{
          id: data.binder.id,
          name: data.binder.name,
        }}
      />
    </>
  );
}
