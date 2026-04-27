"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import CollectionBinderIcon from "@/components/CollectionBinderIcon";
import CollectionCardsView from "@/components/CollectionCardsView";
import EditBinderButton from "@/components/EditBinderButton";
import { HeaderMetricChip, HeaderProgressMeter, PageHeroHeader } from "@/components/PageHeader";
import {
  buildOwnedCardValueHistory,
  formatCollectionCurrency,
} from "@/lib/collection";
import type { BinderPageData } from "@/lib/collection-data";
import type { CollectionCardViewItem } from "@/types/collection-view";

const PriceHistoryPanel = dynamic(() => import("@/components/PriceHistoryPanel"), {
  loading: () => (
    <section className="h-48 rounded-[28px] border border-black/8 bg-black/[0.03] dark:border-white/8 dark:bg-white/[0.04]" />
  ),
});

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
  const pnlTone = data.metrics.pnl >= 0 ? "emerald" : "rose";
  const progressPercent =
    data.metrics.totalCards != null && data.metrics.totalCards > 0
      ? Math.round((data.metrics.ownedCount / data.metrics.totalCards) * 100)
      : null;

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
      <PageHeroHeader
        className="mb-8"
        eyebrow={data.binder.episode ? "Linked Binder" : "Collection Binder"}
        title={data.binder.name}
        accentColor={accentColor}
        gridClassName="xl:grid-cols-[minmax(0,1.2fr)_minmax(28rem,0.8fr)] xl:items-stretch 2xl:grid-cols-[minmax(0,1.24fr)_minmax(28rem,0.76fr)]"
        style={
          data.binder.accent_color
            ? { boxShadow: `inset 0 0 0 1px ${data.binder.accent_color}2f` }
            : undefined
        }
        leadingVisual={
            <div
              className="flex h-[var(--ui-binder-header-logo-size)] w-[var(--ui-binder-header-logo-size)] shrink-0 items-center justify-center rounded-[var(--ui-page-header-radius)] border border-black/8 bg-white/80 p-[var(--ui-binder-header-logo-padding)] text-gray-500 shadow-sm shadow-black/10 dark:border-white/10 dark:bg-white/8 dark:text-white/70"
              style={accentColor ? { color: accentColor } : undefined}
            >
              {data.binder.episode?.logo_url ? (
                <div className="relative h-full w-full">
                  <Image
                    src={data.binder.episode.logo_url}
                    alt={data.binder.name}
                    fill
                    className="object-contain"
                    unoptimized
                  />
                </div>
              ) : (
                <CollectionBinderIcon iconName={data.binder.icon_name} className="h-[45%] w-[45%]" />
              )}
            </div>
        }
        description={
          <div className="space-y-5">
            <p className="text-[length:var(--ui-page-header-description-size)] font-medium text-gray-600 dark:text-white/62">
              {data.binder.episode
                ? `${data.binder.episode.series ?? "Set"} / ${data.binder.episode.name}`
                : "Custom binder"}
            </p>
            <div className="flex flex-wrap items-stretch gap-3">
              {data.metrics.totalCards != null ? (
                <HeaderProgressMeter
                  label="Set Progress"
                  value={`${data.metrics.ownedCount} / ${data.metrics.totalCards}`}
                  percent={progressPercent ?? 0}
                  accentColor={accentColor}
                />
              ) : (
                <HeaderMetricChip label="Cards" value={totalCardsLabel} tone="sky" />
              )}
              <HeaderMetricChip
                label="Set Spend"
                value={formatCollectionCurrency(data.metrics.investment)}
                tone="amber"
              />
              <HeaderMetricChip
                label="P&L"
                value={`${data.metrics.pnl >= 0 ? "+" : ""}${formatCollectionCurrency(
                  data.metrics.pnl
                )}`}
                tone={pnlTone}
              />
              {progressPercent != null && (
                <HeaderMetricChip label="Complete" value={`${progressPercent}%`} tone="emerald" />
              )}
            </div>
          </div>
        }
        titleActions={
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
        }
        accessory={
          <PriceHistoryPanel
            title={showingFilteredSubset ? "Filtered Collection Value" : "Binder Value"}
            currency="EUR"
            points={chartPoints}
            currentValue={currentValue}
            subtitle={priceSubtitle}
            emptyText="Add cards to start tracking this binder"
          />
        }
        sideClassName="[&>section]:h-full"
      />

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
