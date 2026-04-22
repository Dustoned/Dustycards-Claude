import type { AutoRefreshStatus, GroupedSyncStatusEntry, OverviewStatus, SyncStatusEntry } from "./sync-status-utils";
import {
  compactMessage,
  describeGroupedWindow,
  formatDateTime,
  formatDuration,
  groupSyncEntries,
  humanStatus,
  metricBadgeTone,
  parseActivityMetrics,
  parseAutoRefreshProgress,
  statusBadge,
  visualStatus,
} from "./sync-status-utils";

export function SyncEntryCard({
  entry,
  accent = "default",
}: {
  entry: GroupedSyncStatusEntry;
  accent?: "default" | "failure";
}) {
  const duration = formatDuration(entry.started_at, entry.finished_at);
  const repeatCount = entry.entries.length;
  const { metrics, detail } = parseActivityMetrics(entry);
  const isFailure = accent === "failure" || entry.status === "failed";
  const entryStatus = visualStatus(entry);

  return (
    <div
      className={
        isFailure
          ? "rounded-xl border border-rose-200/60 bg-rose-50/45 px-4 py-3 dark:border-rose-400/20 dark:bg-rose-900/10"
          : "rounded-xl border border-black/6 bg-black/[0.02] px-4 py-3 dark:border-white/8 dark:bg-white/[0.03]"
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadge(entryStatus)}`}>
          {humanStatus(entryStatus)}
        </span>
        <span className="text-sm font-semibold text-gray-900 dark:text-white">{entry.label}</span>
        {repeatCount > 1 && (
          <span className="rounded-full border border-black/8 bg-black/[0.03] px-2.5 py-1 text-[11px] font-semibold text-gray-500 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/55">
            x{repeatCount}
          </span>
        )}
        <span className="text-xs text-gray-400">{describeGroupedWindow(entry)}</span>
        {duration && <span className="text-xs text-gray-400">| {duration}</span>}
      </div>

      {metrics.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {metrics.map((metric) => (
            <span
              key={`${metric.label}-${metric.value}`}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${metricBadgeTone(metric.tone)}`}
            >
              {metric.value} {metric.label}
            </span>
          ))}
        </div>
      )}

      {detail && (
        <p
          className={`mt-3 text-sm ${
            isFailure ? "text-rose-700 dark:text-rose-200" : "text-gray-500 dark:text-gray-400"
          }`}
        >
          {detail}
        </p>
      )}
    </div>
  );
}

