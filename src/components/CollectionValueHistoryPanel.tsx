"use client";

import { useCallback, useRef, useState } from "react";
import PriceHistoryPanel, {
  type PriceHistoryRangeKey,
  type PriceHistoryValuePoint,
} from "@/components/PriceHistoryPanel";

interface Props {
  initialPoints: PriceHistoryValuePoint[];
  currentValue: number;
  deltaValue: number | null;
  subtitle: string;
  endpoint: string;
}

type LoadedRange = "recent" | "year" | "all";

function coversRange(loaded: LoadedRange, requested: LoadedRange): boolean {
  if (loaded === "all") return true;
  return loaded === requested;
}

export default function CollectionValueHistoryPanel({
  initialPoints,
  currentValue,
  deltaValue,
  subtitle,
  endpoint,
}: Props) {
  const [points, setPoints] = useState(initialPoints);
  const [loadedRange, setLoadedRange] = useState<LoadedRange>("recent");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const handleRangeChange = useCallback(
    async (range: PriceHistoryRangeKey) => {
      const requested: LoadedRange | null =
        range === "ALL" ? "all" : range === "1Y" ? "year" : null;
      if (!requested || coversRange(loadedRange, requested)) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const requestId = ++requestIdRef.current;
      setStatus("loading");

      try {
        const separator = endpoint.includes("?") ? "&" : "?";
        const response = await fetch(`${endpoint}${separator}range=${requested}`, {
          credentials: "same-origin",
          signal: controller.signal,
        });
        const payload = (await response.json()) as {
          points?: PriceHistoryValuePoint[];
          error?: string;
        };
        if (!response.ok || !Array.isArray(payload.points)) {
          throw new Error(payload.error || "Could not load collection history");
        }
        if (requestId !== requestIdRef.current) return;

        setPoints(payload.points);
        setLoadedRange(requested);
        setStatus("idle");
      } catch {
        if (controller.signal.aborted || requestId !== requestIdRef.current) return;
        setStatus("error");
      }
    },
    [endpoint, loadedRange]
  );

  return (
    <PriceHistoryPanel
      layout="dashboard"
      title="Collection Value"
      currency="EUR"
      points={points}
      currentValue={currentValue}
      deltaValue={deltaValue}
      tone="dark"
      subtitle={subtitle}
      emptyText="Add cards or sealed to start tracking your value"
      rangeStorageKey="collection-dashboard"
      onRangeChange={handleRangeChange}
      headerAccessory={
        status === "loading" ? (
          <span className="text-[10px] font-semibold text-white/48">Loading history...</span>
        ) : status === "error" ? (
          <span className="text-[10px] font-semibold text-rose-300/80">History unavailable</span>
        ) : null
      }
    />
  );
}
