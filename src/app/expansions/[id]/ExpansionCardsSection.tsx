"use client";

import { useMemo, useState } from "react";
import PriceHistoryPanel from "@/components/PriceHistoryPanel";
import ExpansionView from "./ExpansionView";
import {
  buildEpisodeSetPriceHistory,
  getCardMarketValue,
  type EpisodePriceHistorySnapshot,
} from "@/lib/price-history";
import type { CardData } from "@/types/card-data";

interface Props {
  cards: CardData[];
  totalCards: number;
  episode: {
    id: string;
    name: string;
    code: string | null;
  };
  priceSnapshots: EpisodePriceHistorySnapshot[];
}

export default function ExpansionCardsSection({
  cards,
  totalCards,
  episode,
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
      <PriceHistoryPanel
        title={showingFilteredSubset ? "Filtered Total" : "Set Total"}
        currency="EUR"
        points={chartPoints}
        currentValue={currentValue}
        subtitle={showingFilteredSubset ? subtitle : `${currentTotals.priced}/${totalCards} cards priced`}
        emptyText="Nog geen setprijzen beschikbaar"
      />

      <ExpansionView
        cards={cards}
        episode={episode}
        onVisibleCardsChange={setVisibleCards}
      />
    </div>
  );
}
