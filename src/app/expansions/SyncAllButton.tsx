"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

interface Episode {
  id: string;
  name: string;
}

interface Props {
  episodes: Episode[];
  totalSets: number;
}

type Status = "idle" | "running" | "done";

function fmtTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export default function SyncAllButton({ episodes, totalSets }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [current, setCurrent] = useState(0);
  const [currentName, setCurrentName] = useState("");
  const [totalCards, setTotalCards] = useState(0);
  const [errors, setErrors] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [eta, setEta] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef<number>(0);
  const router = useRouter();

  const total = episodes.length;
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;

  async function handleSyncAll() {
    setStatus("running");
    setCurrent(0);
    setErrors(0);
    setTotalCards(0);
    setElapsed(0);
    setEta(null);

    startRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);

    for (let i = 0; i < episodes.length; i++) {
      const ep = episodes[i];
      setCurrentName(ep.name);

      try {
        const res = await fetch("/api/sync-episode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ episodeId: ep.id }),
        });
        const data = await res.json();
        if (data.ok) {
          setTotalCards((c) => c + (data.count ?? 0));
        } else {
          setErrors((e) => e + 1);
        }
      } catch {
        setErrors((e) => e + 1);
      }

      const done = i + 1;
      setCurrent(done);

      // ETA: avg seconds per set × remaining sets
      const elapsedNow = (Date.now() - startRef.current) / 1000;
      const avgPerSet = elapsedNow / done;
      const remaining = episodes.length - done;
      setEta(Math.round(avgPerSet * remaining));
    }

    if (timerRef.current) clearInterval(timerRef.current);
    setStatus("done");
    setCurrentName("");
    setEta(null);
    router.refresh();
  }

  function reset() {
    setStatus("idle");
    setCurrent(0);
    setTotalCards(0);
    setErrors(0);
    setElapsed(0);
    setEta(null);
  }

  const alreadySynced = totalSets - episodes.length;

  if (status === "idle") {
    if (episodes.length === 0) {
      return (
        <span className="text-xs text-gray-400 dark:text-white/30 py-2 px-1">
          All {totalSets} sets synced ✓
        </span>
      );
    }
    return (
      <button
        onClick={handleSyncAll}
        className="glass px-5 py-2 rounded-xl text-sm font-semibold text-gray-800 dark:text-white shadow-md hover:scale-[1.02] transition-all active:scale-[0.98]"
      >
        Sync {episodes.length} missing set{episodes.length !== 1 ? "s" : ""}
        {alreadySynced > 0 && (
          <span className="ml-1.5 text-xs font-normal text-gray-400 dark:text-white/40">
            ({alreadySynced} done)
          </span>
        )}
      </button>
    );
  }

  const isDone = status === "done";

  return (
    <div className="glass rounded-2xl p-5 shadow-lg shadow-black/5 w-full max-w-md">

      {/* Top row: title + set counter */}
      <div className="flex items-start justify-between mb-1">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">
          {isDone ? "Sync complete" : "Syncing all cards…"}
        </p>
        <span className="text-xs font-semibold tabular-nums text-gray-900 dark:text-white ml-4 shrink-0">
          {current} / {total} sets
        </span>
      </div>

      {/* Current set name */}
      <p className="text-xs text-gray-400 dark:text-white/40 truncate mb-3 h-4">
        {isDone
          ? errors > 0 ? `${errors} set${errors > 1 ? "s" : ""} failed` : "All sets synced"
          : currentName}
      </p>

      {/* Progress bar */}
      <div className="h-1.5 w-full rounded-full bg-black/8 dark:bg-white/10 overflow-hidden mb-4">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${pct}%`,
            background: isDone ? (errors > 0 ? "#f87171" : "#34d399") : "white",
          }}
        />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="glass rounded-xl py-2 px-1">
          <p className="text-xs font-bold text-gray-900 dark:text-white tabular-nums">
            {totalCards.toLocaleString()}
          </p>
          <p className="text-[10px] text-gray-400 dark:text-white/40 mt-0.5">cards</p>
        </div>
        <div className="glass rounded-xl py-2 px-1">
          <p className="text-xs font-bold text-gray-900 dark:text-white tabular-nums">
            {fmtTime(elapsed)}
          </p>
          <p className="text-[10px] text-gray-400 dark:text-white/40 mt-0.5">elapsed</p>
        </div>
        <div className="glass rounded-xl py-2 px-1">
          <p className="text-xs font-bold text-gray-900 dark:text-white tabular-nums">
            {isDone ? "—" : eta !== null && current > 0 ? fmtTime(eta) : "…"}
          </p>
          <p className="text-[10px] text-gray-400 dark:text-white/40 mt-0.5">
            {isDone ? "done" : "remaining"}
          </p>
        </div>
      </div>

      {/* Done actions */}
      {isDone && (
        <div className="flex gap-4 mt-4">
          <button
            onClick={reset}
            className="text-xs text-gray-400 dark:text-white/40 hover:text-gray-700 dark:hover:text-white transition-colors"
          >
            Dismiss
          </button>
          {errors > 0 && (
            <button
              onClick={handleSyncAll}
              className="text-xs font-medium text-gray-700 dark:text-white hover:underline"
            >
              Retry failed
            </button>
          )}
        </div>
      )}
    </div>
  );
}
