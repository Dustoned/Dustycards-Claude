"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useDeferredValue, useMemo, useState, useTransition } from "react";
import { PageHeroHeader } from "@/components/PageHeader";
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
    <section className="h-48 rounded-[28px] border border-black/8 bg-black/[0.03] dark:border-white/8 dark:bg-white/[0.04]" />
  ),
});

interface Props {
  artist: string;
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
  cards,
  priceSnapshots,
}: Props) {
  const [visibleCards, setVisibleCards] = useState<CardData[]>(cards);
  const [isPending, startTransition] = useTransition();
  const deferredVisibleCards = useDeferredValue(visibleCards);
  const showingFilteredSubset = visibleCards.length !== cards.length;

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
      <div className="space-y-4">
        <PageHeroHeader
          eyebrow="Illustrator"
          title={artist}
          description={`${cards.length} ${cards.length === 1 ? "card" : "cards"}`}
          backLinks={
            <Link
              href="/illustrators"
              prefetch={false}
              className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900 dark:text-white/50 dark:hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to illustrators
            </Link>
          }
        />
      </div>

      <PriceHistoryPanel
        title={showingFilteredSubset ? "Filtered Total" : "Illustrator Total"}
        currency="EUR"
        points={chartPoints}
        currentValue={currentValue}
        subtitle={isPending ? "Updating filters..." : subtitle}
        emptyText="Nog geen illustratorprijzen beschikbaar"
      />

      <ExpansionView
        cards={cards}
        warmCardImages={false}
        onVisibleCardsChange={(nextCards) => {
          startTransition(() => {
            setVisibleCards(nextCards);
          });
        }}
      />
    </div>
  );
}