export function SummaryTile({
  title,
  entry,
  emptyLabel,
}: {
  title: string;
  entry: SyncStatusEntry | null;
  emptyLabel: string;
}) {
  const duration = entry ? formatDuration(entry.started_at, entry.finished_at) : null;
  const summary = compactMessage(entry?.message ?? null, 180);
  const entryStatus = entry ? visualStatus(entry) : null;

  return (
    <div className="rounded-xl border border-black/6 bg-black/[0.02] p-4 dark:border-white/8 dark:bg-white/[0.03]">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{title}</p>
      {entry ? (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadge(entryStatus ?? entry.status)}`}>
              {humanStatus(entryStatus ?? entry.status)}
            </span>
            <span className="text-sm font-semibold text-gray-900 dark:text-white">{entry.label}</span>
          </div>
          <p className="text-xs text-gray-400">
            Started {formatDateTime(entry.started_at)}
            {entry.finished_at ? ` | Finished ${formatDateTime(entry.finished_at)}` : ""}
            {duration ? ` | ${entry.finished_at ? duration : `Running ${duration}`}` : ""}
          </p>
          {summary && <p className="text-sm text-gray-500 dark:text-gray-400">{summary}</p>}
        </div>
      ) : (
        <p className="mt-3 text-sm text-gray-400">{emptyLabel}</p>
      )}
    </div>
  );
}

export function OverviewTile({ overview }: { overview: OverviewStatus }) {
  return (
    <div className="rounded-xl border border-black/6 bg-black/[0.02] p-4 dark:border-white/8 dark:bg-white/[0.03]">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Recent Overview</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Running Now</p>
          <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{overview.runningNow}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Recent Successes</p>
          <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{overview.success24h}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Recent Failures</p>
          <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{overview.failed24h}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Recent Auto Failures</p>
          <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{overview.autoFailures24h}</p>
        </div>
      </div>

      {overview.lastActivity && (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
          Last activity:{" "}
          <span className="font-medium text-gray-700 dark:text-gray-200">
            {overview.lastActivity.label}
          </span>{" "}
          at {formatDateTime(overview.lastActivity.started_at)}.
        </p>
      )}
    </div>
  );
}

export function AutoRefreshCard({
  active,
  lastSuccess,
  lastFailure,
  dueCards,
  missingPriceCards,
  nextBatchCards,
  nextBatchEpisodes,
  nextBatchSetLabels,
  nextBatchCardLabels,
}: AutoRefreshStatus) {
  const isRunning = Boolean(active);
  const activeProgress = parseAutoRefreshProgress(active?.message ?? null);
  const batchCards = activeProgress.batchCards ?? nextBatchCards;
  const batchSets = activeProgress.batchSets ?? nextBatchEpisodes;
  const remainingAfterBatch = Math.max(dueCards - batchCards, 0);
  const currentSummary = compactMessage(active?.message ?? null, 220);
  const lastSuccessSummary = compactMessage(lastSuccess?.message ?? null, 220);
  const activeStatus = active ? visualStatus(active) : "success";

  return (
    <div className="rounded-xl border border-black/6 bg-black/[0.02] p-4 dark:border-white/8 dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadge(
            isRunning ? activeStatus : "success"
          )}`}
        >
          {isRunning ? humanStatus(activeStatus) : "Idle"}
        </span>
        <span className="text-sm font-semibold text-gray-900 dark:text-white">
          Background Price Refresh
        </span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            Eligible Now
          </p>
          <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{dueCards}</p>
          <p className="text-xs text-gray-400">Cards currently eligible for auto refresh</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            Missing First Prices
          </p>
          <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
            {missingPriceCards}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            {isRunning ? "Current Batch" : "Next Batch Preview"}
          </p>
          <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{batchCards}</p>
          <p className="text-xs text-gray-400">{batchSets} sets</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            {isRunning ? "Remaining After Current Batch" : "Remaining After Preview"}
          </p>
          <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
            {remainingAfterBatch}
          </p>
          <p className="text-xs text-gray-400">Estimated live queue after this batch</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Active Run</p>
          {active ? (
            <>
              <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                {activeProgress.currentSet ?? formatDateTime(active.started_at)}
              </p>
              <p className="text-xs text-gray-400">
                {activeProgress.currentSetIndex != null && activeProgress.currentSetTotal != null
                  ? `Set ${activeProgress.currentSetIndex}/${activeProgress.currentSetTotal}`
                  : formatDateTime(active.started_at)}
                {activeProgress.currentSetCards != null
                  ? ` | ${activeProgress.currentSetCards} selected cards`
                  : ""}
              </p>
              <p className="text-xs text-gray-400">
                {formatDuration(active.started_at, null) ?? "--"}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">--</p>
          )}
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            Last Completed Batch
          </p>
          <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
            {lastSuccess ? formatDateTime(lastSuccess.finished_at) : "--"}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Last Failure</p>
          <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
            {lastFailure ? formatDateTime(lastFailure.finished_at) : "--"}
          </p>
        </div>
      </div>

      {currentSummary && (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
          Active batch: {currentSummary}
        </p>
      )}
      {!currentSummary && lastSuccessSummary && (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
          Last completed batch: {lastSuccessSummary}
        </p>
      )}
      <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
        Eligible Now is recalculated live across the whole queue, so a completed batch can be done
        while the current eligible queue is already higher again.
      </p>
      {active?.cancel_requested_at && (
        <p className="mt-3 text-sm text-amber-700 dark:text-amber-200">
          Stop requested. The current in-flight batch will finish before this run exits.
        </p>
      )}
      {nextBatchSetLabels.length > 0 && (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
          {isRunning ? "Current batch sets:" : "Preview sets:"}{" "}
          <span className="font-medium text-gray-700 dark:text-gray-200">
            {nextBatchSetLabels.join(", ")}
          </span>
        </p>
      )}
      {nextBatchCardLabels.length > 0 && (
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {isRunning ? "Current batch sample cards:" : "Preview cards:"}{" "}
          <span className="font-medium text-gray-700 dark:text-gray-200">
            {nextBatchCardLabels.join(", ")}
          </span>
        </p>
      )}
    </div>
  );
}

export function FailureList({ entries }: { entries: SyncStatusEntry[] }) {
  const groupedEntries = groupSyncEntries(entries);

  return (
    <div className="mt-5 border-t border-black/6 pt-5 dark:border-white/6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Recent Issues</p>
        <p className="text-xs text-gray-400">
          Only problems without a later successful rerun stay here.
        </p>
      </div>

      {groupedEntries.length === 0 ? (
        <p className="text-sm text-gray-400">No active sync issues right now.</p>
      ) : (
        <div className="space-y-2.5">
          {groupedEntries.map((entry) => (
            <SyncEntryCard key={entry.id} entry={entry} accent="failure" />
          ))}
        </div>
      )}
    </div>
  );
}

export function ActivityList({ entries }: { entries: SyncStatusEntry[] }) {
  const groupedEntries = groupSyncEntries(entries);

  return (
    <div className="mt-5 border-t border-black/6 pt-5 dark:border-white/6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Recent Activity</p>
        <p className="text-xs text-gray-400">
          Identical back-to-back runs are grouped to keep this readable.
        </p>
      </div>

      {groupedEntries.length === 0 ? (
        <p className="text-sm text-gray-400">No sync activity yet.</p>
      ) : (
        <div className="space-y-2.5">
          {groupedEntries.map((entry) => (
            <SyncEntryCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
