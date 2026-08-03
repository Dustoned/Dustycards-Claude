"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Package, RefreshCw } from "lucide-react";
import SyncButton from "../expansions/SyncButton";

function StartBackgroundRefreshButton({
  scraperDisabled,
  disabledReason,
}: {
  scraperDisabled: boolean;
  disabledReason: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function handleStart() {
    setLoading(true);
    setStatus("Starting server-side background refresh...");
    try {
      const res = await fetch("/api/price-refresh", {
        method: "POST",
        cache: "no-store",
      });
      const data = await res.json();

      if (!data.ok) {
        setStatus(`Error: ${data.error}`);
        return;
      }

      const pendingCards = Number(data.pendingCards ?? data.autoJobPendingCards ?? 0);
      setStatus(
        data.started || data.autoJobStarted
          ? `Background job started with ${pendingCards} cards waiting.`
          : data.running || data.autoJobRunning
            ? `Background job is already running with ${pendingCards} cards waiting.`
            : pendingCards > 0
              ? `${pendingCards} cards are waiting; job is queued.`
              : "No price work waiting right now."
      );
      router.refresh();
    } catch {
      setStatus("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto">
      <button
        onClick={handleStart}
        disabled={loading || scraperDisabled}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-black/8 bg-black/[0.03] px-4 py-2.5 text-sm font-semibold text-gray-800 shadow-sm shadow-black/5 transition-all hover:scale-[1.01] hover:bg-black/[0.045] disabled:cursor-not-allowed disabled:opacity-50 disabled:scale-100 dark:border-white/8 dark:bg-white/[0.05] dark:text-gray-100 dark:hover:bg-white/[0.08] sm:w-auto"
      >
        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        {loading ? "Starting..." : "Start Background Refresh"}
      </button>
      {scraperDisabled && (
        <p className="max-w-sm break-words text-xs text-amber-600 dark:text-amber-300">
          {disabledReason}
        </p>
      )}
      {status && <p className="max-w-sm break-words text-xs text-gray-400">{status}</p>}
    </div>
  );
}

function SyncSealedButton({
  scraperDisabled,
  disabledReason,
}: {
  scraperDisabled: boolean;
  disabledReason: string;
}) {
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
    <div className="flex w-full flex-col gap-2 sm:w-auto">
      <button
        onClick={handleSync}
        disabled={loading || scraperDisabled}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-black/8 bg-black/[0.03] px-4 py-2.5 text-sm font-semibold text-gray-800 shadow-sm shadow-black/5 transition-all hover:scale-[1.01] hover:bg-black/[0.045] disabled:cursor-not-allowed disabled:opacity-50 disabled:scale-100 dark:border-white/8 dark:bg-white/[0.05] dark:text-gray-100 dark:hover:bg-white/[0.08] sm:w-auto"
      >
        <Package className={`h-4 w-4 ${loading ? "animate-pulse" : ""}`} />
        {loading ? "Syncing sealed..." : "Sync Sealed Products"}
      </button>
      {scraperDisabled && (
        <p className="max-w-sm break-words text-xs text-amber-600 dark:text-amber-300">
          {disabledReason}
        </p>
      )}
      {status && <p className="max-w-sm break-words text-xs text-gray-400">{status}</p>}
    </div>
  );
}

function SyncCardHistoryButton({
  pendingCards,
  scraperDisabled,
  disabledReason,
}: {
  pendingCards: number;
  scraperDisabled: boolean;
  disabledReason: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!loading) return;

    let cancelled = false;

    async function pollStatus() {
      try {
        const res = await fetch("/api/sync-card-history", {
          method: "GET",
          cache: "no-store",
        });
        const data = await res.json();
        if (cancelled || !data.ok) return;

        router.refresh();

        if (!data.running) {
          setLoading(false);
          setStatus(
            data.error
              ? `History sync stopped: ${data.error}`
              : data.pendingCards > 0
                ? `History sync paused with ${data.pendingCards} cards remaining.`
                : "History import complete."
          );
        }
      } catch {
        // Keep the local running state; the next poll can recover.
      }
    }

    const interval = window.setInterval(() => {
      void pollStatus();
    }, 2500);

    void pollStatus();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [loading, router]);

  async function handleSync() {
    setLoading(true);
    setStatus("Starting server-side history sync...");
    try {
      const res = await fetch("/api/sync-card-history", { method: "POST" });
      const data = await res.json();

      if (!data.ok) {
        setStatus(`Error: ${data.error}`);
        setLoading(false);
        return;
      }

      setStatus(
        data.started ? "History sync is running server-side." : "History sync is already running."
      );
      router.refresh();
    } catch {
      setStatus("Network error");
      setLoading(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto">
      <button
        onClick={handleSync}
        disabled={loading || pendingCards === 0 || scraperDisabled}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-black/8 bg-black/[0.03] px-4 py-2.5 text-sm font-semibold text-gray-800 shadow-sm shadow-black/5 transition-all hover:scale-[1.01] hover:bg-black/[0.045] disabled:cursor-not-allowed disabled:opacity-50 disabled:scale-100 dark:border-white/8 dark:bg-white/[0.05] dark:text-gray-100 dark:hover:bg-white/[0.08] sm:w-auto"
      >
        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        {loading ? "History sync running..." : "Sync Card History"}
      </button>
      <p className="max-w-sm text-xs text-gray-400">
        Runs server-side in chunks, so it keeps going while this page refreshes.
      </p>
      {scraperDisabled && (
        <p className="max-w-sm break-words text-xs text-amber-600 dark:text-amber-300">
          {disabledReason}
        </p>
      )}
      {status && <p className="max-w-sm break-words text-xs text-gray-400">{status}</p>}
    </div>
  );
}

function CheckKnownUnavailablePricesButton({
  knownUnavailableCards,
  scraperDisabled,
  disabledReason,
}: {
  knownUnavailableCards: number;
  scraperDisabled: boolean;
  disabledReason: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function handleSync() {
    setLoading(true);
    setStatus("Checking known unavailable cards for prices...");
    try {
      const res = await fetch("/api/sync-known-unavailable-prices", { method: "POST" });
      const data = await res.json();

      if (!data.ok) {
        setStatus(`Error: ${data.error}`);
        setLoading(false);
        return;
      }

      const checkedCards = Number(data.checkedCards ?? 0);
      const pricedCards = Number(data.refreshedCards ?? 0);
      const remainingUnavailableCards = Number(data.remainingUnavailableCards ?? 0);
      setStatus(
        checkedCards > 0
          ? `Checked ${checkedCards} cards; ${pricedCards} have prices now; ${remainingUnavailableCards} still known unavailable.`
          : "No known unavailable cards to check."
      );
      router.refresh();
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
        disabled={loading || knownUnavailableCards === 0 || scraperDisabled}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-black/8 bg-black/[0.03] px-4 py-2.5 text-sm font-semibold text-gray-800 shadow-sm shadow-black/5 transition-all hover:scale-[1.01] hover:bg-black/[0.045] disabled:cursor-not-allowed disabled:opacity-50 disabled:scale-100 dark:border-white/8 dark:bg-white/[0.05] dark:text-gray-100 dark:hover:bg-white/[0.08] sm:w-auto"
      >
        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        {loading ? "Checking prices..." : "Check Known Unavailable"}
      </button>
      <p className="max-w-sm text-xs text-gray-400">
        Re-checks cards that previously had no source price and clears the unavailable marker when prices return.
      </p>
      {scraperDisabled && (
        <p className="max-w-sm break-words text-xs text-amber-600 dark:text-amber-300">
          {disabledReason}
        </p>
      )}
      {status && <p className="max-w-sm break-words text-xs text-gray-400">{status}</p>}
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
    cadence: "Rolling daily refresh",
  },
  {
    label: "High",
    badge: "bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-300",
    description: "Ultra rares, illustration rares, promos, and higher tiers",
    cadence: "Rolling 12h refresh",
  },
] as const;

interface AutomationSectionProps {
  schedulerHealth: {
    status: string | null;
    healthy: boolean;
    lastTickLabel: string | null;
    nextTickLabel: string | null;
    lastActionLabel: string;
    historyPendingCards: number | null;
    normalizedPriceCheckedAtCards: number | null;
    pricedCardsMissingCheckedAt: number;
  };
  historyAutomation: {
    running: boolean;
    pendingCards: number;
    startedLabel: string | null;
    finishedLabel: string | null;
    drainWindowLabel: string | null;
    quotaResetLabel: string | null;
    error: string | null;
  };
  knownUnavailableSummary: {
    total: number;
    pokemon: number;
    onePiece: number;
    retryWindow: number;
    withoutPriceSnapshot: number;
    withPriceSnapshot: number;
    oldestCheckedLabel: string | null;
    latestCheckedLabel: string | null;
    nextRetryLabel: string | null;
  };
  pendingCardHistoryCards: number;
  pendingSealedHistoryProducts: number;
  pendingCardHistoryByGame: {
    pokemon: number;
    onePiece: number;
  };
  knownUnavailableCards: number;
  activeScraperLabel: string | null;
  scraperDisabled: boolean;
  scraperDisabledReason: string;
}

function UsageStat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-black/6 px-3 py-2 dark:border-white/8">
      <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-semibold leading-snug text-gray-900 dark:text-white">
        {value}
      </p>
    </div>
  );
}

function HealthPill({
  healthy,
  status,
}: {
  healthy: boolean;
  status: string | null;
}) {
  const label = healthy ? "Healthy" : status === "paused" ? "Paused" : "Needs attention";

  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
        healthy
          ? "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-700 dark:text-emerald-200"
          : "border-amber-400/25 bg-amber-400/[0.08] text-amber-700 dark:text-amber-200"
      }`}
      title={status ? `Scheduler status: ${status}` : "Scheduler status is not available yet"}
    >
      {label}
    </span>
  );
}

export default function AutomationSection({
  schedulerHealth,
  historyAutomation,
  knownUnavailableSummary,
  pendingCardHistoryCards,
  pendingSealedHistoryProducts,
  pendingCardHistoryByGame,
  knownUnavailableCards,
  activeScraperLabel,
  scraperDisabled,
  scraperDisabledReason,
}: AutomationSectionProps) {
  return (
    <div className="settings-panel glass min-w-0 rounded-2xl p-6 shadow-md shadow-black/5">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Sync Automation</h2>
        <p className="mt-0.5 text-sm text-gray-400">
          Scheduler state and manual tools for background data work.
        </p>
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            Background price refresh
          </p>
          <p className="mt-0.5 text-xs text-gray-400">
            Server scheduler checks every 5 minutes and starts work when the queue is ready.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.08] px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-200">
              Server job
            </span>
            <button
              disabled
              aria-pressed="true"
              title="Background price refresh is always on"
              type="button"
              className="relative inline-flex h-6 w-11 shrink-0 cursor-not-allowed items-center overflow-hidden rounded-full bg-gray-900 opacity-90 transition-colors dark:bg-white"
            >
              <span className="inline-block h-4 w-4 translate-x-6 transform rounded-full bg-white transition-transform dark:bg-gray-900" />
            </button>
          </div>
          <StartBackgroundRefreshButton
            scraperDisabled={scraperDisabled}
            disabledReason={scraperDisabledReason}
          />
        </div>
      </div>
      <div className="mt-4 rounded-xl border border-black/6 bg-black/[0.02] p-3 dark:border-white/8 dark:bg-white/[0.03]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">
              Scheduler health
            </p>
            <p className="mt-1 truncate text-sm text-gray-600 dark:text-gray-300" title={schedulerHealth.lastActionLabel}>
              {schedulerHealth.lastActionLabel}
            </p>
          </div>
          <HealthPill healthy={schedulerHealth.healthy} status={schedulerHealth.status} />
        </div>
        <div className="grid w-full grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))] gap-2">
          <UsageStat label="Last tick" value={schedulerHealth.lastTickLabel ?? "--"} />
          <UsageStat label="Next tick" value={schedulerHealth.nextTickLabel ?? "--"} />
          <UsageStat label="History queue" value={schedulerHealth.historyPendingCards ?? "--"} />
          <UsageStat
            label="Missing checks"
            value={schedulerHealth.pricedCardsMissingCheckedAt}
          />
          <UsageStat
            label="Fixed last tick"
            value={schedulerHealth.normalizedPriceCheckedAtCards ?? 0}
          />
        </div>
      </div>

      <div className="mt-5 border-t border-black/6 pt-5 dark:border-white/6">
        {scraperDisabled && (
          <div className="mb-4 rounded-xl border border-amber-200/70 bg-amber-50/70 px-4 py-3 text-sm text-amber-800 [overflow-wrap:anywhere] dark:border-amber-400/20 dark:bg-amber-900/20 dark:text-amber-100">
            {scraperDisabledReason} Background and manual scraper refreshes are paused.
          </div>
        )}
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-white">Refresh tools</p>
            <p className="mt-0.5 text-xs text-gray-400">
              Check for new sets, new cards, and missing first prices.
            </p>
            {activeScraperLabel ? (
              <p className="mt-2 max-w-xl text-[11px] text-gray-400">
                Active now: {activeScraperLabel}
              </p>
            ) : null}
          </div>
          <SyncButton disabled={scraperDisabled} disabledReason={scraperDisabledReason} />
        </div>
      </div>

      <div className="mt-5 border-t border-black/6 pt-5 dark:border-white/6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-white">History import</p>
            <p className="mt-0.5 text-xs text-gray-400">
              Everything that still needs TCGGO history: cards (Common and Uncommon stay base-price
              only) plus sealed products whose snapshots are stale. The sealed backlog drains
              only in the final quota window, after every current price queue is complete.
            </p>
            <div className="mt-3 grid w-full grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))] gap-2">
              <UsageStat label="Job" value={historyAutomation.running ? "Running" : "Idle"} />
              <UsageStat label="Cards total" value={pendingCardHistoryCards} />
              <UsageStat label="Pokemon" value={pendingCardHistoryByGame.pokemon} />
              <UsageStat label="One Piece" value={pendingCardHistoryByGame.onePiece} />
              <UsageStat label="Sealed products" value={pendingSealedHistoryProducts} />
              <UsageStat label="Drain window" value={historyAutomation.drainWindowLabel ?? "--"} />
              <UsageStat label="Last finish" value={historyAutomation.finishedLabel ?? "--"} />
            </div>
            {historyAutomation.error ? (
              <p className="mt-2 max-w-xl text-xs text-rose-600 dark:text-rose-300">
                Last history job error: {historyAutomation.error}
              </p>
            ) : historyAutomation.startedLabel ? (
              <p className="mt-2 max-w-xl text-[11px] text-gray-400">
                Last started {historyAutomation.startedLabel}
                {historyAutomation.quotaResetLabel ? `; quota reset ${historyAutomation.quotaResetLabel}` : ""}.
              </p>
            ) : null}
          </div>
          <SyncCardHistoryButton
            pendingCards={pendingCardHistoryCards}
            scraperDisabled={scraperDisabled}
            disabledReason={scraperDisabledReason}
          />
        </div>
      </div>

      <div className="mt-5 border-t border-black/6 pt-5 dark:border-white/6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              Unavailable price sources
            </p>
            <p className="mt-0.5 text-xs text-gray-400">
              Source returned no current price, so normal refresh skips these cards until a retry is useful.
            </p>
            <div className="mt-3 grid w-full grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))] gap-2">
              <UsageStat label="Unavailable now" value={knownUnavailableSummary.total} />
              <UsageStat label="Retry ready" value={knownUnavailableSummary.retryWindow} />
              <UsageStat label="No price data" value={knownUnavailableSummary.withoutPriceSnapshot} />
              <UsageStat label="Has old price" value={knownUnavailableSummary.withPriceSnapshot} />
              <UsageStat label="Pokemon" value={knownUnavailableSummary.pokemon} />
              <UsageStat label="One Piece" value={knownUnavailableSummary.onePiece} />
            </div>
            <p className="mt-2 max-w-xl text-[11px] text-gray-400">
              {knownUnavailableSummary.oldestCheckedLabel || knownUnavailableSummary.latestCheckedLabel
                ? `Checked range: ${knownUnavailableSummary.oldestCheckedLabel ?? "--"} - ${
                    knownUnavailableSummary.latestCheckedLabel ?? "--"
                  }.`
                : "No unavailable price checks recorded yet."}
            </p>
            {knownUnavailableSummary.retryWindow > 0 ? (
              <p className="mt-2 max-w-xl text-[11px] text-gray-400">
                Retry ready means the last unavailable check is older than 7 days.
              </p>
            ) : knownUnavailableSummary.nextRetryLabel ? (
              <p className="mt-2 max-w-xl text-[11px] text-gray-400">
                Next retry window opens at {knownUnavailableSummary.nextRetryLabel}.
              </p>
            ) : null}
          </div>
          <CheckKnownUnavailablePricesButton
            knownUnavailableCards={knownUnavailableCards}
            scraperDisabled={scraperDisabled}
            disabledReason={scraperDisabledReason}
          />
        </div>
      </div>

      <div className="mt-5 border-t border-black/6 pt-5 dark:border-white/6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              Sync sealed products
            </p>
            <p className="mt-0.5 text-xs text-gray-400">
              Fetch booster boxes, tins, and other sealed products for all expansions.
            </p>
          </div>
          <SyncSealedButton
            scraperDisabled={scraperDisabled}
            disabledReason={scraperDisabledReason}
          />
        </div>
      </div>

      <div className="mt-5 border-t border-black/6 pt-5 dark:border-white/6">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
          Refresh Tiers
        </p>
        <div className="grid gap-2 lg:grid-cols-3">
          {TIERS.map((tier) => (
            <div
              key={tier.label}
              className="min-w-0 rounded-xl border border-black/6 bg-black/[0.02] px-3 py-2.5 dark:border-white/8 dark:bg-white/[0.03]"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tier.badge}`}>
                  {tier.label}
                </span>
                <span className="min-w-0 truncate text-sm text-gray-600 dark:text-gray-300" title={tier.description}>
                  {tier.description}
                </span>
              </div>
              <span className="mt-2 block truncate text-xs font-medium uppercase tracking-wider text-gray-400" title={tier.cadence}>
                {tier.cadence}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
