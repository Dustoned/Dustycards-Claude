import {
  decodeSyncLogMessage,
  type AutoPriceRefreshLogDetails,
  type CardHistoryLogDetails,
  type EpisodeSyncLogDetails,
  type FullSyncLogDetails,
  type SealedSyncLogDetails,
  type SyncLogDetails,
} from "@/lib/sync-log-details";

export interface SyncStatusEntry {
  id: string;
  type: string;
  label: string;
  status: string;
  message: string | null;
  details?: SyncLogDetails | null;
  started_at: Date;
  finished_at: Date | null;
  cancel_requested_at: Date | null;
}

export interface AutoRefreshStatus {
  active: SyncStatusEntry | null;
  lastSuccess: SyncStatusEntry | null;
  lastFailure: SyncStatusEntry | null;
  dueCards: number;
  missingPriceCards: number;
  unavailableCooldownCards: number;
  nextUnavailableRetryLabel: string | null;
  nextBatchCards: number;
  nextBatchEpisodes: number;
  nextBatchSetLabels: string[];
  nextBatchCardLabels: string[];
  requestsRemaining: number | null;
  requestConcurrency: number;
  quotaPaused: boolean;
  quotaResetLabel: string | null;
  scraperDisabled: boolean;
}

export interface OverviewStatus {
  runningNow: number;
  success24h: number;
  failed24h: number;
  autoFailures24h: number;
  lastActivity: SyncStatusEntry | null;
}

export interface SyncStatusSectionProps {
  activeSync: SyncStatusEntry | null;
  lastSuccessfulSync: SyncStatusEntry | null;
  lastFailedSync: SyncStatusEntry | null;
  overview: OverviewStatus;
  autoRefreshStatus: AutoRefreshStatus;
  recentSyncs: SyncStatusEntry[];
  recentFailures: SyncStatusEntry[];
}

interface ActivityMetric {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning";
}

export interface GroupedSyncStatusEntry {
  id: string;
  type: string;
  label: string;
  status: string;
  message: string | null;
  details?: SyncLogDetails | null;
  started_at: Date;
  finished_at: Date | null;
  cancel_requested_at: Date | null;
  oldest_started_at: Date;
  entries: SyncStatusEntry[];
}

