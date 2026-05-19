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
  HeaderStatCard,
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
    <section className="min-h-[var(--ui-dashboard-header-panel-min-height)] rounded-[var(--ui-page-header-radius)] border border-white/8 bg-white/[0.04]" />
  ),
});

interface Props {
  category: CardCategoryDefinition;
  backHref: string;
  setsHref: string;
  eyebrow: string;
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
  backHref,
  setsHref,
  eyebrow,
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
      <section className="binder-panel relative w-full overflow-hidden rounded-[var(--ui-page-header-radius)] p-3 sm:p-4 lg:p-5">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/18 to-transparent" />
        <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(19rem,0.82fr)_minmax(0,1.18fr)] xl:grid-cols-[minmax(20rem,0.78fr)_minmax(0,1.08fr)_minmax(20rem,0.72fr)] xl:items-stretch">
          <div className="flex min-h-[var(--ui-dashboard-header-panel-min-height)] min-w-0 flex-col justify-between rounded-[var(--ui-page-header-radius)] border border-white/8 bg-black/10 p-[var(--ui-page-header-padding)]">
            <div className="min-w-0">
              <Link
                href={backHref}
                prefetch={false}
                className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-white/50 transition-colors hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to categories
              </Link>
              <p className="text-[length:var(--ui-page-header-eyebrow-size)] font-semibold uppercase tracking-[0.14em] text-white/42">
                {eyebrow}
              </p>
              <h1 className="mt-2 min-w-0 text-[length:var(--ui-page-header-title-size)] font-bold leading-tight tracking-tight text-white">
                {category.title}
              </h1>
              <p className="mt-3 max-w-md text-[length:var(--ui-page-header-description-size)] leading-[var(--ui-page-header-description-leading)] text-white/56">
                {category.description}
              </p>
            </div>

            <HeaderAction className="mt-[var(--ui-page-header-action-margin)]">
              <Link
                href="/wants"
                prefetch={false}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm font-semibold text-white transition-colors hover:border-white/20 hover:bg-white/[0.1]"
              >
                <Heart className="h-4 w-4" />
                Wants
              </Link>
              <Link
                href={setsHref}
                prefetch={false}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm font-semibold text-white transition-colors hover:border-white/20 hover:bg-white/[0.1]"
              >
                <Sparkles className="h-4 w-4" />
                Browse Sets
              </Link>
            </HeaderAction>
          </div>

          <div className="min-w-0 lg:min-h-[var(--ui-dashboard-header-panel-min-height)] [&>section]:h-full">
            <PriceHistoryPanel
              compact
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

          <div className="grid min-w-0 grid-cols-2 gap-2 lg:col-span-2 xl:col-span-1 xl:auto-rows-fr">
            {stats.map((stat) => (
              <HeaderStatCard key={stat.label} {...stat} />
            ))}
          </div>
        </div>
      </section>

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
