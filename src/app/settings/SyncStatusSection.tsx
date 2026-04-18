interface SyncStatusEntry {
  id: string;
  type: string;
  label: string;
  status: string;
  message: string | null;
  started_at: Date;
  finished_at: Date | null;
}

interface AutoRefreshStatus {
  active: SyncStatusEntry | null;
  lastSuccess: SyncStatusEntry | null;
  dueCards: number;
  missingPriceCards: number;
  nextBatchCards: number;
  nextBatchEpisodes: number;
}

function formatDateTime(value: Date | null): string {
  if (!value) return "--";

  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatDuration(startedAt: Date, finishedAt: Date | null): string | null {
  const end = finishedAt ?? new Date();
  const diffMs = end.getTime() - startedAt.getTime();
  if (diffMs < 0) return null;

  const totalSeconds = Math.round(diffMs / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m ${seconds}s`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function statusBadge(status: string): string {
  switch (status) {
    case "running":
      return "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
    case "success":
      return "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
    case "failed":
      return "bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300";
    default:
      return "bg-black/5 text-gray-600 dark:bg-white/8 dark:text-white/60";
  }
}

function SummaryTile({
  title,
  entry,
  emptyLabel,
}: {
  title: string;
  entry: SyncStatusEntry | null;
  emptyLabel: string;
}) {
  return (
    <div className="rounded-xl border border-black/6 bg-black/[0.02] p-4 dark:border-white/8 dark:bg-white/[0.03]">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{title}</p>
      {entry ? (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadge(entry.status)}`}>
              {entry.status === "running"
                ? "Running"
                : entry.status === "success"
                  ? "Success"
                  : "Failed"}
            </span>
            <span className="text-sm font-semibold text-gray-900 dark:text-white">{entry.label}</span>
          </div>
          <p className="text-xs text-gray-400">
            Started {formatDateTime(entry.started_at)}
            {entry.finished_at ? ` | Finished ${formatDateTime(entry.finished_at)}` : ""}
          </p>
          {entry.message && <p className="text-sm text-gray-500 dark:text-gray-400">{entry.message}</p>}
        </div>
      ) : (
        <p className="mt-3 text-sm text-gray-400">{emptyLabel}</p>
      )}
    </div>
  );
}

function AutoRefreshCard({
  active,
  lastSuccess,
  dueCards,
  missingPriceCards,
  nextBatchCards,
  nextBatchEpisodes,
}: AutoRefreshStatus) {
  const isRunning = Boolean(active);
  const anchorEntry = active ?? lastSuccess;

  return (
    <div className="rounded-xl border border-black/6 bg-black/[0.02] p-4 dark:border-white/8 dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadge(isRunning ? "running" : "success")}`}>
          {isRunning ? "Running" : "Idle"}
        </span>
        <span className="text-sm font-semibold text-gray-900 dark:text-white">Background Price Refresh</span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Due Now</p>
          <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{dueCards}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Missing First Prices</p>
          <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{missingPriceCards}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Next Batch</p>
          <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{nextBatchCards}</p>
          <p className="text-xs text-gray-400">{nextBatchEpisodes} sets</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            {isRunning ? "Started" : "Last Refresh"}
          </p>
          <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
            {anchorEntry ? formatDateTime(isRunning ? anchorEntry.started_at : anchorEntry.finished_at) : "--"}
          </p>
        </div>
      </div>

      {anchorEntry?.message && (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">{anchorEntry.message}</p>
      )}
    </div>
  );
}

export default function SyncStatusSection({
  activeSync,
  lastSuccessfulSync,
  lastFailedSync,
  autoRefreshStatus,
  recentSyncs,
}: {
  activeSync: SyncStatusEntry | null;
  lastSuccessfulSync: SyncStatusEntry | null;
  lastFailedSync: SyncStatusEntry | null;
  autoRefreshStatus: AutoRefreshStatus;
  recentSyncs: SyncStatusEntry[];
}) {
  return (
    <div className="glass rounded-2xl p-6 shadow-md shadow-black/5">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Sync Status</h2>
        <p className="mt-0.5 text-sm text-gray-400">
          See whether a sync is running and what happened most recently.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <SummaryTile title="Current" entry={activeSync} emptyLabel="Idle right now." />
        <SummaryTile
          title="Last Success"
          entry={lastSuccessfulSync}
          emptyLabel="No successful manual sync yet."
        />
        <SummaryTile title="Last Failed" entry={lastFailedSync} emptyLabel="No failed manual syncs." />
      </div>

      <div className="mt-5 border-t border-black/6 pt-5 dark:border-white/6">
        <AutoRefreshCard {...autoRefreshStatus} />
      </div>

      <div className="mt-5 border-t border-black/6 pt-5 dark:border-white/6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Recent Activity
          </p>
          <p className="text-xs text-gray-400">Refresh this page to update.</p>
        </div>

        {recentSyncs.length === 0 ? (
          <p className="text-sm text-gray-400">No manual sync activity yet.</p>
        ) : (
          <div className="space-y-2.5">
            {recentSyncs.map((entry) => {
              const duration = formatDuration(entry.started_at, entry.finished_at);

              return (
                <div
                  key={entry.id}
                  className="rounded-xl border border-black/6 bg-black/[0.02] px-4 py-3 dark:border-white/8 dark:bg-white/[0.03]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadge(entry.status)}`}>
                      {entry.status === "running"
                        ? "Running"
                        : entry.status === "success"
                          ? "Success"
                          : "Failed"}
                    </span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {entry.label}
                    </span>
                    <span className="text-xs text-gray-400">{formatDateTime(entry.started_at)}</span>
                    {duration && <span className="text-xs text-gray-400">| {duration}</span>}
                  </div>
                  {entry.message && (
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{entry.message}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
