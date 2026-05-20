"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Coins, Layers, WalletCards } from "lucide-react";
import CollectionBinderIcon from "@/components/CollectionBinderIcon";
import CollectionCardsView from "@/components/CollectionCardsView";
import { HeaderStatCard, PageHeroHeader } from "@/components/PageHeader";
import { formatCollectionCurrency } from "@/lib/collection";
import type { WantBinderPageData } from "@/lib/collection-data";
import { getCachedImageUrl } from "@/lib/image-cache";

const PriceHistoryPanel = dynamic(() => import("@/components/PriceHistoryPanel"), {
  loading: () => (
    <section className="min-h-[var(--ui-dashboard-header-panel-min-height)] rounded-[var(--ui-page-header-radius)] border border-white/8 bg-white/[0.04]" />
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
  const description = `${data.binder.episode.series ?? "Set"} / ${data.binder.episode.name}`;
  const missingHint =
    data.metrics.hiddenCards > 0
      ? `${data.metrics.hiddenCards.toLocaleString("en-US")} hidden`
      : "Visible missing cards";
  const averageCostHint =
    data.metrics.averageCost != null
      ? `${formatCollectionCurrency(data.metrics.averageCost)} average`
      : "Missing card estimate";
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
        className="mb-5 sm:mb-6"
        title={data.binder.name}
        description={description}
        gridClassName="xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] xl:items-stretch"
        backLinks={
          <Link
            href="/wants"
            prefetch={false}
            className="hidden items-center gap-2 font-medium text-gray-500 transition-colors hover:text-gray-900 dark:text-white/50 dark:hover:text-white sm:inline-flex"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to wants
          </Link>
        }
        leadingVisual={
          <div
            className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-[var(--ui-page-header-radius)] border border-white/10 bg-white/[0.06] p-2 text-white/70 shadow-sm shadow-black/20 sm:flex lg:h-16 lg:w-16"
            style={accentColor ? { color: accentColor } : undefined}
          >
            {data.binder.episode.logo_url ? (
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
              label="Set Progress"
              value={`${data.metrics.ownedCount} / ${data.metrics.totalCards}`}
              hint={`${progressPercent}% complete`}
              Icon={CheckCircle2}
              tone="emerald"
            />
            <HeaderStatCard
              label="Missing"
              value={data.metrics.visibleMissingCards.toLocaleString("en-US")}
              hint={missingHint}
              Icon={Layers}
              tone="rose"
            />
            <HeaderStatCard
              label="Est. Cost"
              value={formatCollectionCurrency(data.metrics.estimatedCost)}
              hint={averageCostHint}
              Icon={Coins}
              tone="amber"
            />
            <HeaderStatCard
              label="Priced"
              value={pricedLabel}
              hint="Missing cards priced"
              Icon={WalletCards}
              tone="emerald"
            />
          </>
        }
        sideClassName="grid min-w-0 auto-rows-fr grid-cols-2 gap-2 sm:gap-3 xl:grid-rows-2 xl:gap-3"
        accessory={
          <PriceHistoryPanel
            layout="dashboard"
            title="Missing Wants Value"
            currency="EUR"
            points={chartPoints}
            currentValue={data.metrics.pricedCards > 0 ? data.metrics.estimatedCost : null}
            subtitle={`${pricedLabel} missing cards priced`}
            emptyText="Missing cards without prices will appear here once price history exists"
            rangeStorageKey={`wants-binder:${data.binder.id}`}
          />
        }
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
