"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowLeft,
  BadgeEuro,
  CheckCircle2,
  Heart,
  Layers3,
  ListFilter,
  Sparkles,
} from "lucide-react";
import { useCallback, useDeferredValue, useMemo, useState, useTransition } from "react";
import CollectionCardsView from "@/components/CollectionCardsView";
import {
  HeaderAction,
  PageHeroHeader,
  type HeaderStat,
} from "@/components/PageHeader";
import { formatCollectionCurrency } from "@/lib/collection";
import {
  buildEpisodeSetPriceHistory,
  type EpisodePriceHistorySnapshot,
} from "@/lib/price-history";
import type { CardCategoryDefinition } from "@/lib/card-categories";
import type { CollectionCardViewItem } from "@/types/collection-view";

const PriceHistoryPanel = dynamic(() => import("@/components/PriceHistoryPanel"), {
  loading: () => (
    <section className="h-40 rounded-[28px] border border-black/8 bg-black/[0.03] dark:border-white/8 dark:bg-white/[0.04]" />
  ),
});

interface Props {
  category: CardCategoryDefinition;
  items: CollectionCardViewItem[];
  priceSnapshots: EpisodePriceHistorySnapshot[];
  totalCards: number;
  ownedCards: number;
  setCount: number;
  pricedCards: number;
  estimatedValue: number | null;
}

function buildCurrentTotals(items: CollectionCardViewItem[]) {
  return items.reduce(
    (acc, item) => {
      const value = item.cm_value ?? null;
      if (value == null) return acc;

      acc.total += value;
      acc.priced += 1;
      return acc;
    },
    { total: 0, priced: 0 }
  );
}

