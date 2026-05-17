import type { GroupedSyncStatusEntry, SyncStatusEntry } from "./sync-status-utils";
import {
  compactMessage,
  formatDateTime,
  formatDuration,
  groupSyncEntries,
  humanStatus,
  parseActivityMetrics,
  statusBadge,
  visualStatus,
} from "./sync-status-utils";

function getActivitySummary(entry: SyncStatusEntry | GroupedSyncStatusEntry): string {
  const { metrics, detail } = parseActivityMetrics(entry);
  const metricSummary = metrics
    .slice(0, 4)
    .map((metric) => `${metric.value} ${metric.label}`)
    .join(", ");

  return metricSummary || detail || compactMessage(entry.message, 160) || "No details recorded.";
}

export function StatusPill({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadge(status)}`}>
      {humanStatus(status)}
    </span>
  );
}

export function MetricCell({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string | null;
  tone?: "default" | "good" | "warning" | "danger";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-700 dark:text-emerald-200"
      : tone === "warning"
        ? "text-amber-700 dark:text-amber-200"
        : tone === "danger"
          ? "text-rose-700 dark:text-rose-200"
          : "text-gray-900 dark:text-white";

  return (
    <div className="min-w-0 border-l border-black/6 px-3 py-2 first:border-l-0 dark:border-white/8">
      <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">
        {label}
      </p>
      <p
        className={`mt-1 truncate text-lg font-semibold leading-tight ${toneClass}`}
        title={String(value)}
      >
        {value}
      </p>
      {hint && (
        <p className="mt-0.5 truncate text-xs text-gray-400" title={hint}>
          {hint}
        </p>
      )}
    </div>
  );
}

export function CompactFailureList({ entries }: { entries: SyncStatusEntry[] }) {
  const groupedEntries = groupSyncEntries(entries);
  if (groupedEntries.length === 0) return null;

  return (
    <div className="border-t border-black/6 pt-4 dark:border-white/6">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">
          Recent Issues
        </p>
        <p className="text-xs text-gray-400">Only unresolved failures are shown.</p>
      </div>
      <div className="divide-y divide-rose-200/50 overflow-hidden rounded-lg border border-rose-200/60 bg-rose-50/40 dark:divide-rose-400/10 dark:border-rose-400/20 dark:bg-rose-900/10">
        {groupedEntries.map((entry) => (
          <div key={entry.id} className="grid gap-2 px-3 py-2.5 md:grid-cols-[8rem_minmax(0,1fr)_9rem] md:items-center">
            <div className="flex items-center gap-2">
              <StatusPill status={visualStatus(entry)} />
              {entry.entries.length > 1 && (
                <span className="text-xs font-semibold text-rose-700 dark:text-rose-200">
                  x{entry.entries.length}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                {entry.label}
              </p>
              <p className="truncate text-xs text-rose-700 dark:text-rose-200" title={getActivitySummary(entry)}>
                {getActivitySummary(entry)}
              </p>
            </div>
            <p className="text-xs text-gray-400 md:text-right">
              {formatDateTime(entry.started_at)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CompactActivityList({ entries }: { entries: SyncStatusEntry[] }) {
  const groupedEntries = groupSyncEntries(entries).slice(0, 5);

  return (
    <div className="border-t border-black/6 pt-4 dark:border-white/6">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">
          Recent Activity
        </p>
        <p className="text-xs text-gray-400">Latest 5 grouped runs.</p>
      </div>

      {groupedEntries.length === 0 ? (
        <p className="text-sm text-gray-400">No sync activity yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-black/6 dark:border-white/8">
          <div className="hidden grid-cols-[7rem_minmax(0,1fr)_minmax(0,1.7fr)_9rem_5rem] gap-3 border-b border-black/6 bg-black/[0.02] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400 dark:border-white/8 dark:bg-white/[0.03] md:grid">
            <span>Status</span>
            <span>Sync</span>
            <span>Result</span>
            <span className="text-right">When</span>
            <span className="text-right">Time</span>
          </div>
          <div className="divide-y divide-black/6 dark:divide-white/8">
            {groupedEntries.map((entry) => {
              const duration = formatDuration(entry.started_at, entry.finished_at);
              const summary = getActivitySummary(entry);

              return (
                <div
                  key={entry.id}
                  className="grid gap-2 px-3 py-2.5 md:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1.7fr)_9rem_5rem] md:items-center md:gap-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill status={visualStatus(entry)} />
                    {entry.entries.length > 1 && (
                      <span className="rounded-full border border-black/8 px-2 py-0.5 text-[11px] font-semibold text-gray-500 dark:border-white/10 dark:text-white/55">
                        x{entry.entries.length}
                      </span>
                    )}
                  </div>
                  <p className="min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-white">
                    {entry.label}
                  </p>
                  <p className="min-w-0 truncate text-sm text-gray-500 dark:text-gray-400" title={summary}>
                    {summary}
                  </p>
                  <p className="text-xs text-gray-400 md:text-right">
                    {formatDateTime(entry.started_at)}
                  </p>
                  <p className="text-xs text-gray-400 md:text-right">{duration ?? "--"}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
