"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

export default function SyncButton() {
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
    <div className="flex flex-col gap-2">
      <button
        onClick={handleSync}
        disabled={loading}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-black/8 bg-black/[0.03] px-4 py-2.5 text-sm font-semibold text-gray-800 shadow-sm shadow-black/5 transition-all hover:scale-[1.01] hover:bg-black/[0.045] disabled:cursor-not-allowed disabled:opacity-50 disabled:scale-100 dark:border-white/8 dark:bg-white/[0.05] dark:text-gray-100 dark:hover:bg-white/[0.08]"
      >
        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        {loading ? "Syncing..." : "Sync Expansions"}
      </button>
      {status && <p className="max-w-sm text-xs text-gray-400">{status}</p>}
    </div>
  );
}
