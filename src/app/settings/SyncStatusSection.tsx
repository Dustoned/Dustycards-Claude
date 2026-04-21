import SyncStatusAutoRefresh from "./SyncStatusAutoRefresh";
import SyncCancelButton from "./SyncCancelButton";

interface SyncStatusEntry {
  id: string;
  type: string;
  label: string;
  status: string;
  message: string | null;
  started_at: Date;
  finished_at: Date | null;
  cancel_requested_at: Date | null;
}

interface AutoRefreshStatus {
  active: SyncStatusEntry | null;
  lastSuccess: SyncStatusEntry | null;
  lastFailure: SyncStatusEntry | null;
  dueCards: number;
  missingPriceCards: number;
  nextBatchCards: number;
  nextBatchEpisodes: number;
  nextBatchSetLabels: string[];
  nextBatchCardLabels: string[];
}

interface OverviewStatus {
  runningNow: number;
  success24h: number;
  failed24h: number;
  autoFailures24h: number;
  lastActivity: SyncStatusEntry | null;
}

interface ActivityMetric {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning";
}

interface GroupedSyncStatusEntry {
  id: string;
  type: string;
  label: string;
  status: string;
  message: string | null;
  started_at: Date;
  finished_at: Date | null;
  cancel_requested_at: Date | null;
  oldest_started_at: Date;
  entries: SyncStatusEntry[];
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
    case "cancelling":
      return "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
    case "running":
      return "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
    case "success":
      return "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
    case "cancelled":
      return "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300";
    case "failed":
      return "bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300";
    default:
      return "bg-black/5 text-gray-600 dark:bg-white/8 dark:text-white/60";
  }
}

