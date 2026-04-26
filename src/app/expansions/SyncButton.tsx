"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

export default function SyncButton({
  disabled = false,
  disabledReason,
}: {
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const router = useRouter();

  async function handleSync() {
    setLoading(true);
    setStatus("Checking for new sets and newly added cards...");

    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();

      if (data.ok) {
        if (
          data.newEpisodes ||
          data.newCards ||
          data.updatedCards ||
          data.newPrices ||
          data.refreshedPrices
        ) {
          setStatus(
            `Checked ${data.count ?? 0} sets, synced ${data.syncedEpisodes ?? 0}, added ${
              data.newEpisodes ?? 0
            } sets, ${data.newCards ?? 0} cards, ${data.newPrices ?? 0} prices`
          );
        } else {
          setStatus(`No new sets or cards across ${data.count} sets`);
        }
        router.refresh();
      } else if (data.cancelled) {
        setStatus(data.error ?? "Sync stopped.");
        router.refresh();
      } else {
        setStatus(`Error: ${data.error}`);
      }
    } catch {
      setStatus("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto">
      <button
        onClick={handleSync}
        disabled={loading || disabled}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-black/8 bg-black/[0.03] px-4 py-2.5 text-sm font-semibold text-gray-800 shadow-sm shadow-black/5 transition-all hover:scale-[1.01] hover:bg-black/[0.045] disabled:cursor-not-allowed disabled:opacity-50 disabled:scale-100 dark:border-white/8 dark:bg-white/[0.05] dark:text-gray-100 dark:hover:bg-white/[0.08] sm:w-auto"
      >
        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        {loading ? "Syncing..." : "Sync Expansions"}
      </button>
      {disabled && disabledReason && (
        <p className="max-w-sm break-words text-xs text-amber-600 dark:text-amber-300">
          {disabledReason}
        </p>
      )}
      {status && <p className="max-w-sm break-words text-xs text-gray-400">{status}</p>}
    </div>
  );
}