export default function CategoryDetailClient({
  category,
  items,
  priceSnapshots,
  totalCards,
  ownedCards,
  setCount,
  pricedCards,
  estimatedValue,
}: Props) {
  const [visibleItems, setVisibleItems] = useState<CollectionCardViewItem[]>(items);
  const [isPending, startTransition] = useTransition();
  const deferredVisibleItems = useDeferredValue(visibleItems);
  const showingFilteredSubset = visibleItems.length !== items.length;
  const handleVisibleItemsChange = useCallback(
    (nextItems: CollectionCardViewItem[]) => {
      startTransition(() => {
        setVisibleItems((current) => (current === nextItems ? current : nextItems));
      });
    },
    [startTransition]
  );

  const unpricedCards = Math.max(totalCards - pricedCards, 0);
  const stats = [
    {
      label: "Cards",
      value: totalCards.toLocaleString("en-US"),
      hint: "Matched by this category.",
      Icon: ListFilter,
      tone: "sky",
    },
    {
      label: "Owned",
      value: ownedCards.toLocaleString("en-US"),
      hint: "Already in your collection.",
      Icon: CheckCircle2,
      tone: "emerald",
    },
    {
      label: "Sets",
      value: setCount.toLocaleString("en-US"),
      hint: "Expansions represented.",
      Icon: Layers3,
      tone: "violet",
    },
    {
      label: "Market",
      value: formatCollectionCurrency(estimatedValue),
      hint:
        unpricedCards > 0
          ? `${unpricedCards.toLocaleString("en-US")} cards without price.`
          : "All matched cards are priced.",
      Icon: BadgeEuro,
      tone: "amber",
    },
  ] satisfies HeaderStat[];

  const fullCurrentTotals = useMemo(() => buildCurrentTotals(items), [items]);
  const fullPriceHistory = useMemo(
    () => buildEpisodeSetPriceHistory(priceSnapshots),
    [priceSnapshots]
  );
  const priceSnapshotsByCardId = useMemo(() => {
    const grouped = new Map<string, EpisodePriceHistorySnapshot[]>();

    for (const snapshot of priceSnapshots) {
      const bucket = grouped.get(snapshot.card_id);
      if (bucket) {
        bucket.push(snapshot);
      } else {
        grouped.set(snapshot.card_id, [snapshot]);
      }
    }

    return grouped;
  }, [priceSnapshots]);

  const visiblePriceHistory = useMemo(() => {
    if (!showingFilteredSubset) {
      return fullPriceHistory;
    }

    const filteredSnapshots: EpisodePriceHistorySnapshot[] = [];
    for (const item of deferredVisibleItems) {
      const snapshots = priceSnapshotsByCardId.get(item.card_id);
      if (snapshots) {
        filteredSnapshots.push(...snapshots);
      }
    }

    return buildEpisodeSetPriceHistory(filteredSnapshots);
  }, [
    deferredVisibleItems,
    fullPriceHistory,
    priceSnapshotsByCardId,
    showingFilteredSubset,
  ]);

  const currentTotals = useMemo(
    () =>
      showingFilteredSubset
        ? buildCurrentTotals(deferredVisibleItems)
        : fullCurrentTotals,
    [deferredVisibleItems, fullCurrentTotals, showingFilteredSubset]
  );

  const currentValue =
    currentTotals.priced > 0 ? Number(currentTotals.total.toFixed(2)) : null;
  const visibleCardCount = showingFilteredSubset ? deferredVisibleItems.length : items.length;
  const chartPoints =
    visiblePriceHistory.length > 0
      ? visiblePriceHistory.map((point) => ({
          date: point.date,
          label: point.label,
          value: point.total_market,
        }))
      : currentValue != null
        ? [{ date: "current", label: "Now", value: currentValue }]
        : [];

  return (
    <div className="flex w-full flex-col gap-5 sm:gap-6">
      <PageHeroHeader
        eyebrow="Category"
        title={category.title}
        description={category.description}
        className="max-[640px]:[--ui-page-header-padding:0.85rem] max-[640px]:[--ui-page-header-title-size:1.65rem] max-[640px]:[--ui-page-header-description-size:0.78rem]"
        gridClassName="xl:grid-cols-[minmax(20rem,0.66fr)_minmax(30rem,1.34fr)] xl:items-stretch 2xl:grid-cols-[minmax(24rem,0.62fr)_minmax(42rem,1.38fr)]"
        sideClassName="xl:space-y-0"
        backLinks={
          <Link
            href="/categories"
            prefetch={false}
            className="inline-flex items-center gap-2 font-medium text-gray-500 transition-colors hover:text-gray-900 dark:text-white/50 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to categories
          </Link>
        }
        actions={
          <HeaderAction>
            <Link
              href="/wants"
              prefetch={false}
              className="inline-flex items-center gap-2 rounded-2xl border border-black/8 bg-white/80 px-4 py-2 text-sm font-semibold text-gray-900 transition-colors hover:border-black/15 hover:bg-white dark:border-white/10 dark:bg-white/8 dark:text-white dark:hover:border-white/20 dark:hover:bg-white/12"
            >
              <Heart className="h-4 w-4" />
              Wants
            </Link>
            <Link
              href="/expansions"
              prefetch={false}
              className="inline-flex items-center gap-2 rounded-2xl border border-black/8 bg-white/80 px-4 py-2 text-sm font-semibold text-gray-900 transition-colors hover:border-black/15 hover:bg-white dark:border-white/10 dark:bg-white/8 dark:text-white dark:hover:border-white/20 dark:hover:bg-white/12"
            >
              <Sparkles className="h-4 w-4" />
              Browse Sets
            </Link>
          </HeaderAction>
        }
        accessory={
          <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(23rem,1.18fr)_minmax(11rem,0.82fr)] xl:items-stretch 2xl:grid-cols-[minmax(32rem,1.25fr)_minmax(14rem,0.75fr)]">
            <div className="min-w-0 [&>section]:h-full">
              <PriceHistoryPanel
                layout="hero"
                title={showingFilteredSubset ? "Filtered Category Value" : "Category Value"}
                currency="EUR"
                points={chartPoints}
                currentValue={currentValue}
                subtitle={
                  isPending
                    ? "Updating filters..."
                    : `${currentTotals.priced.toLocaleString("en-US")} / ${visibleCardCount.toLocaleString(
                        "en-US"
                      )} cards priced`
                }
                emptyText="No category prices available yet"
              />
            </div>
            <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2 xl:auto-rows-fr">
              {stats.map(({ Icon, ...stat }) => (
                <div
                  key={stat.label}
                  className="flex min-h-[5.4rem] min-w-0 flex-col justify-between rounded-2xl border border-black/8 bg-white/70 p-3 shadow-sm shadow-black/5 dark:border-white/10 dark:bg-white/[0.045] dark:shadow-none"
                >
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-[0.58rem] font-semibold uppercase leading-tight tracking-[0.12em] text-gray-400 dark:text-white/42">
                      {stat.label}
                    </p>
                    <Icon className="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-white/38" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[1.05rem] font-bold leading-tight tracking-tight text-gray-950 dark:text-white">
                      {stat.value}
                    </p>
                    <p className="mt-1 line-clamp-1 text-[0.68rem] leading-tight text-gray-500 dark:text-white/48">
                      {stat.hint}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        }
      />

      <CollectionCardsView
        items={items}
        emptyTitle="No cards in this category yet"
        emptyText="Run a sync after new sets release and this category will fill automatically."
        sectionTitle={category.title}
        sectionCount={items.length.toLocaleString("en-US")}
        showFilters
        onVisibleItemsChange={handleVisibleItemsChange}
      />
    </div>
  );
}
