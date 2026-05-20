"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft, BadgeEuro, CheckCircle2, Layers3, LibraryBig } from "lucide-react";
import { useCallback, useDeferredValue, useMemo, useState, useTransition } from "react";
import { HeaderStatCard, type HeaderStat } from "@/components/PageHeader";
import { formatCollectionCurrency } from "@/lib/collection";
import {
  buildEpisodeSetPriceHistory,
  getCardMarketValue,
  type EpisodePriceHistorySnapshot,
} from "@/lib/price-history";
import type { CardData } from "@/types/card-data";

const ExpansionView = dynamic(() => import("@/app/expansions/[id]/ExpansionView"), {
  ssr: false,
  loading: () => (
    <div className="glass rounded-3xl p-8 text-sm text-gray-500 shadow-md shadow-black/5 dark:text-white/45">
      Loading illustrator cards...
    </div>
  ),
});
const PriceHistoryPanel = dynamic(() => import("@/components/PriceHistoryPanel"), {
  loading: () => (
    <section className="min-h-[var(--ui-dashboard-header-panel-min-height)] rounded-[var(--ui-page-header-radius)] border border-white/8 bg-white/[0.04]" />
  ),
});

interface Props {
  artist: string;
  backHref: string;
  eyebrow: string;
  cards: CardData[];
  priceSnapshots: EpisodePriceHistorySnapshot[];
}

function buildCurrentTotals(cards: CardData[]) {
  return cards.reduce(
    (acc, card) => {
      const value = getCardMarketValue(card.price);
      if (value == null) return acc;

      acc.total += value;
      acc.priced += 1;
      return acc;
    },
    { total: 0, priced: 0 }
  );
}

export default function IllustratorCardsClient({
  artist,
  backHref,
  eyebrow,
  cards,
  priceSnapshots,
}: Props) {
  const [visibleCards, setVisibleCards] = useState<CardData[]>(cards);
  const [isPending, startTransition] = useTransition();
  const deferredVisibleCards = useDeferredValue(visibleCards);
  const showingFilteredSubset = visibleCards.length !== cards.length;
  const handleVisibleCardsChange = useCallback(
    (nextCards: CardData[]) => {
      startTransition(() => {
        setVisibleCards((current) => (current === nextCards ? current : nextCards));
      });
    },
    [startTransition]
  );

  const fullCurrentTotals = useMemo(() => buildCurrentTotals(cards), [cards]);
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

  const visiblePriceHistory = useMemo(
    () => {
      if (!showingFilteredSubset) {
        return fullPriceHistory;
      }

      const filteredSnapshots: EpisodePriceHistorySnapshot[] = [];
      for (const card of deferredVisibleCards) {
        const snapshots = priceSnapshotsByCardId.get(card.id);
        if (snapshots) {
          filteredSnapshots.push(...snapshots);
        }
      }

      return buildEpisodeSetPriceHistory(filteredSnapshots);
    },
    [deferredVisibleCards, fullPriceHistory, priceSnapshotsByCardId, showingFilteredSubset]
  );

  const currentTotals = useMemo(
    () => (showingFilteredSubset ? buildCurrentTotals(deferredVisibleCards) : fullCurrentTotals),
    [deferredVisibleCards, fullCurrentTotals, showingFilteredSubset]
  );

  const currentValue =
    currentTotals.priced > 0 ? Number(currentTotals.total.toFixed(2)) : null;
  const visibleCardCount = showingFilteredSubset ? deferredVisibleCards.length : cards.length;
  const visibleSetCount = new Set(
    (showingFilteredSubset ? deferredVisibleCards : cards)
      .map((card) => card.episode_id ?? card.episode_name)
      .filter(Boolean)
  ).size;
  const unpricedCards = Math.max(visibleCardCount - currentTotals.priced, 0);
  const stats = [
    {
      label: "Cards",
      value: visibleCardCount.toLocaleString("en-US"),
      hint: showingFilteredSubset ? "Visible cards." : "Illustrated cards.",
      Icon: LibraryBig,
      tone: "sky",
    },
    {
      label: "Priced",
      value: `${currentTotals.priced.toLocaleString("en-US")} / ${visibleCardCount.toLocaleString("en-US")}`,
      hint: unpricedCards > 0 ? `${unpricedCards.toLocaleString("en-US")} without price.` : "All visible cards priced.",
      Icon: CheckCircle2,
      tone: "emerald",
    },
    {
      label: "Sets",
      value: visibleSetCount.toLocaleString("en-US"),
      hint: "Expansions represented.",
      Icon: Layers3,
      tone: "violet",
    },
    {
      label: "Market",
      value: formatCollectionCurrency(currentValue),
      hint: showingFilteredSubset ? "Filtered visible total." : "Current visible total.",
      Icon: BadgeEuro,
      tone: "amber",
    },
  ] satisfies HeaderStat[];
  const subtitle = `${currentTotals.priced}/${visibleCardCount} cards priced`;
  const chartPoints =
    visiblePriceHistory.length > 0
      ? visiblePriceHistory.map((point) => ({
          date: point.date,
          label: point.label,
          value: point.total_market,
        }))
      : currentValue != null
        ? [{ date: "current", label: "Nu", value: currentValue }]
        : [];

  return (
    <div className="space-y-6">
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
                Back to illustrators
              </Link>
              <p className="text-[length:var(--ui-page-header-eyebrow-size)] font-semibold uppercase tracking-[0.14em] text-white/42">
                {eyebrow}
              </p>
              <h1 className="mt-2 min-w-0 text-[length:var(--ui-page-header-title-size)] font-bold leading-tight tracking-tight text-white">
                {artist}
              </h1>
              <p className="mt-3 max-w-md text-[length:var(--ui-page-header-description-size)] leading-[var(--ui-page-header-description-leading)] text-white/56">
                {`${cards.length.toLocaleString("en-US")} ${cards.length === 1 ? "card" : "cards"}`}
              </p>
            </div>
          </div>

          <div className="min-w-0 lg:min-h-[var(--ui-dashboard-header-panel-min-height)] [&>section]:h-full">
            <PriceHistoryPanel
              layout="dashboard"
              title={showingFilteredSubset ? "Filtered Total" : "Illustrator Total"}
              currency="EUR"
              points={chartPoints}
              currentValue={currentValue}
              subtitle={isPending ? "Updating filters..." : subtitle}
              emptyText="No illustrator prices available yet"
            />
          </div>

          <div className="grid min-w-0 grid-cols-2 gap-2 lg:col-span-2 xl:col-span-1 xl:auto-rows-fr">
            {stats.map((stat) => (
              <HeaderStatCard key={stat.label} {...stat} />
            ))}
          </div>
        </div>
      </section>

      <ExpansionView
        cards={cards}
        warmCardImages={false}
        onVisibleCardsChange={handleVisibleCardsChange}
      />
    </div>
  );
}
