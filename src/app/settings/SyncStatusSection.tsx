import type { AutoRefreshStatus, SyncStatusSectionProps } from "./sync-status-utils";
import { visualStatus } from "./sync-status-utils";
import SyncStatusAutoRefresh from "./SyncStatusAutoRefresh";
import SyncCancelButton from "./SyncCancelButton";
import { CompactActivityList, CompactFailureList, StatusPill } from "./SyncStatusCards";
import SyncStatusTabs from "./SyncStatusTabs";

function getPendingWork(status: AutoRefreshStatus | null): number {
  if (!status) return 0;
  return status.dueCards + status.missingPriceCards;
}

function getPanelStatus({
  activeSync,
  allStatus,
  recentFailures,
}: Pick<SyncStatusSectionProps, "activeSync" | "recentFailures"> & {
  allStatus: AutoRefreshStatus | null;
}): string {
  if (activeSync) return visualStatus(activeSync);
  if (recentFailures.length > 0) return "failed";
  if (allStatus?.scraperDisabled) return "paused";
  if (allStatus?.quotaPaused) return "quota-paused";
  if (getPendingWork(allStatus) > 0 || (allStatus?.nextBatchCards ?? 0) > 0) return "waiting";
  return "success";
}

function getPanelSummary({
  activeSync,
  allStatus,
  recentFailures,
}: Pick<SyncStatusSectionProps, "activeSync" | "recentFailures"> & {
  allStatus: AutoRefreshStatus | null;
}): string {
  if (activeSync?.cancel_requested_at) {
    return `${activeSync.label} is stopping after the current checkpoint.`;
  }

  if (activeSync) {
    return `${activeSync.label} is running now.`;
  }

  if (recentFailures.length > 0) {
    return `${recentFailures.length} unresolved issue${
      recentFailures.length === 1 ? "" : "s"
    } need attention.`;
  }

  if (allStatus?.scraperDisabled) {
    return "Scraper requests are disabled, so background refresh is paused.";
  }

  if (allStatus?.quotaPaused) {
    return allStatus.quotaResetLabel
      ? `Background refresh is waiting for quota reset at ${allStatus.quotaResetLabel}.`
      : "Background refresh is waiting for scraper quota.";
  }

  const pendingWork = getPendingWork(allStatus);
  if (pendingWork > 0 || (allStatus?.nextBatchCards ?? 0) > 0) {
    return `${pendingWork.toLocaleString("en-US")} cards are ready for background refresh.`;
  }

  return "No sync is running and the background queue is quiet.";
}

export default function SyncStatusSection({
  activeSync,
  autoRefreshStatuses,
  recentSyncs,
  recentFailures,
}: SyncStatusSectionProps) {
  const allStatus =
    autoRefreshStatuses.find((status) => status.key === "all") ?? autoRefreshStatuses[0] ?? null;
  const panelStatus = getPanelStatus({ activeSync, allStatus, recentFailures });
  const panelSummary = getPanelSummary({ activeSync, allStatus, recentFailures });

  return (
    <div className="settings-panel glass rounded-2xl p-5 shadow-md shadow-black/5 sm:p-6">
      <SyncStatusAutoRefresh enabled={Boolean(activeSync)} />

      <div className="flex flex-col gap-4 border-b border-black/6 pb-4 dark:border-white/6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              Sync Control Center
            </h2>
            <StatusPill status={panelStatus} />
          </div>
          <p className="mt-1 text-sm text-gray-400">{panelSummary}</p>
        </div>

        {activeSync && (
          <div className="flex shrink-0 flex-col gap-2 lg:items-end">
            <SyncCancelButton
              syncId={activeSync.id}
              syncLabel={activeSync.label}
              cancellationRequested={Boolean(activeSync.cancel_requested_at)}
              pauseAutoRefreshOnCancel={activeSync.type === "auto-prices"}
            />
            <p className="max-w-72 text-xs text-gray-400 lg:text-right">
              Stop lets the current in-flight work exit cleanly at the next checkpoint.
            </p>
          </div>
        )}
      </div>

      <SyncStatusTabs statuses={autoRefreshStatuses} />
      <CompactFailureList entries={recentFailures} />
      <CompactActivityList entries={recentSyncs} />
    </div>
  );
}
