"use client";

import { useState } from "react";
import { ExternalSignalDetailCard } from "@/app/movers/signal-radar/ExternalSignalBrowser";
import type { ExternalCardSignal, ExternalMarketMode } from "@/lib/external-signal-radar";

export default function SignalRadarDetailClient({ signal }: { signal: ExternalCardSignal }) {
  const [marketMode, setMarketMode] = useState<ExternalMarketMode>("raw");
  const gradedAvailable = signal.marketIntelligence?.graded.available ?? false;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.025] p-2">
        <div className="px-2">
          <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-violet-200/60">Analysis market</p>
          <p className="mt-0.5 text-[10px] text-white/36">Switch the entire analysis between raw and graded data.</p>
        </div>
        <div className="flex rounded-xl border border-white/8 bg-black/24 p-1">
          {(["raw", "graded"] as const).map((mode) => {
            const disabled = mode === "graded" && !gradedAvailable;
            return (
              <button
                key={mode}
                type="button"
                disabled={disabled}
                onClick={() => setMarketMode(mode)}
                className={`h-8 rounded-lg px-4 text-[11px] font-semibold capitalize transition ${
                  marketMode === mode
                    ? "bg-violet-500 text-white shadow-sm"
                    : disabled
                      ? "cursor-not-allowed text-white/20"
                      : "text-white/48 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                {mode}
              </button>
            );
          })}
        </div>
      </div>
      <ExternalSignalDetailCard signal={signal} marketMode={marketMode} />
    </div>
  );
}