function humanStatus(status: string): string {
  switch (status) {
    case "cancelling":
      return "Stopping";
    case "running":
      return "Running";
    case "success":
      return "Success";
    case "cancelled":
      return "Cancelled";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

function visualStatus(entry: Pick<SyncStatusEntry, "status" | "cancel_requested_at">): string {
  if (entry.status === "running" && entry.cancel_requested_at) {
    return "cancelling";
  }

  return entry.status;
}

function compactMessage(message: string | null, maxLength = 220): string | null {
  if (!message) return null;

  const normalized = message.replace(/\s+/g, " ").trim();
  if (!normalized) return null;

  const uniqueConstraintMatch = normalized.match(
    /Unique constraint failed on the fields: \(([^)]+)\)/i
  );
  if (uniqueConstraintMatch) {
    return `Unique constraint failed on (${uniqueConstraintMatch[1]}).`;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function parseAutoRefreshProgress(message: string | null): {
  batchCards: number | null;
  batchSets: number | null;
  dueBacklog: number | null;
  currentSet: string | null;
  currentSetIndex: number | null;
  currentSetTotal: number | null;
  currentSetCards: number | null;
} {
  const normalized = compactMessage(message, 500);
  if (!normalized) {
    return {
      batchCards: null,
      batchSets: null,
      dueBacklog: null,
      currentSet: null,
      currentSetIndex: null,
      currentSetTotal: null,
      currentSetCards: null,
    };
  }

  const result = {
    batchCards: null as number | null,
    batchSets: null as number | null,
    dueBacklog: null as number | null,
    currentSet: null as string | null,
    currentSetIndex: null as number | null,
    currentSetTotal: null as number | null,
    currentSetCards: null as number | null,
  };

  for (const part of normalized.split("|").map((entry) => entry.trim()).filter(Boolean)) {
    let match = part.match(/^Batch (\d+) cards across (\d+) sets$/i);
    if (match) {
      result.batchCards = Number(match[1]);
      result.batchSets = Number(match[2]);
      continue;
    }

    match = part.match(/^due backlog (\d+)$/i);
    if (match) {
      result.dueBacklog = Number(match[1]);
      continue;
    }

    match = part.match(/^Refreshing (.+) \((\d+)\/(\d+)\)$/i);
    if (match) {
      result.currentSet = match[1];
      result.currentSetIndex = Number(match[2]);
      result.currentSetTotal = Number(match[3]);
      continue;
    }

    match = part.match(/^(\d+) cards$/i);
    if (match && result.currentSetCards == null) {
      result.currentSetCards = Number(match[1]);
    }
  }

  return result;
}

function metricBadgeTone(tone: ActivityMetric["tone"] = "default"): string {
  switch (tone) {
    case "success":
      return "border-emerald-200/70 bg-emerald-50/60 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-900/20 dark:text-emerald-200";
    case "warning":
      return "border-amber-200/70 bg-amber-50/60 text-amber-700 dark:border-amber-400/20 dark:bg-amber-900/20 dark:text-amber-200";
    default:
      return "border-black/8 bg-black/[0.03] text-gray-600 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/70";
  }
}

function parseActivityMetrics(entry: SyncStatusEntry): {
  metrics: ActivityMetric[];
  detail: string | null;
} {
  const normalized = compactMessage(entry.message, 320);
  if (!normalized) {
    return { metrics: [], detail: null };
  }

  const parts = normalized
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
  const metrics: ActivityMetric[] = [];
  const details: string[] = [];

  for (const part of parts) {
    let match = part.match(/^Checked (\d+) cards$/i);
    if (match) {
      metrics.push({ label: "cards checked", value: match[1] });
      continue;
    }

    match = part.match(/^Eligible (\d+) cards$/i);
    if (match) {
      metrics.push({ label: "eligible", value: match[1] });
      continue;
    }

    match = part.match(/^Synced (\d+) cards$/i);
    if (match) {
      metrics.push({ label: "cards synced", value: match[1] });
      continue;
    }

    match = part.match(/^Checked (\d+) sets$/i);
    if (match) {
      metrics.push({ label: "sets checked", value: match[1] });
      continue;
    }

    match = part.match(/^(\d+) sets$/i);
    if (match) {
      metrics.push({ label: "sets", value: match[1] });
      continue;
    }

    match = part.match(/^(\d+) synced$/i);
    if (match) {
      metrics.push({ label: "synced", value: match[1] });
      continue;
    }

    match = part.match(/^(\d+) skipped$/i);
    if (match) {
      metrics.push({ label: "skipped", value: match[1] });
      continue;
    }

    match = part.match(/^(\d+) new sets$/i);
    if (match) {
      metrics.push({ label: "new sets", value: match[1], tone: "success" });
      continue;
    }

    match = part.match(/^(\d+) new cards$/i);
    if (match) {
      metrics.push({ label: "new cards", value: match[1], tone: "success" });
      continue;
    }

    match = part.match(/^(\d+) updated cards$/i);
    if (match) {
      metrics.push({ label: "updated cards", value: match[1] });
      continue;
    }

    match = part.match(/^(\d+) new price snapshots$/i);
    if (match) {
      metrics.push({ label: "new snapshots", value: match[1], tone: "success" });
      continue;
    }

    match = part.match(/^(\d+) refreshed prices$/i);
    if (match) {
      metrics.push({ label: "refreshed", value: match[1] });
      continue;
    }

    match = part.match(/^(\d+) graded prices updated$/i);
    if (match) {
      metrics.push({ label: "graded", value: match[1] });
      continue;
    }

    match = part.match(/^(\d+) history snapshots$/i);
    if (match) {
      metrics.push({ label: "history snapshots", value: match[1] });
      continue;
    }

    match = part.match(/^(\d+) first-price checks$/i);
    if (match) {
      metrics.push({ label: "first prices", value: match[1] });
      continue;
    }

    match = part.match(/^(\d+) history backfills$/i);
    if (match) {
      metrics.push({ label: "history", value: match[1] });
      continue;
    }

    match = part.match(/^(\d+) still due$/i);
    if (match) {
      metrics.push({ label: "still due", value: match[1], tone: "warning" });
      continue;
    }

    match = part.match(/^(\d+) still pending$/i);
    if (match) {
      metrics.push({ label: "pending", value: match[1], tone: "warning" });
      continue;
    }

    match = part.match(/^Syncing card history (\d+)\/(\d+)$/i);
    if (match) {
      metrics.push({ label: "processed", value: `${match[1]}/${match[2]}` });
      continue;
    }

    match = part.match(/^(\d+) sets synced$/i);
    if (match) {
      metrics.push({ label: "sets synced", value: match[1] });
      continue;
    }

    match = part.match(/^(\d+) sealed products updated$/i);
    if (match) {
      metrics.push({ label: "sealed updated", value: match[1] });
      continue;
    }

    match = part.match(/^Batch (\d+) cards across (\d+) sets$/i);
    if (match) {
      metrics.push({ label: "batch cards", value: match[1] });
      metrics.push({ label: "batch sets", value: match[2] });
      continue;
    }

    match = part.match(/^due backlog (\d+)$/i);
    if (match) {
      metrics.push({ label: "due backlog", value: match[1], tone: "warning" });
      continue;
    }

    if (/^Checked \d+$/i.test(part) && entry.type.startsWith("card:")) {
      continue;
    }

    if (/^metadata unchanged$/i.test(part)) {
      details.push("Metadata unchanged.");
      continue;
    }

    if (/^metadata updated$/i.test(part)) {
      details.push("Metadata updated.");
      continue;
    }

    details.push(part);
  }

  return {
    metrics: metrics.slice(0, 8),
    detail: details.length > 0 ? details.join(" | ") : null,
  };
}

function groupSyncEntries(entries: SyncStatusEntry[]): GroupedSyncStatusEntry[] {
  const grouped: GroupedSyncStatusEntry[] = [];

  for (const entry of entries) {
    const summaryKey = compactMessage(entry.message, 240) ?? "";
    const previous = grouped[grouped.length - 1];

    if (
      previous &&
      previous.status === entry.status &&
      previous.label === entry.label &&
      (compactMessage(previous.message, 240) ?? "") === summaryKey
    ) {
      previous.entries.push(entry);
      previous.oldest_started_at = entry.started_at;
      continue;
    }

    grouped.push({
      ...entry,
      oldest_started_at: entry.started_at,
      entries: [entry],
    });
  }

  return grouped;
}

function describeGroupedWindow(entry: GroupedSyncStatusEntry): string {
  if (entry.entries.length <= 1) {
    return formatDateTime(entry.started_at);
  }

  return `${entry.entries.length} runs from ${formatDateTime(entry.oldest_started_at)} to ${formatDateTime(entry.started_at)}`;
}

function SyncEntryCard({
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

function SummaryTile({
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

function OverviewTile({ overview }: { overview: OverviewStatus }) {
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

function AutoRefreshCard({
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
            Due Backlog
          </p>
          <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{dueCards}</p>
          <p className="text-xs text-gray-400">Live eligible queue</p>
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
            {isRunning ? "Current Batch" : "Selected Next Batch"}
          </p>
          <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{batchCards}</p>
          <p className="text-xs text-gray-400">{batchSets} sets</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            {isRunning ? "Remaining After Batch" : "Remaining After Next Batch"}
          </p>
          <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
            {remainingAfterBatch}
          </p>
          <p className="text-xs text-gray-400">Approximate live backlog</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Current Run</p>
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
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Last Success</p>
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
          Current activity: {currentSummary}
        </p>
      )}
      {!currentSummary && lastSuccessSummary && (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
          Last success: {lastSuccessSummary}
        </p>
      )}
      <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
        Due backlog is recalculated live across the whole queue, so it is not a progress bar for
        the current set.
      </p>
      {active?.cancel_requested_at && (
        <p className="mt-3 text-sm text-amber-700 dark:text-amber-200">
          Stop requested. The current in-flight batch will finish before this run exits.
        </p>
      )}
      {nextBatchSetLabels.length > 0 && (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
          {isRunning ? "Batch sets:" : "Next sets:"}{" "}
          <span className="font-medium text-gray-700 dark:text-gray-200">
            {nextBatchSetLabels.join(", ")}
          </span>
        </p>
      )}
      {nextBatchCardLabels.length > 0 && (
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {isRunning ? "Sample cards in batch:" : "Cards in queue:"}{" "}
          <span className="font-medium text-gray-700 dark:text-gray-200">
            {nextBatchCardLabels.join(", ")}
          </span>
        </p>
      )}
    </div>
  );
}

function FailureList({ entries }: { entries: SyncStatusEntry[] }) {
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

function ActivityList({ entries }: { entries: SyncStatusEntry[] }) {
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

export default function SyncStatusSection({
  activeSync,
  lastSuccessfulSync,
  lastFailedSync,
  overview,
  autoRefreshStatus,
  recentSyncs,
  recentFailures,
}: {
  activeSync: SyncStatusEntry | null;
  lastSuccessfulSync: SyncStatusEntry | null;
  lastFailedSync: SyncStatusEntry | null;
  overview: OverviewStatus;
  autoRefreshStatus: AutoRefreshStatus;
  recentSyncs: SyncStatusEntry[];
  recentFailures: SyncStatusEntry[];
}) {
  return (
    <div className="glass rounded-2xl p-6 shadow-md shadow-black/5">
      <SyncStatusAutoRefresh enabled={Boolean(activeSync)} />

      <div className="mb-5">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Sync Status</h2>
        <p className="mt-0.5 text-sm text-gray-400">
          See what is running now, where the queue is headed, and why recent syncs failed.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryTile title="Current" entry={activeSync} emptyLabel="Idle right now." />
        <SummaryTile
          title="Last Success"
          entry={lastSuccessfulSync}
          emptyLabel="No successful syncs yet."
        />
        <SummaryTile title="Last Failed" entry={lastFailedSync} emptyLabel="No failed syncs." />
        <OverviewTile overview={overview} />
      </div>

      {activeSync && (
        <div className="mt-5 border-t border-black/6 pt-5 dark:border-white/6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {activeSync.cancel_requested_at
                  ? "Stopping current sync"
                  : `Current sync: ${activeSync.label}`}
              </p>
              <p className="mt-0.5 text-xs text-gray-400">
                {activeSync.cancel_requested_at
                  ? "The running job will stop at the next safe checkpoint."
                  : "Use stop if you want the current job to finish its in-flight batch and then exit cleanly."}
              </p>
            </div>
            <SyncCancelButton
              syncId={activeSync.id}
              syncLabel={activeSync.label}
              cancellationRequested={Boolean(activeSync.cancel_requested_at)}
            />
          </div>
        </div>
      )}

      <div className="mt-5 border-t border-black/6 pt-5 dark:border-white/6">
        <AutoRefreshCard {...autoRefreshStatus} />
      </div>

      <FailureList entries={recentFailures} />
      <ActivityList entries={recentSyncs} />
    </div>
  );
}
