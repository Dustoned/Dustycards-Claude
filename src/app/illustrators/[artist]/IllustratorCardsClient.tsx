"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";
import PriceHistoryPanel from "@/components/PriceHistoryPanel";
import ExpansionView, { type CardData } from "@/app/expansions/[id]/ExpansionView";
import {
  buildEpisodeSetPriceHistory,
  getCardMarketValue,
  type EpisodePriceHistorySnapshot,
} from "@/lib/price-history";

interface Props {
  artist: string;
  cards: CardData[];
  priceSnapshots: EpisodePriceHistorySnapshot[];
}

export default function IllustratorCardsClient({
  artist,
  cards,
  priceSnapshots,
}: Props) {
  const [visibleCards, setVisibleCards] = useState<CardData[]>(cards);

  const visibleCardIds = useMemo(
    () => new Set(visibleCards.map((card) => card.id)),
    [visibleCards]
  );

  const visiblePriceHistory = useMemo(
    () =>
      buildEpisodeSetPriceHistory(
        priceSnapshots.filter((snapshot) => visibleCardIds.has(snapshot.card_id))
      ),
    [priceSnapshots, visibleCardIds]
  );

  const currentTotals = useMemo(
    () =>
      visibleCards.reduce(
        (acc, card) => {
          const value = getCardMarketValue(card.price);
          if (value == null) return acc;

          acc.total += value;
          acc.priced += 1;
          return acc;
        },
        { total: 0, priced: 0 }
      ),
    [visibleCards]
  );

  const currentValue =
    currentTotals.priced > 0 ? Number(currentTotals.total.toFixed(2)) : null;
  const showingFilteredSubset = visibleCards.length !== cards.length;
  const subtitle = `${currentTotals.priced}/${visibleCards.length} cards priced`;
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
        <Link
          href="/illustrators"
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900 dark:text-white/50 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to illustrators
        </Link>

        <div className="glass rounded-3xl px-6 py-6 shadow-lg shadow-black/5 sm:px-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gray-400 dark:text-white/35">
            Illustrator
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
            {artist}
          </h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-white/50">
            {cards.length} {cards.length === 1 ? "card" : "cards"}
          </p>
        </div>
      </div>

      <PriceHistoryPanel
        title={showingFilteredSubset ? "Filtered Total" : "Illustrator Total"}
        currency="EUR"
        points={chartPoints}
        currentValue={currentValue}
        subtitle={subtitle}
        emptyText="Nog geen illustratorprijzen beschikbaar"
      />

      <ExpansionView cards={cards} onVisibleCardsChange={setVisibleCards} />
    </div>
  );
}
