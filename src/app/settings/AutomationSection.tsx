"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Package, RefreshCw } from "lucide-react";
import { useSettings } from "@/components/SettingsProvider";
import SyncButton from "../expansions/SyncButton";

function SyncSealedButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function handleSync() {
    setLoading(true);
    setStatus("Syncing sealed products for all expansions...");
    try {
      const res = await fetch("/api/sync-sealed", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setStatus(`Done - ${data.products} sealed products across ${data.synced} expansions`);
        router.refresh();
      } else if (data.cancelled) {
        setStatus(data.error ?? "Sealed sync stopped.");
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
        <Package className={`h-4 w-4 ${loading ? "animate-pulse" : ""}`} />
        {loading ? "Syncing sealed..." : "Sync Sealed Products"}
      </button>
      {status && <p className="max-w-sm text-xs text-gray-400">{status}</p>}
    </div>
  );
}

function SyncCardHistoryButton({ pendingCards }: { pendingCards: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!loading) return;

    const interval = window.setInterval(() => {
      router.refresh();
    }, 2500);

    return () => window.clearInterval(interval);
  }, [loading, router]);

  async function handleSync() {
    setLoading(true);
    setStatus("Syncing full TCGGO card history...");
    try {
      const res = await fetch("/api/sync-card-history", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setStatus(
          data.message ??
            `Done - ${data.syncedCards} cards synced, ${data.newHistorySnapshots} history snapshots imported`
        );
        router.refresh();
      } else if (data.cancelled) {
        setStatus(data.error ?? "Card history sync stopped.");
        router.refresh();
      } else {
        const activeLabel =
          data.activeType === "card-history"
            ? "Card history sync is still running"
            : data.activeType
              ? `Another sync is running: ${data.activeType}`
              : null;
        setStatus(activeLabel ?? `Error: ${data.error}`);
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
        disabled={loading || pendingCards === 0}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-black/8 bg-black/[0.03] px-4 py-2.5 text-sm font-semibold text-gray-800 shadow-sm shadow-black/5 transition-all hover:scale-[1.01] hover:bg-black/[0.045] disabled:cursor-not-allowed disabled:opacity-50 disabled:scale-100 dark:border-white/8 dark:bg-white/[0.05] dark:text-gray-100 dark:hover:bg-white/[0.08]"
      >
        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        {loading ? "Syncing history..." : "Sync Card History"}
      </button>
      <p className="max-w-sm text-xs text-gray-400">Manual only.</p>
      {status && <p className="max-w-sm text-xs text-gray-400">{status}</p>}
    </div>
  );
}

const TIERS = [
  {
    label: "Base",
    badge: "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300",
    description: "Common and Uncommon",
    cadence: "First sync, then manual only",
  },
  {
    label: "Medium",
    badge: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    description: "Rare, Rare Holo, and holo variants",
    cadence: "Every 24 hours",
  },
  {
    label: "High",
    badge: "bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-300",
    description: "Ultra rares, illustration rares, promos, and higher tiers",
    cadence: "Every 12 hours",
  },
] as const;

interface AutomationSectionProps {
  scraperUsage: {
    requestsUsed: number;
    requestsLimit: number | null;
    requestsRemaining: number | null;
    resetLabel: string | null;
    observedLabel: string | null;
  };
  pendingCardHistoryCards: number;
  activeScraperLabel: string | null;
}

function formatRequestsUsed(used: number, limit: number | null): string {
  if (limit == null) return `${used}`;
  return `${used} / ${limit}`;
}

export default function AutomationSection({
  scraperUsage,
  pendingCardHistoryCards,
  activeScraperLabel,
}: AutomationSectionProps) {
  const { settings, set } = useSettings();

  return (
    <div className="glass rounded-2xl p-6 shadow-md shadow-black/5">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Automation</h2>
        <p className="mt-0.5 text-sm text-gray-400">
          Keep prices fresh in the background while DustyCards is open.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            Background price refresh
          </p>
          <p className="mt-0.5 text-xs text-gray-400">
            Checks roughly every minute without blocking the first page load.
          </p>
        </div>
        <button
          onClick={() => set("autoPriceRefresh", !settings.autoPriceRefresh)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            settings.autoPriceRefresh ? "bg-gray-900 dark:bg-white" : "bg-black/10 dark:bg-white/10"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full transition-transform ${
              settings.autoPriceRefresh
                ? "translate-x-6 bg-white dark:bg-gray-900"
                : "translate-x-1 bg-white dark:bg-white/60"
            }`}
          />
        </button>
      </div>

      <div className="mt-5 border-t border-black/6 pt-5 dark:border-white/6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">Refresh tools</p>
            <p className="mt-0.5 text-xs text-gray-400">
              Check for new sets, new cards, and missing first prices.
            </p>
            <div className="mt-3 grid max-w-xl gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-black/6 px-3 py-2 dark:border-white/8">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  Scraper Requests
                </p>
                <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                  {formatRequestsUsed(scraperUsage.requestsUsed, scraperUsage.requestsLimit)}
                </p>
              </div>
              <div className="rounded-lg border border-black/6 px-3 py-2 dark:border-white/8">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  Remaining
                </p>
                <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                  {scraperUsage.requestsRemaining ?? "--"}
                </p>
              </div>
              <div className="rounded-lg border border-black/6 px-3 py-2 dark:border-white/8">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  Reset
                </p>
                <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                  {scraperUsage.resetLabel ?? "--"}
                </p>
              </div>
            </div>
            {scraperUsage.observedLabel && (
              <p className="mt-2 text-[11px] text-gray-400">
                Updated {scraperUsage.observedLabel}
              </p>
            )}
            {activeScraperLabel ? (
              <p className="mt-2 max-w-xl text-[11px] text-gray-400">
                Active now: {activeScraperLabel}
              </p>
            ) : null}
          </div>
          <SyncButton />
        </div>
      </div>

      <div className="mt-5 border-t border-black/6 pt-5 dark:border-white/6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">Card history import</p>
            <p className="mt-0.5 text-xs text-gray-400">
              Import full TCGGO history for cards across all expansions, excluding Common, Uncommon, and Rare.
            </p>
            <p className="mt-2 text-xs text-gray-500 dark:text-white/45">
              Pending eligible expansion cards:{" "}
              <span className="font-semibold text-gray-900 dark:text-white">
                {pendingCardHistoryCards}
              </span>
            </p>
          </div>
          <SyncCardHistoryButton pendingCards={pendingCardHistoryCards} />
        </div>
      </div>

      <div className="mt-5 border-t border-black/6 pt-5 dark:border-white/6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              Sync sealed products
            </p>
            <p className="mt-0.5 text-xs text-gray-400">
              Fetch booster boxes, tins, and other sealed products for all expansions.
            </p>
          </div>
          <SyncSealedButton />
        </div>
      </div>

      <div className="mt-5 border-t border-black/6 pt-5 dark:border-white/6">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
          Refresh Tiers
        </p>
        <div className="space-y-2.5">
          {TIERS.map((tier) => (
            <div
              key={tier.label}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/6 bg-black/[0.02] px-4 py-3 dark:border-white/8 dark:bg-white/[0.03]"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tier.badge}`}>
                  {tier.label}
                </span>
                <span className="text-sm text-gray-600 dark:text-gray-300">
                  {tier.description}
                </span>
              </div>
              <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
                {tier.cadence}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
