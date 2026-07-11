"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Coins, Layers, TrendingDown, TrendingUp, WalletCards } from "lucide-react";
import CollectionBinderIcon from "@/components/CollectionBinderIcon";
import CollectionCardsView from "@/components/CollectionCardsView";
import EditBinderButton from "@/components/EditBinderButton";
import BackNavigationLink from "@/components/BackNavigationLink";
import { HeaderStatCard, PageHeroHeader } from "@/components/PageHeader";
import {
  buildOwnedCardValueHistory,
  formatCollectionCurrency,
} from "@/lib/collection";
import { getCachedImageUrl } from "@/lib/image-cache";
import type { BinderHistoryRange, BinderPageData } from "@/lib/collection-data";
import type { CollectionCardViewItem } from "@/types/collection-view";

const PriceHistoryPanel = dynamic(() => import("@/components/PriceHistoryPanel"), {
  loading: () => (
    <section className="min-h-[var(--ui-dashboard-header-panel-min-height)] rounded-[var(--ui-page-header-radius)] border border-white/8 bg-white/[0.04]" />
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

function BinderHistoryRangeSwitch({
  binderId,
  historyRange,
  recentHistoryDays,
}: {
  binderId: string;
  historyRange: BinderHistoryRange;
  recentHistoryDays: number;
}) {
  const items = [
    {
      key: "recent" as const,
      label: `${recentHistoryDays}D`,
      href: `/binders/${binderId}`,
      title: `Show the last ${recentHistoryDays} days`,
    },
    {
      key: "all" as const,
      label: "All",
      href: `/binders/${binderId}?history=all`,
      title: "Load all binder history",
    },
  ];

  return (
    <nav
      aria-label="Binder chart history range"
      className="inline-flex min-h-[var(--ui-chip-min-height)] items-center overflow-hidden rounded-full border border-white/10 bg-white/[0.055] p-1 shadow-sm shadow-black/20"
    >
      <span className="px-2 text-[10px] font-black uppercase tracking-[0.12em] text-white/38">
        Data
      </span>
      {items.map((item) => {
        const active = historyRange === item.key;

        return (
          <Link
            key={item.key}
            href={item.href}
            prefetch={false}
            aria-current={active ? "page" : undefined}
            title={item.title}
            className={`inline-flex min-h-7 min-w-12 items-center justify-center rounded-full px-2.5 text-[11px] font-bold leading-none transition-colors ${
              active
                ? "border border-violet-400/40 bg-violet-600 text-white"
                : "border border-transparent text-white/58 hover:bg-white/[0.07] hover:text-white"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function BinderDetailClient({
  data,
  historyRange,
  recentHistoryDays,
}: {
  data: BinderPageData;
  historyRange: BinderHistoryRange;
  recentHistoryDays: number;
}) {
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
  const chartValuePoints = chartPoints.filter((point) => point.value != null);
  const chartDeltaValue = chartValuePoints[chartValuePoints.length - 1]?.value ?? null;
  const historyRangeLabel = historyRange === "all" ? "all time" : `${recentHistoryDays}D`;
  const priceSubtitle = showingFilteredSubset
    ? visibleOwnedItems.length > 0
      ? `${visibleTotals.priced}/${visibleOwnedItems.length} visible owned cards priced / ${historyRangeLabel}`
      : "No owned cards in the current filter"
    : `Current value ${formatCollectionCurrency(data.metrics.currentValue)} / ${historyRangeLabel}`;
  const headerDescription = data.binder.episode
    ? `${data.binder.episode.series ?? "Set"} / ${data.binder.episode.name}`
    : "Custom binder";
  const headerValue = showingFilteredSubset ? currentValue : data.metrics.currentValue;
  const headerValueHint = showingFilteredSubset
    ? visibleOwnedItems.length > 0
      ? `${visibleTotals.priced}/${visibleOwnedItems.length} visible priced`
      : "No owned cards in filter"
    : "Binder market value";
  const pnlLabel = `${data.metrics.pnl >= 0 ? "+" : ""}${formatCollectionCurrency(
    data.metrics.pnl
  )}`;

  return (
    <>
      <PageHeroHeader
        className="mb-5 sm:mb-6"
        title={data.binder.name}
        description={headerDescription}
        gridClassName="xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] xl:items-stretch"
        backLinks={
          <BackNavigationLink
            href="/?tab=binders"
            className="hidden items-center gap-2 font-medium text-gray-500 transition-colors hover:text-gray-900 dark:text-white/50 dark:hover:text-white sm:inline-flex"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to collection
          </BackNavigationLink>
        }
        leadingVisual={
          <div
            className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-[var(--ui-page-header-radius)] border border-white/10 bg-white/[0.06] p-2 text-white/70 shadow-sm shadow-black/20 sm:flex lg:h-16 lg:w-16"
            style={accentColor ? { color: accentColor } : undefined}
          >
            {data.binder.episode?.logo_url ? (
              <div className="relative h-full w-full">
                <Image
                  src={getCachedImageUrl(data.binder.episode.logo_url) ?? data.binder.episode.logo_url}
                  alt={data.binder.name}
                  fill
                  className="object-contain drop-shadow"
                  unoptimized
                />
              </div>
            ) : (
              <CollectionBinderIcon iconName={data.binder.icon_name} className="h-[45%] w-[45%]" />
            )}
          </div>
        }
        sideContent={
          <>
            <HeaderStatCard
              label={data.metrics.totalCards != null ? "Set Progress" : "Cards"}
              value={totalCardsLabel}
              hint={
                progressPercent != null
                  ? `${progressPercent}% complete`
                  : "Cards in binder"
              }
              Icon={progressPercent != null ? CheckCircle2 : Layers}
              tone={progressPercent != null ? "emerald" : "sky"}
            />
            <HeaderStatCard
              label={showingFilteredSubset ? "Visible Value" : "Binder Value"}
              value={headerValue != null ? formatCollectionCurrency(headerValue) : "--"}
              hint={headerValueHint}
              Icon={Coins}
              tone="emerald"
            />
            <HeaderStatCard
              label="Overall Spend"
              value={formatCollectionCurrency(data.metrics.investment)}
              hint="Paid into binder"
              Icon={WalletCards}
              tone="amber"
            />
            <HeaderStatCard
              label="P&L"
              value={pnlLabel}
              hint={data.metrics.pnl >= 0 ? "Above spend" : "Below spend"}
              Icon={data.metrics.pnl >= 0 ? TrendingUp : TrendingDown}
              tone={pnlTone}
            />
          </>
        }
        sideClassName="grid min-w-0 auto-rows-fr grid-cols-2 gap-2 sm:gap-3 xl:grid-rows-2 xl:gap-3"
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
            layout="dashboard"
            title={showingFilteredSubset ? "Filtered Collection Value" : "Binder Value"}
            currency="EUR"
            points={chartPoints}
            currentValue={currentValue}
            deltaValue={chartDeltaValue}
            subtitle={priceSubtitle}
            headerAccessory={
              <BinderHistoryRangeSwitch
                binderId={data.binder.id}
                historyRange={historyRange}
                recentHistoryDays={recentHistoryDays}
              />
            }
            emptyText="Add cards to start tracking this binder"
          />
        }
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
