"use client";

import { useId, useMemo, useState } from "react";
import { MetricCell, StatusPill } from "./SyncStatusCards";
import type { AutoRefreshStatus } from "./sync-status-utils";
import {
  compactMessage,
  getAutoRefreshDisplayMetrics,
  parseAutoRefreshProgress,
  visualStatus,
} from "./sync-status-utils";

const ACTIVE_SEGMENT_CLASS =
  "border border-[var(--dc-primary)] bg-[var(--dc-primary)] text-[var(--dc-on-primary)]";

type AutoRefreshStatusKey = AutoRefreshStatus["key"];

function formatCount(value: number | null | undefined): string {
  if (value == null) return "--";
  return value.toLocaleString("en-US");
}

function getRefreshStatus(status: AutoRefreshStatus): string {
  if (status.active) return visualStatus(status.active);
  if (status.scraperDisabled) return "paused";
  if (status.quotaPaused) return "quota-paused";
  if (status.serverJobRunning) return "running";
  if (
    status.dueCards + status.missingPriceCards + status.submittedCardCandidates > 0 ||
    status.nextBatchCards > 0
  ) {
    return "waiting";
  }
  return "success";
}

function getRefreshStateLabel(status: AutoRefreshStatus): string {
  if (status.active?.cancel_requested_at) return "Stopping after the current checkpoint";
  if (status.active) return "Working through the selected batch now";
  if (status.scraperDisabled) return "Scraper requests are disabled";
  if (status.quotaPaused) {
    return status.quotaResetLabel
      ? `Waiting for scraper quota reset at ${status.quotaResetLabel}`
      : "Waiting for scraper quota reset";
  }
  if (
    status.dueCards + status.missingPriceCards + status.submittedCardCandidates > 0 ||
    status.nextBatchCards > 0
  ) {
    return status.serverJobRunning
      ? "Due work is waiting while the server job checks for a run"
      : "Due work is waiting for the next run";
  }
  return "No due cards in this view right now";
}

function getTone(value: number, warningAt = 1): "default" | "warning" {
  return value >= warningAt ? "warning" : "default";
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  const displayValue = value?.trim();
  if (!displayValue) return null;

  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p
        className="mt-1 truncate text-sm text-gray-600 dark:text-gray-300"
        title={displayValue}
      >
        {displayValue}
      </p>
    </div>
  );
}