export function formatDateTime(value: Date | null): string {
  if (!value) return "--";

  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export function formatDuration(startedAt: Date, finishedAt: Date | null): string | null {
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

export function statusBadge(status: string): string {
  switch (status) {
    case "cancelling":
      return "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
    case "running":
      return "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
    case "success":
      return "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
    case "cancelled":
      return "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300";
    case "paused":
      return "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
    case "failed":
      return "bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300";
    default:
      return "bg-black/5 text-gray-600 dark:bg-white/8 dark:text-white/60";
  }
}

export function humanStatus(status: string): string {
  switch (status) {
    case "cancelling":
      return "Stopping";
    case "running":
      return "Running";
    case "success":
      return "Success";
    case "cancelled":
      return "Cancelled";
    case "paused":
      return "Paused";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

export function visualStatus(
  entry: Pick<SyncStatusEntry, "status" | "cancel_requested_at">
): string {
  if (entry.status === "running" && entry.cancel_requested_at) {
    return "cancelling";
  }

  return entry.status;
}

export function compactMessage(message: string | null, maxLength = 220): string | null {
  if (!message) return null;

  const decoded = decodeSyncLogMessage(message);
  const normalized = (decoded.message ?? "").replace(/\s+/g, " ").trim();
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

export function parseAutoRefreshProgress(
  message: string | null,
  explicitDetails?: SyncLogDetails | null
): {
  batchCards: number | null;
  batchSets: number | null;
  dueBacklog: number | null;
  currentSet: string | null;
  currentSetIndex: number | null;
  currentSetTotal: number | null;
  currentSetCards: number | null;
} {
  const decoded = decodeSyncLogMessage(message);
  const details =
    explicitDetails?.kind === "auto-price-refresh"
      ? explicitDetails
      : decoded.details?.kind === "auto-price-refresh"
        ? decoded.details
        : null;

  if (details) {
    return {
      batchCards: details.selectedCards,
      batchSets: details.currentSet?.total ?? details.checkedEpisodes,
      dueBacklog: details.remainingDueCards,
      currentSet: details.currentSet?.name ?? null,
      currentSetIndex: details.currentSet?.index ?? null,
      currentSetTotal: details.currentSet?.total ?? null,
      currentSetCards: details.currentSet?.cards ?? null,
    };
  }

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

    match = part.match(/^(?:due backlog|eligible queue|eligible queue preview) (\d+)$/i);
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

function getAutoRefreshDetails(entry: SyncStatusEntry): AutoPriceRefreshLogDetails | null {
  if (entry.details?.kind === "auto-price-refresh") {
    return entry.details;
  }

  const decoded = decodeSyncLogMessage(entry.message);
  return decoded.details?.kind === "auto-price-refresh" ? decoded.details : null;
}

function getCardHistoryDetails(entry: SyncStatusEntry): CardHistoryLogDetails | null {
  if (entry.details?.kind === "card-history") {
    return entry.details;
  }

  const decoded = decodeSyncLogMessage(entry.message);
  return decoded.details?.kind === "card-history" ? decoded.details : null;
}

function getEpisodeSyncDetails(entry: SyncStatusEntry): EpisodeSyncLogDetails | null {
  if (entry.details?.kind === "episode-sync") {
    return entry.details;
  }

  const decoded = decodeSyncLogMessage(entry.message);
  return decoded.details?.kind === "episode-sync" ? decoded.details : null;
}

function getFullSyncDetails(entry: SyncStatusEntry): FullSyncLogDetails | null {
  if (entry.details?.kind === "full-sync") {
    return entry.details;
  }

  const decoded = decodeSyncLogMessage(entry.message);
  return decoded.details?.kind === "full-sync" ? decoded.details : null;
}

function getSealedSyncDetails(entry: SyncStatusEntry): SealedSyncLogDetails | null {
  if (entry.details?.kind === "sealed-sync") {
    return entry.details;
  }

  const decoded = decodeSyncLogMessage(entry.message);
  return decoded.details?.kind === "sealed-sync" ? decoded.details : null;
}

export function metricBadgeTone(tone: ActivityMetric["tone"] = "default"): string {
  switch (tone) {
    case "success":
      return "border-emerald-200/70 bg-emerald-50/60 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-900/20 dark:text-emerald-200";
    case "warning":
      return "border-amber-200/70 bg-amber-50/60 text-amber-700 dark:border-amber-400/20 dark:bg-amber-900/20 dark:text-amber-200";
    default:
      return "border-black/8 bg-black/[0.03] text-gray-600 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/70";
  }
}

export function parseActivityMetrics(entry: SyncStatusEntry): {
  metrics: ActivityMetric[];
  detail: string | null;
} {
  const autoDetails = getAutoRefreshDetails(entry);
  if (autoDetails) {
    const metrics: ActivityMetric[] = [
      { label: "cards checked", value: String(autoDetails.selectedCards) },
      { label: "sets checked", value: String(autoDetails.checkedEpisodes) },
      { label: "first prices", value: String(autoDetails.backfillCards) },
      { label: "history", value: String(autoDetails.nativeHistoryItems) },
      { label: "updated cards", value: String(autoDetails.updatedCards) },
      { label: "new snapshots", value: String(autoDetails.newPrices), tone: "success" },
      { label: "refreshed", value: String(autoDetails.refreshedPrices) },
      {
        label: "remaining after batch",
        value: String(autoDetails.remainingDueCards),
        tone: autoDetails.remainingDueCards > 0 ? "warning" : "default",
      },
    ];

    if (autoDetails.requestsRemaining != null) {
      metrics.push({
        label: "requests left",
        value: String(autoDetails.requestsRemaining),
        tone: "warning",
      });
    }

    if (autoDetails.quotaExceeded) {
      return {
        metrics: metrics.slice(0, 8),
        detail: "Paused at scraper quota.",
      };
    }

    return {
      metrics: metrics.slice(0, 8),
      detail: compactMessage(entry.message, 320),
    };
  }

  const cardHistoryDetails = getCardHistoryDetails(entry);
  if (cardHistoryDetails) {
    const metrics: ActivityMetric[] = [
      { label: "eligible", value: String(cardHistoryDetails.candidateCards) },
      { label: "selected", value: String(cardHistoryDetails.selectedCards) },
      { label: "processed", value: String(cardHistoryDetails.processedCards) },
      { label: "cards synced", value: String(cardHistoryDetails.syncedCards), tone: "success" },
      { label: "unavailable", value: String(cardHistoryDetails.failedCards), tone: "warning" },
      { label: "history snapshots", value: String(cardHistoryDetails.newHistorySnapshots) },
      {
        label: "pending",
        value: String(cardHistoryDetails.remainingCards),
        tone: cardHistoryDetails.remainingCards > 0 ? "warning" : "default",
      },
    ];

    if (cardHistoryDetails.requestsRemaining != null) {
      metrics.push({
        label: "requests left",
        value: String(cardHistoryDetails.requestsRemaining),
        tone: "warning",
      });
    }

    return {
      metrics: metrics.slice(0, 8),
      detail: cardHistoryDetails.quotaExceeded
        ? "Paused at scraper quota."
        : compactMessage(entry.message, 320),
    };
  }

  const episodeDetails = getEpisodeSyncDetails(entry);
  if (episodeDetails) {
    const metrics: ActivityMetric[] = [
      { label: "cards synced", value: String(episodeDetails.count) },
      { label: "new cards", value: String(episodeDetails.newCards), tone: "success" },
      { label: "updated cards", value: String(episodeDetails.updatedCards) },
      { label: "new snapshots", value: String(episodeDetails.newPrices), tone: "success" },
      { label: "refreshed", value: String(episodeDetails.refreshedPrices) },
      { label: "graded", value: String(episodeDetails.gradedPricesUpdated) },
    ];

    if (episodeDetails.requestsRemaining != null) {
      metrics.push({
        label: "requests left",
        value: String(episodeDetails.requestsRemaining),
        tone: "warning",
      });
    }

    return {
      metrics: metrics.slice(0, 8),
      detail: episodeDetails.quotaExceeded
        ? "Paused at scraper quota."
        : compactMessage(entry.message, 320),
    };
  }

  const fullDetails = getFullSyncDetails(entry);
  if (fullDetails) {
    const metrics: ActivityMetric[] = [
      { label: "sets checked", value: String(fullDetails.count) },
      { label: "sets synced", value: String(fullDetails.syncedEpisodes) },
      { label: "skipped", value: String(fullDetails.skippedEpisodes) },
      { label: "new sets", value: String(fullDetails.newEpisodes), tone: "success" },
      { label: "new cards", value: String(fullDetails.newCards), tone: "success" },
      { label: "updated cards", value: String(fullDetails.updatedCards) },
      { label: "new snapshots", value: String(fullDetails.newPrices), tone: "success" },
      { label: "refreshed", value: String(fullDetails.refreshedPrices) },
    ];

    if (fullDetails.requestsRemaining != null) {
      metrics.push({
        label: "requests left",
        value: String(fullDetails.requestsRemaining),
        tone: "warning",
      });
    }

    return {
      metrics: metrics.slice(0, 8),
      detail: fullDetails.quotaExceeded
        ? "Paused at scraper quota."
        : fullDetails.currentEpisode
          ? `Current set: ${fullDetails.currentEpisode.name}.`
          : compactMessage(entry.message, 320),
    };
  }

  const sealedDetails = getSealedSyncDetails(entry);
  if (sealedDetails) {
    const metrics: ActivityMetric[] = [
      { label: "sets synced", value: String(sealedDetails.synced) },
      { label: "sealed updated", value: String(sealedDetails.products), tone: "success" },
    ];

    if (sealedDetails.requestsRemaining != null) {
      metrics.push({
        label: "requests left",
        value: String(sealedDetails.requestsRemaining),
        tone: "warning",
      });
    }

    return {
      metrics: metrics.slice(0, 8),
      detail: sealedDetails.quotaExceeded
        ? "Paused at scraper quota."
        : sealedDetails.currentEpisode
          ? `Current set: ${sealedDetails.currentEpisode.name}.`
          : compactMessage(entry.message, 320),
    };
  }

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

    match = part.match(/^Selected (\d+) cards$/i);
    if (match) {
      metrics.push({ label: "selected", value: match[1] });
      continue;
    }

    match = part.match(/^(\d+) processed$/i);
    if (match) {
      metrics.push({ label: "processed", value: match[1] });
      continue;
    }

    match = part.match(/^Synced (\d+) cards$/i);
    if (match) {
      metrics.push({ label: "cards synced", value: match[1] });
      continue;
    }

    match = part.match(/^(\d+) cards synced$/i);
    if (match) {
      metrics.push({ label: "cards synced", value: match[1] });
      continue;
    }

    match = part.match(/^(\d+) unavailable$/i);
    if (match) {
      metrics.push({ label: "unavailable", value: match[1], tone: "warning" });
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

    match = part.match(/^(?:([\d]+) still due|([\d]+) remaining after this batch)$/i);
    if (match) {
      metrics.push({
        label: "remaining after batch",
        value: match[1] ?? match[2],
        tone: "warning",
      });
      continue;
    }

    match = part.match(/^(\d+) scraper requests remaining$/i);
    if (match) {
      metrics.push({ label: "requests left", value: match[1], tone: "warning" });
      continue;
    }

    match = part.match(/^(\d+) request concurrency$/i);
    if (match) {
      metrics.push({ label: "concurrency", value: match[1] });
      continue;
    }

    if (/^Paused because scraper requests are exhausted/i.test(part)) {
      details.push("Paused at scraper quota.");
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

    match = part.match(/^(?:due backlog|eligible queue|eligible queue preview) (\d+)$/i);
    if (match) {
      metrics.push({ label: "eligible queue", value: match[1], tone: "warning" });
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

export function groupSyncEntries(entries: SyncStatusEntry[]): GroupedSyncStatusEntry[] {
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

export function describeGroupedWindow(entry: GroupedSyncStatusEntry): string {
  if (entry.entries.length <= 1) {
    return formatDateTime(entry.started_at);
  }

  return `${entry.entries.length} runs from ${formatDateTime(entry.oldest_started_at)} to ${formatDateTime(entry.started_at)}`;
}
