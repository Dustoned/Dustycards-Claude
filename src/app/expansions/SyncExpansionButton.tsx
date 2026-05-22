"use client";

import { useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

export default function SyncExpansionButton({
  episodeId,
  expansionName,
}: {
  episodeId: string;
  expansionName: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function handleSync(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    setLoading(true);
    setStatus(null);

    try {
      const response = await fetch("/api/sync-episode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId }),
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        setStatus(data.error ? `Error: ${data.error}` : "Sync failed");
        return;
      }

      setStatus(`Added ${data.newCards ?? 0}, updated ${data.updatedCards ?? 0}`);
      router.refresh();
    } catch {
      setStatus("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="absolute right-2 top-2 z-20 flex flex-col items-end gap-1">
      <button
        type="button"
        aria-label={`Sync ${expansionName}`}
        title={`Sync ${expansionName}`}
        onClick={handleSync}
        onMouseDown={(event) => event.stopPropagation()}
        disabled={loading}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/12 bg-black/45 text-white/78 shadow-lg shadow-black/20 backdrop-blur transition hover:scale-105 hover:bg-black/65 hover:text-white disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
      >
        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
      </button>
      {status ? (
        <p
          aria-live="polite"
          className="max-w-44 rounded-lg border border-white/10 bg-black/85 px-2 py-1 text-right text-[11px] font-semibold text-white/80 shadow-lg shadow-black/25"
        >
          {status}
        </p>
      ) : null}
    </div>
  );
}
