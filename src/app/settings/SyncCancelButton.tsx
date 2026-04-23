"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Square } from "lucide-react";
import { AUTO_PRICE_REFRESH_CANCEL_COOLDOWN_LABEL } from "@/lib/auto-price-refresh-pause";

interface SyncCancelButtonProps {
  syncId: string;
  syncLabel: string;
  cancellationRequested: boolean;
  pauseAutoRefreshOnCancel?: boolean;
}

function resolveStatusMessage(
  status: string,
  syncLabel: string,
  pauseAutoRefreshOnCancel: boolean
): string {
  const pauseSuffix = pauseAutoRefreshOnCancel
    ? ` New background batches will stay paused for ${AUTO_PRICE_REFRESH_CANCEL_COOLDOWN_LABEL}.`
    : "";

  switch (status) {
    case "requested":
    case "already-requested":
      return `Stop requested for ${syncLabel}. Waiting for a safe checkpoint.${pauseSuffix}`;
    case "already-finished":
      return `${syncLabel} was already finished.`;
    default:
      return `Stop requested for ${syncLabel}.${pauseSuffix}`;
  }
}

export default function SyncCancelButton({
  syncId,
  syncLabel,
  cancellationRequested,
  pauseAutoRefreshOnCancel = false,
}: SyncCancelButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(
    cancellationRequested
      ? `Stop requested. Waiting for a safe checkpoint${
          pauseAutoRefreshOnCancel
            ? `. New background batches will stay paused for ${AUTO_PRICE_REFRESH_CANCEL_COOLDOWN_LABEL}.`
            : "."
        }`
      : null
  );

  async function handleCancel() {
    if (loading || cancellationRequested) {
      return;
    }

    setLoading(true);
    setStatus(
      `Stop requested for ${syncLabel}. Waiting for a safe checkpoint${
        pauseAutoRefreshOnCancel
          ? `. New background batches will stay paused for ${AUTO_PRICE_REFRESH_CANCEL_COOLDOWN_LABEL}.`
          : "."
      }`
    );

    try {
      const response = await fetch(`/api/syncs/${syncId}/cancel`, {
        method: "POST",
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        setStatus(data.error ?? `Could not stop ${syncLabel}.`);
      } else {
        setStatus(resolveStatusMessage(data.status, syncLabel, pauseAutoRefreshOnCancel));
      }
    } catch {
      setStatus(`Network error while stopping ${syncLabel}.`);
    } finally {
      setLoading(false);
      startTransition(() => {
        router.refresh();
      });
    }
  }

  const disabled = loading || cancellationRequested;

  return (
    <div className="flex flex-col items-start gap-2 md:items-end">
      <button
        onClick={handleCancel}
        disabled={disabled}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200/70 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 shadow-sm shadow-black/5 transition-all hover:scale-[1.01] hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60 disabled:scale-100 dark:border-rose-400/20 dark:bg-rose-900/20 dark:text-rose-200 dark:hover:bg-rose-900/30"
      >
        <Square className={`h-4 w-4 ${disabled ? "animate-pulse" : ""}`} />
        {cancellationRequested ? "Stopping..." : loading ? "Requesting stop..." : "Stop Current Sync"}
      </button>
      {status && <p className="max-w-sm text-xs text-gray-400 md:text-right">{status}</p>}
    </div>
  );
}
