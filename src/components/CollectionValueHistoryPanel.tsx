"use client";

import { useCallback, useRef, useState } from "react";
import { useSettings } from "@/components/SettingsProvider";
import PriceHistoryPanel, {
  type PriceHistoryRangeKey,
  type PriceHistoryValuePoint,
} from "@/components/PriceHistoryPanel";
import { formatCurrency } from "@/lib/format";

interface Props {
  initialPoints: PriceHistoryValuePoint[];
  initialTcpPoints: PriceHistoryValuePoint[];
  currentValue: number;
  tcpCurrentValue: number;
  tcpCurrentValueEur: number | null;
  usdToEurRate: number | null;
  usdToEurRateDate: string | null;
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
  initialTcpPoints,
  currentValue,
  tcpCurrentValue,
  tcpCurrentValueEur,
  usdToEurRate,
  usdToEurRateDate,
  deltaValue,
  subtitle,
  endpoint,
}: Props) {
  const { settings } = useSettings();
  const source = settings.primaryPriceSource === "tcp" ? "tcp" : "cm";
  const [cmPoints, setCmPoints] = useState(initialPoints);
  const [tcpPoints, setTcpPoints] = useState(initialTcpPoints);
  const [loadedRanges, setLoadedRanges] = useState<Record<"cm" | "tcp", LoadedRange>>({
    cm: "recent",
    tcp: "recent",
  });
  const [statuses, setStatuses] = useState<Record<"cm" | "tcp", "idle" | "loading" | "error">>({
    cm: "idle",
    tcp: "idle",
  });
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const isTcp = source === "tcp";
  const points = isTcp ? tcpPoints : cmPoints;
  const loadedRange = loadedRanges[source];
  const status = statuses[source];

  const handleRangeChange = useCallback(
    async (range: PriceHistoryRangeKey) => {
      const requested: LoadedRange | null =
        range === "ALL" ? "all" : range === "1Y" ? "year" : null;
      if (!requested || coversRange(loadedRange, requested)) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const requestId = ++requestIdRef.current;
      setStatuses((current) => ({ ...current, [source]: "loading" }));

      try {
        const separator = endpoint.includes("?") ? "&" : "?";
        const response = await fetch(`${endpoint}${separator}range=${requested}&source=${source}`, {
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

        if (source === "tcp") setTcpPoints(payload.points);
        else setCmPoints(payload.points);
        setLoadedRanges((current) => ({ ...current, [source]: requested }));
        setStatuses((current) => ({ ...current, [source]: "idle" }));
      } catch {
        if (controller.signal.aborted || requestId !== requestIdRef.current) return;
        setStatuses((current) => ({ ...current, [source]: "error" }));
      }
    },
    [endpoint, loadedRange, source]
  );

  const latestPointValue = [...points].reverse().find((point) => point.value != null)?.value ?? null;
  const convertedNote = isTcp && tcpCurrentValueEur != null
    ? `≈ ${formatCurrency(tcpCurrentValueEur, "EUR")}${usdToEurRate ? ` · $1 = €${usdToEurRate.toFixed(4)}` : ""}`
    : null;

  return (
    <PriceHistoryPanel
      layout="dashboard"
      title={isTcp ? "Collection Value · TCGPlayer" : "Collection Value"}
      currency={isTcp ? "USD" : "EUR"}
      points={points}
      currentValue={isTcp ? tcpCurrentValue : currentValue}
      deltaValue={isTcp ? latestPointValue : deltaValue}
      tone="dark"
      subtitle={isTcp ? convertedNote ?? "TCGPlayer card values in USD" : subtitle}
      emptyText={isTcp ? "No TCGPlayer price history yet" : "Add cards or sealed to start tracking your value"}
      rangeStorageKey="collection-dashboard"
      onRangeChange={handleRangeChange}
      headerAccessory={
        status === "loading" ? (
          <span className="text-[10px] font-semibold text-white/48">Loading history...</span>
        ) : status === "error" ? (
          <span className="text-[10px] font-semibold text-rose-300/80">History unavailable</span>
        ) : isTcp && usdToEurRateDate ? (
          <span className="text-[10px] font-semibold text-white/38">EUR rate {usdToEurRateDate}</span>
        ) : null
      }
    />
  );
}
