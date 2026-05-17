"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import CollectionBinderIcon from "@/components/CollectionBinderIcon";
import CollectionCardsView from "@/components/CollectionCardsView";
import { HeaderMetricChip, HeaderProgressMeter, PageHeroHeader } from "@/components/PageHeader";
import { formatCollectionCurrency } from "@/lib/collection";
import type { WantBinderPageData } from "@/lib/collection-data";
import { getCachedImageUrl } from "@/lib/image-cache";

const PriceHistoryPanel = dynamic(() => import("@/components/PriceHistoryPanel"), {
  loading: () => (
    <section className="h-48 rounded-[28px] border border-black/8 bg-black/[0.03] dark:border-white/8 dark:bg-white/[0.04]" />
  ),
});

export default function WantBinderDetailClient({ data }: { data: WantBinderPageData }) {
  const accentColor = data.binder.accent_color;
  const progressPercent =
    data.metrics.totalCards > 0
      ? Math.round((data.metrics.ownedCount / data.metrics.totalCards) * 100)
      : 0;
  const pricedLabel = `${data.metrics.pricedCards.toLocaleString("en-US")} / ${data.metrics.visibleMissingCards.toLocaleString(
    "en-US"
  )}`;
  const chartPoints =
    data.chart.length > 0
      ? data.chart
      : data.metrics.estimatedCost > 0
        ? [
            {
              date: "current",
              label: "Current",
              value: data.metrics.estimatedCost,
            },
          ]
        : [];

  return (
    <>
      <PageHeroHeader
        className="mb-8 xl:[--ui-page-header-title-size:2.2rem] max-[640px]:[--ui-page-header-padding:0.85rem] max-[640px]:[--ui-page-header-title-size:1.55rem] max-[640px]:[--ui-page-header-description-size:0.78rem]"
        eyebrow="Missing Binder Wants"
        title={data.binder.name}
        accentColor={accentColor}
        gridClassName="xl:grid-cols-[minmax(0,1.08fr)_minmax(28rem,0.92fr)] xl:items-stretch"
        style={accentColor ? { boxShadow: `inset 0 0 0 1px ${accentColor}2f` } : undefined}
        leadingVisual={
          <div
            className="flex h-[var(--ui-binder-header-logo-size)] w-[var(--ui-binder-header-logo-size)] shrink-0 items-center justify-center rounded-[var(--ui-page-header-radius)] border border-black/8 bg-white/80 p-[var(--ui-binder-header-logo-padding)] text-gray-500 shadow-sm shadow-black/10 dark:border-white/10 dark:bg-white/8 dark:text-white/70"
            style={accentColor ? { color: accentColor } : undefined}
          >
            {data.binder.episode.logo_url ? (
              <div className="relative h-full w-full">
                <Image
                  src={getCachedImageUrl(data.binder.episode.logo_url) ?? data.binder.episode.logo_url}
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
              {(data.binder.episode.series ?? "Set") + " / " + data.binder.episode.name}
            </p>
            <div className="flex flex-wrap items-stretch gap-3">
              <HeaderProgressMeter
                label="Set Progress"
                value={`${data.metrics.ownedCount} / ${data.metrics.totalCards}`}
                percent={progressPercent}
                accentColor={accentColor}
              />
              <HeaderMetricChip
                label="Missing"
                value={data.metrics.visibleMissingCards.toLocaleString("en-US")}
                tone="rose"
              />
              <HeaderMetricChip
                label="Est. Cost"
                value={formatCollectionCurrency(data.metrics.estimatedCost)}
                tone="amber"
              />
              <HeaderMetricChip label="Priced" value={pricedLabel} tone="emerald" />
              {data.metrics.hiddenCards > 0 ? (
                <HeaderMetricChip
                  label="Hidden"
                  value={data.metrics.hiddenCards.toLocaleString("en-US")}
                  tone="slate"
                />
              ) : null}
            </div>
          </div>
        }
        accessory={
          <PriceHistoryPanel
            title="Missing Wants Value"
            currency="EUR"
            points={chartPoints}
            currentValue={data.metrics.pricedCards > 0 ? data.metrics.estimatedCost : null}
            subtitle={`${pricedLabel} missing cards priced`}
            emptyText="Missing cards without prices will appear here once price history exists"
            rangeStorageKey={`wants-binder:${data.binder.id}`}
          />
        }
        sideClassName="[&>section]:h-full"
      />

      <CollectionCardsView
        items={data.items}
        allowWantRemoval
        showFilters
        forcedSortBy="cm_en"
        forcedSortDir="desc"
        hideSortControls
        emptyTitle="No missing cards left"
        emptyText="This binder goal is complete, or every remaining missing card is hidden."
        sectionTitle="Missing cards"
        sectionCount={data.items.length.toLocaleString("en-US")}
      />
    </>
  );
}
