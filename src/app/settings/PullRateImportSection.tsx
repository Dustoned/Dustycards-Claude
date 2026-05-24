"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Database, Download, RefreshCw, Upload } from "lucide-react";

interface PullRateImportSectionProps {
  summary: {
    setCount: number;
    rarityRowCount: number;
    lastImportedLabel: string | null;
    lastGeneratedAt: string | null;
  };
}

interface ImportResponse {
  ok: boolean;
  setsImported?: number;
  rarityRowsImported?: number;
  skippedRows?: number;
  warnings?: string[];
  error?: string;
}

interface FetchResponse extends ImportResponse {
  requestedSets?: number;
  fetchedSets?: number;
  discoveredPages?: number;
  matchedPages?: number;
  failedSets?: Array<{
    setCode: string;
    status: number | null;
    error: string;
  }>;
}

export default function PullRateImportSection({ summary }: PullRateImportSectionProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [content, setContent] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState<
    "collectrics-missing" | "collectrics-all" | "pricedex-missing" | "pricedex-all" | null
  >(null);
  const [status, setStatus] = useState<string | null>(null);
  const [fetchStatus, setFetchStatus] = useState<string | null>(null);
  const [manualImportOpen, setManualImportOpen] = useState(false);
  const showManualImport = manualImportOpen || Boolean(content || fileName || status);

  async function handleFileChange(file: File | null) {
    if (!file) return;
    setFileName(file.name);
    setContent(await file.text());
    setStatus(null);
  }

  async function handleImport() {
    const trimmed = content.trim();
    if (!trimmed) {
      setStatus("Add a JSON or CSV export first.");
      return;
    }

    setLoading(true);
    setStatus("Importing pull-rate data...");

    try {
      const response = await fetch("/api/pull-rates/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: "collectrics",
          content: trimmed,
        }),
      });
      const data = (await response.json()) as ImportResponse;

      if (!response.ok || !data.ok) {
        const warning = data.warnings?.[0];
        setStatus(data.error ?? warning ?? "No usable pull-rate rows found.");
        return;
      }

      setStatus(
        `Imported ${data.setsImported ?? 0} sets, ${data.rarityRowsImported ?? 0} rarity rows. ${
          data.skippedRows ? `${data.skippedRows} rows skipped.` : ""
        }`.trim()
      );
      setContent("");
      setFileName(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.refresh();
    } catch {
      setStatus("Network error while importing pull-rate data.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCollectricsFetch(missingOnly: boolean) {
    const mode = missingOnly ? "collectrics-missing" : "collectrics-all";
    setFetching(mode);
    setFetchStatus(
      missingOnly
        ? "Fetching missing Collectrics pull-rate sets..."
        : "Refreshing all local set codes from Collectrics..."
    );

    try {
      const response = await fetch("/api/pull-rates/fetch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: "collectrics", missingOnly }),
      });
      const data = (await response.json()) as FetchResponse;

      if (!response.ok || !data.ok) {
        const warning = data.warnings?.[0];
        setFetchStatus(data.error ?? warning ?? "No Collectrics pull-rate sets could be fetched.");
        return;
      }

      if ((data.requestedSets ?? 0) === 0) {
        setFetchStatus("All local set codes already have Collectrics pull-rate data.");
      } else {
        const failedCount = data.failedSets?.length ?? 0;
        setFetchStatus(
          `Fetched ${data.fetchedSets ?? 0}/${data.requestedSets ?? 0} sets, imported ${
            data.setsImported ?? 0
          } with ${data.rarityRowsImported ?? 0} rarity rows.${
            failedCount ? ` ${failedCount} set codes were not available on Collectrics.` : ""
          }`
        );
      }

      router.refresh();
    } catch {
      setFetchStatus("Network error while fetching Collectrics pull-rate data.");
    } finally {
      setFetching(null);
    }
  }

  async function handleThePriceDexFetch(missingOnly: boolean) {
    const mode = missingOnly ? "pricedex-missing" : "pricedex-all";
    setFetching(mode);
    setFetchStatus(
      missingOnly
        ? "Fetching missing ThePriceDex pull-rate and EV pages..."
        : "Refreshing all local sets from ThePriceDex..."
    );

    try {
      const response = await fetch("/api/pull-rates/fetch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: "pricedex", missingOnly }),
      });
      const data = (await response.json()) as FetchResponse;

      if (!response.ok || !data.ok) {
        const warning = data.warnings?.[0];
        setFetchStatus(data.error ?? warning ?? "No ThePriceDex pull-rate pages could be fetched.");
        return;
      }

      if ((data.requestedSets ?? 0) === 0) {
        setFetchStatus("All local set codes already have ThePriceDex pull-rate and EV data.");
      } else {
        setFetchStatus(
          `Scanned ${data.discoveredPages ?? 0} ThePriceDex pages, matched ${
            data.matchedPages ?? 0
          } local sets, imported ${data.setsImported ?? 0} with ${
            data.rarityRowsImported ?? 0
          } rarity/EV rows.`
        );
      }

      router.refresh();
    } catch {
      setFetchStatus("Network error while fetching ThePriceDex pull-rate data.");
    } finally {
      setFetching(null);
    }
  }

  return (
    <div className="settings-panel glass min-w-0 rounded-2xl p-6 shadow-md shadow-black/5">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            Pull Rate Data
          </h2>
          <p className="mt-0.5 text-sm text-gray-400">
            Fetch ThePriceDex EV tables for expansions and movers, with Collectrics as fallback.
          </p>
        </div>
        <Database className="mt-1 h-5 w-5 shrink-0 text-gray-400 dark:text-white/40" />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-black/6 px-3 py-2 dark:border-white/8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">
            Imported sets
          </p>
          <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
            {summary.setCount.toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-black/6 px-3 py-2 dark:border-white/8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">
            Rarity rows
          </p>
          <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
            {summary.rarityRowCount.toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-black/6 px-3 py-2 dark:border-white/8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">
            Last import
          </p>
          <p className="mt-1 break-words text-sm font-semibold text-gray-900 dark:text-white">
            {summary.lastImportedLabel ?? "--"}
          </p>
        </div>
        <div className="rounded-xl border border-black/6 px-3 py-2 dark:border-white/8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">
            Generated at
          </p>
          <p className="mt-1 break-words text-sm font-semibold text-gray-900 dark:text-white">
            {summary.lastGeneratedAt ?? "--"}
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-violet-500/16 bg-violet-500/[0.045] p-4 dark:border-violet-300/12 dark:bg-violet-300/[0.055]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              Fetch from ThePriceDex
            </p>
            <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-white/45">
              Imports public pull-rate tables, booster EV, and expected-value breakdowns for local Pokemon sets.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:min-w-48">
            <button
              type="button"
              onClick={() => void handleThePriceDexFetch(true)}
              disabled={Boolean(fetching) || loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-500/18 bg-violet-500/12 px-4 py-2.5 text-sm font-semibold text-violet-900 shadow-sm shadow-black/5 transition-all hover:scale-[1.01] hover:bg-violet-500/16 disabled:cursor-not-allowed disabled:scale-100 disabled:opacity-50 dark:text-violet-100"
            >
              <Download
                className={`h-4 w-4 ${fetching === "pricedex-missing" ? "animate-pulse" : ""}`}
              />
              {fetching === "pricedex-missing" ? "Fetching..." : "Fetch Missing"}
            </button>
            <button
              type="button"
              onClick={() => void handleThePriceDexFetch(false)}
              disabled={Boolean(fetching) || loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-black/8 bg-black/[0.03] px-4 py-2.5 text-sm font-semibold text-gray-800 shadow-sm shadow-black/5 transition-all hover:scale-[1.01] hover:bg-black/[0.045] disabled:cursor-not-allowed disabled:scale-100 disabled:opacity-50 dark:border-white/8 dark:bg-white/[0.05] dark:text-gray-100 dark:hover:bg-white/[0.08]"
            >
              <RefreshCw
                className={`h-4 w-4 ${fetching === "pricedex-all" ? "animate-spin" : ""}`}
              />
              {fetching === "pricedex-all" ? "Refreshing..." : "Refresh All"}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-emerald-500/12 bg-emerald-500/[0.035] p-4 dark:border-emerald-300/10 dark:bg-emerald-300/[0.04]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              Fetch from Collectrics
            </p>
            <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-white/45">
              Uses your local set codes and only stores pull odds plus PSA population context. Price,
              EV and pack-cost fields are ignored.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:min-w-48">
            <button
              type="button"
              onClick={() => void handleCollectricsFetch(true)}
              disabled={Boolean(fetching) || loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/18 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-900 shadow-sm shadow-black/5 transition-all hover:scale-[1.01] hover:bg-emerald-500/14 disabled:cursor-not-allowed disabled:scale-100 disabled:opacity-50 dark:text-emerald-100"
            >
              <Download
                className={`h-4 w-4 ${fetching === "collectrics-missing" ? "animate-pulse" : ""}`}
              />
              {fetching === "collectrics-missing" ? "Fetching..." : "Fetch Missing"}
            </button>
            <button
              type="button"
              onClick={() => void handleCollectricsFetch(false)}
              disabled={Boolean(fetching) || loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-black/8 bg-black/[0.03] px-4 py-2.5 text-sm font-semibold text-gray-800 shadow-sm shadow-black/5 transition-all hover:scale-[1.01] hover:bg-black/[0.045] disabled:cursor-not-allowed disabled:scale-100 disabled:opacity-50 dark:border-white/8 dark:bg-white/[0.05] dark:text-gray-100 dark:hover:bg-white/[0.08]"
            >
              <RefreshCw
                className={`h-4 w-4 ${fetching === "collectrics-all" ? "animate-spin" : ""}`}
              />
              {fetching === "collectrics-all" ? "Refreshing..." : "Refresh All"}
            </button>
          </div>
        </div>
        {fetchStatus ? (
          <p className="mt-3 min-w-0 break-words text-xs text-gray-500 dark:text-white/45">
            {fetchStatus}
          </p>
        ) : null}
      </div>

      <div className="mt-5 border-t border-black/6 pt-5 dark:border-white/6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              Manual import
            </p>
            <p className="mt-0.5 text-xs text-gray-400">
              Use a local JSON or CSV backup only when Collectrics fetch is not enough.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setManualImportOpen((open) => !open)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-black/8 bg-black/[0.03] px-4 py-2.5 text-sm font-semibold text-gray-800 shadow-sm shadow-black/5 transition-all hover:scale-[1.01] hover:bg-black/[0.045] disabled:cursor-not-allowed disabled:opacity-50 disabled:scale-100 dark:border-white/8 dark:bg-white/[0.05] dark:text-gray-100 dark:hover:bg-white/[0.08]"
          >
            <Upload className="h-4 w-4" />
            {showManualImport ? "Hide Import" : "Open Import"}
          </button>
        </div>

        {showManualImport ? (
          <div className="mt-4 space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.csv,application/json,text/csv,text/plain"
              onChange={(event) => void handleFileChange(event.target.files?.[0] ?? null)}
              className="block w-full text-sm text-gray-500 file:mr-3 file:rounded-xl file:border-0 file:bg-black/[0.04] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-gray-800 hover:file:bg-black/[0.07] dark:text-white/45 dark:file:bg-white/[0.08] dark:file:text-white dark:hover:file:bg-white/[0.12]"
            />
            {fileName ? (
              <p className="text-xs text-gray-400">Loaded {fileName}</p>
            ) : null}
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={5}
              placeholder='Paste Collectrics set JSON or CSV here, for example {"set-code":"SFA","rarity-breakdown":{...}}'
              className="w-full resize-y rounded-2xl border border-black/8 bg-white/70 px-3 py-3 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-black/15 dark:border-white/8 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-white/28 dark:focus:border-white/18"
            />
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => void handleImport()}
                disabled={loading || content.trim().length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-black/8 bg-black/[0.03] px-4 py-2.5 text-sm font-semibold text-gray-800 shadow-sm shadow-black/5 transition-all hover:scale-[1.01] hover:bg-black/[0.045] disabled:cursor-not-allowed disabled:opacity-50 disabled:scale-100 dark:border-white/8 dark:bg-white/[0.05] dark:text-gray-100 dark:hover:bg-white/[0.08]"
              >
                <Upload className={`h-4 w-4 ${loading ? "animate-pulse" : ""}`} />
                {loading ? "Importing..." : "Import Pull Rates"}
              </button>
              {status ? (
                <p className="min-w-0 break-words text-xs text-gray-500 dark:text-white/45">{status}</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
