"use client";

import { useEffect, useMemo, useState } from "react";
import PriceHistoryPanel, { type PriceHistoryValuePoint } from "@/components/PriceHistoryPanel";

interface OverviewHistoryResponse {
  points?: PriceHistoryValuePoint[];
  currentValue?: number | null;
  pricedCardCount?: number;
}

interface CachedOverviewHistoryResponse {
  storedAt: number;
  data: OverviewHistoryResponse;
}

interface Props {
  episodeIds: string[];
  initialCurrentValue: number | null;
  initialPricedCardCount: number;
  trackedCardCount: number;
}

const BROWSER_CACHE_TTL_MS = 10 * 60 * 1000;

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

function getEpisodeIdsKey(episodeIds: string[]): string {
  const ids = episodeIds.toSorted((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return ids.join("|");
}

function getBrowserCacheKey(episodeIdsKey: string): string {
  return `dustycards:expansions-overview-history:${episodeIdsKey}`;
}

function readCachedOverviewHistory(episodeIdsKey: string): OverviewHistoryResponse | null {
  if (typeof window === "undefined" || !episodeIdsKey) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getBrowserCacheKey(episodeIdsKey));
    if (!raw) return null;

    const cached = JSON.parse(raw) as CachedOverviewHistoryResponse;
    if (
      typeof cached.storedAt !== "number" ||
      Date.now() - cached.storedAt > BROWSER_CACHE_TTL_MS ||
      !cached.data
    ) {
      return null;
    }

    return cached.data;
  } catch {
    return null;
  }
}

function writeCachedOverviewHistory(episodeIdsKey: string, data: OverviewHistoryResponse) {
  if (typeof window === "undefined" || !episodeIdsKey) {
    return;
  }

  try {
    window.localStorage.setItem(
      getBrowserCacheKey(episodeIdsKey),
      JSON.stringify({ storedAt: Date.now(), data } satisfies CachedOverviewHistoryResponse)
    );
  } catch {
    // Cache failures should never block the chart.
  }
}

export default function ExpansionsOverviewChart({
  episodeIds,
  initialCurrentValue,
  initialPricedCardCount,
  trackedCardCount,
}: Props) {
  const episodeIdsKey = useMemo(() => getEpisodeIdsKey(episodeIds), [episodeIds]);
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
    const frameId = window.requestAnimationFrame(() => {
      const cached = readCachedOverviewHistory(episodeIdsKey);
      if (!cached || controller.signal.aborted) {
        return;
      }

      setPoints(cached.points ?? []);
      setCurrentValue(cached.currentValue ?? initialCurrentValue);
      setPricedCardCount(cached.pricedCardCount ?? initialPricedCardCount);
      setIsLoading(false);
    });

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
        writeCachedOverviewHistory(episodeIdsKey, data);
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

    return () => {
      window.cancelAnimationFrame(frameId);
      controller.abort();
    };
  }, [
    episodeIds.length,
    episodeIdsKey,
    initialCurrentValue,
    initialPricedCardCount,
    requestBody,
  ]);

  return (
    <PriceHistoryPanel
      title="All Sets Value"
      currency="EUR"
      points={points}
      currentValue={currentValue}
      subtitle={`${formatCount(pricedCardCount)} / ${formatCount(trackedCardCount)} cards priced`}
      loading={isLoading}
      emptyText="No set prices available yet"
    />
  );
}
