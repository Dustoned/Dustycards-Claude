import type { SyncStatusSectionProps } from "./sync-status-utils";
import SyncStatusAutoRefresh from "./SyncStatusAutoRefresh";
import SyncCancelButton from "./SyncCancelButton";
import {
  ActivityList,
  AutoRefreshCard,
  FailureList,
  OverviewTile,
  SummaryTile,
} from "./SyncStatusCards";

export default function SyncStatusSection({
  activeSync,
  lastSuccessfulSync,
  lastFailedSync,
  overview,
  autoRefreshStatus,
  onePieceAutoRefreshStatus,
  recentSyncs,
  recentFailures,
}: SyncStatusSectionProps) {
  return (
    <div className="settings-panel glass rounded-2xl p-6 shadow-md shadow-black/5">
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
                  : activeSync.type === "auto-prices"
                    ? "Use stop if you want the current batch to finish cleanly and pause background price refresh for a bit."
                    : "Use stop if you want the current job to finish its in-flight batch and then exit cleanly."}
              </p>
            </div>
            <SyncCancelButton
              syncId={activeSync.id}
              syncLabel={activeSync.label}
              cancellationRequested={Boolean(activeSync.cancel_requested_at)}
              pauseAutoRefreshOnCancel={activeSync.type === "auto-prices"}
            />
          </div>
        </div>
      )}

      <div className="mt-5 border-t border-black/6 pt-5 dark:border-white/6">
        <div className="grid gap-3 lg:grid-cols-2">
          <AutoRefreshCard {...autoRefreshStatus} />
          {onePieceAutoRefreshStatus && <AutoRefreshCard {...onePieceAutoRefreshStatus} />}
        </div>
      </div>

      <FailureList entries={recentFailures} />
      <ActivityList entries={recentSyncs} />
    </div>
  );
}
