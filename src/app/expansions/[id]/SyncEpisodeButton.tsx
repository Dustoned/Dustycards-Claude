"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

export default function SyncEpisodeButton({ episodeId }: { episodeId: string }) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const router = useRouter();

  async function handleSync() {
    setLoading(true);
    setStatus("Fetching cards and all prices...");

    try {
      const res = await fetch("/api/sync-episode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId }),
      });
      const data = await res.json();

      if (data.ok) {
        setStatus(
          `Synced ${data.count ?? 0} cards, ${data.newCards ?? 0} new cards, ${
            data.newPrices ?? 0
          } new price snapshots`
        );
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
    <div className="flex flex-col items-end gap-1.5 shrink-0">
      <button
        onClick={handleSync}
        disabled={loading}
        title="Refresh cards and prices"
        aria-label={loading ? "Syncing cards and prices" : "Refresh cards and prices"}
        className="group inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-black/8 bg-black/[0.04] text-gray-700 shadow-sm shadow-black/10 transition-all hover:scale-[1.03] hover:bg-black/[0.07] disabled:cursor-not-allowed disabled:opacity-50 disabled:scale-100 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/80 dark:hover:bg-white/[0.08]"
      >
        <RefreshCw
          className={`h-[18px] w-[18px] ${loading ? "animate-spin" : "transition-transform duration-300 group-hover:rotate-180"}`}
        />
        <span className="sr-only">{loading ? "Syncing..." : "Refresh cards and prices"}</span>
      </button>
      {status && <p className="max-w-[15rem] text-right text-xs text-gray-400">{status}</p>}
    </div>
  );
}