export default function SyncStatusTabs({
  statuses,
}: {
  statuses: AutoRefreshStatus[];
}) {
  const [selectedKey, setSelectedKey] = useState<AutoRefreshStatusKey>("all");
  const tabsId = useId();
  const selected = statuses.find((status) => status.key === selectedKey) ?? statuses[0] ?? null;

  const progress = useMemo(
    () => parseAutoRefreshProgress(selected?.active?.message ?? null, selected?.active?.details),
    [selected]
  );

  if (!selected) {
    return (
      <p className="mt-4 rounded-lg border border-black/6 px-3 py-2 text-sm text-gray-400 dark:border-white/8">
        No background refresh status is available yet.
      </p>
    );
  }

  const metrics = getAutoRefreshDisplayMetrics(selected, progress);
  const latestPriceLabel = selected.latestPriceLabel ?? "--";
  const quotaHint = selected.quotaPaused
    ? selected.quotaResetLabel
      ? `resets ${selected.quotaResetLabel}`
      : "quota paused"
    : `${selected.requestConcurrency} parallel slots`;
  const activeSummary = compactMessage(selected.active?.message ?? null, 220);
  const previewSummary =
    selected.nextBatchCards > 0
      ? `${selected.nextBatchCards.toLocaleString("en-US")} cards across ${selected.nextBatchEpisodes.toLocaleString("en-US")} sets are candidates for a future run; this is a planning preview only.`
      : null;
  const setSummary = selected.nextBatchSetLabels.join(", ");
  const cardSummary = selected.nextBatchCardLabels.join(", ");
  const refreshStatus = getRefreshStatus(selected);
  const hasWorkSignal =
    Boolean(selected.active) ||
    selected.scraperDisabled ||
    selected.quotaPaused ||
    metrics.queueCount > 0 ||
    selected.nextBatchCards > 0;
  const hasBatchDetails = Boolean(activeSummary || previewSummary || setSummary || cardSummary);
  const quietSummary =
    !hasWorkSignal && selected.unavailableCooldownCards > 0
      ? `${formatCount(selected.unavailableCooldownCards)} unavailable cards are skipped until prices return.`
      : null;
  const serverSummary = selected.serverJobRunning
    ? `Server job running${selected.serverJobHeartbeatLabel ? `, heartbeat ${selected.serverJobHeartbeatLabel}` : ""}`
    : selected.serverJobFinishedLabel
      ? `Last server job finished ${selected.serverJobFinishedLabel}`
      : selected.serverJobStartedLabel
        ? `Last server job started ${selected.serverJobStartedLabel}`
        : selected.serverJobStatus
          ? `Server job ${selected.serverJobStatus}`
          : null;

  return (
    <div className="mt-5">
      <div
        className="grid min-w-0 grid-cols-3 rounded-lg border border-black/6 bg-black/[0.02] p-1 dark:border-white/8 dark:bg-white/[0.03]"
        role="tablist"
        aria-label="Background refresh views"
      >
        {statuses.map((status) => {
          const isSelected = status.key === selected.key;

          return (
            <button
              key={status.key}
              type="button"
              role="tab"
              id={`${tabsId}-${status.key}`}
              aria-controls={`${tabsId}-panel`}
              aria-selected={isSelected}
              tabIndex={isSelected ? 0 : -1}
              className={`min-h-11 min-w-0 rounded-md px-1.5 text-xs font-semibold leading-snug transition sm:px-3 sm:text-sm ${
                isSelected
                  ? ACTIVE_SEGMENT_CLASS
                  : "text-[var(--dc-text-secondary)] hover:bg-[var(--dc-surface-hover)]"
              }`}
              onClick={() => setSelectedKey(status.key)}
              onKeyDown={(event) => {
                const index = statuses.findIndex((item) => item.key === status.key);
                const nextIndex = event.key === "ArrowRight" ? (index + 1) % statuses.length
                  : event.key === "ArrowLeft" ? (index - 1 + statuses.length) % statuses.length
                  : event.key === "Home" ? 0
                  : event.key === "End" ? statuses.length - 1 : null;
                if (nextIndex == null) return;
                event.preventDefault();
                const next = statuses[nextIndex];
                setSelectedKey(next.key);
                document.getElementById(`${tabsId}-${next.key}`)?.focus();
              }}
            >
              {status.label}
            </button>
          );
        })}
      </div>

      <div id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-${selected.key}`} className="mt-3 overflow-hidden rounded-lg border border-black/6 dark:border-white/8">
        <div className="grid grid-cols-2 bg-white/45 dark:bg-white/[0.03] md:grid-cols-6">
          <MetricCell
            label="Queue"
            value={formatCount(metrics.queueCount)}
            hint={`${formatCount(selected.dueCards)} due / ${formatCount(
              selected.missingPriceCards
            )} first-price / ${formatCount(selected.submittedCardCandidates)} submitted`}
            tone={getTone(metrics.queueCount)}
          />
          <MetricCell
            label="Current batch"
            value={formatCount(metrics.currentBatchCards)}
            hint={metrics.currentBatchHint}
            tone={metrics.hasRunningBatch ? "good" : "default"}
          />
          <MetricCell
            label="Remaining due"
            value={formatCount(metrics.remainingCards)}
            hint={metrics.remainingHint}
            tone={getTone(metrics.remainingCards)}
          />
          <MetricCell
            label="Next preview"
            value={formatCount(metrics.previewCards)}
            hint={metrics.previewHint}
          />
          <MetricCell
            label="Quota"
            value={formatCount(selected.requestsRemaining)}
            hint={quotaHint}
            tone={selected.quotaPaused ? "danger" : "default"}
          />
          <MetricCell label="Latest price" value={latestPriceLabel} hint="newest snapshot" />
        </div>

        <div className="border-t border-black/6 p-3 dark:border-white/8">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            {hasWorkSignal ? (
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <StatusPill status={refreshStatus} />
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {getRefreshStateLabel(selected)}
                </p>
              </div>
            ) : (
              <p className="min-w-0 truncate text-sm text-gray-400" title={quietSummary ?? selected.description ?? ""}>
                {quietSummary ?? selected.description}
              </p>
            )}
            {serverSummary && (
              <p className="text-xs text-gray-400 md:max-w-64 md:text-right" title={serverSummary}>
                {serverSummary}
              </p>
            )}
          </div>

          {hasBatchDetails && (
            <div className="mt-3 grid gap-3 border-t border-black/6 pt-3 dark:border-white/8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <DetailRow label="Current batch details" value={activeSummary} />
              <DetailRow label="Next-run preview" value={previewSummary} />
              <DetailRow label="Preview sets" value={setSummary} />
              <DetailRow label="Preview cards" value={cardSummary} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
