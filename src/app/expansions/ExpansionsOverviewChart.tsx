"use client";

import { useEffect, useMemo, useState } from "react";
import PriceHistoryPanel, { type PriceHistoryValuePoint } from "@/components/PriceHistoryPanel";

interface OverviewHistoryResponse {
  points?: PriceHistoryValuePoint[];
  currentValue?: number | null;
  pricedCardCount?: number;
}

interface Props {
  episodeIds: string[];
  initialCurrentValue: number | null;
  initialPricedCardCount: number;
  trackedCardCount: number;
}

function formatCount(value: number): string {
  return value.toLocaleString("nl-NL");
}

export default function ExpansionsOverviewChart({
  episodeIds,
  initialCurrentValue,
  initialPricedCardCount,
  trackedCardCount,
}: Props) {
  const [points, setPoints] = useState<PriceHistoryValuePoint[]>([]);
  const [currentValue, setCurrentValue] = useState<number | null>(initialCurrentValue);
  const [pricedCardCount, setPricedCardCount] = useState(initialPricedCardCount);
  const [isLoading, setIsLoading] = useState(episodeIds.length > 0);

  const requestBody = useMemo(() => JSON.stringify({ episodeIds }), [episodeIds]);

  useEffect(() => {
    if (episodeIds.length === 0) {
      return;
    }

    const controller = new AbortController();

    fetch("/api/expansions/overview-history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: requestBody,
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Overview history request failed with ${response.status}`);
        }

        return (await response.json()) as OverviewHistoryResponse;
      })
      .then((data) => {
        setPoints(data.points ?? []);
        setCurrentValue(data.currentValue ?? initialCurrentValue);
        setPricedCardCount(data.pricedCardCount ?? initialPricedCardCount);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [episodeIds.length, initialCurrentValue, initialPricedCardCount, requestBody]);

  return (
    <PriceHistoryPanel
      title="All Sets Value"
      currency="EUR"
      points={points}
      currentValue={currentValue}
      subtitle={`${formatCount(pricedCardCount)} / ${formatCount(trackedCardCount)} cards priced`}
      loading={isLoading}
      emptyText="Nog geen setprijzen beschikbaar"
    />
  );
}
