import { db } from "@/lib/db";
import {
  countManualCardHistoryCandidates,
  runCardHistorySync,
  SyncCancelledError,
  SyncConflictError,
  type CardHistorySyncResult,
} from "@/lib/sync";
import { areScraperRequestsDisabled } from "@/lib/scraper-guard";
import { encodeSyncLogDetailsJson, type CardHistoryLogDetails } from "@/lib/sync-log-details";
import { TCGGO_REQUEST_CONCURRENCY } from "@/lib/tcggo";

const CARD_HISTORY_SYNC_TYPE = "card-history";
const CARD_HISTORY_JOB_CHAIN_DELAY_MS = 750;
const CARD_HISTORY_JOB_STALE_MS = 1000 * 60 * 10;

let activeJob: Promise<void> | null = null;

type CardHistorySyncJobRecord = NonNullable<
  Awaited<ReturnType<typeof db.syncJob.findUnique>>
>;

function waitForDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toJobDetails(
  jobId: string,
  result: CardHistorySyncResult,
  status: CardHistoryLogDetails["status"]
): CardHistoryLogDetails {
  return {
    version: 1,
    kind: "card-history",
    runId: jobId,
    status,
    candidateCards: result.candidateCards,
    selectedCards: result.selectedCards,
    processedCards: result.processedCards,
    syncedCards: result.syncedCards,
    failedCards: result.failedCards,
    newHistorySnapshots: result.newHistorySnapshots,
    remainingCards: result.remainingCards,
    hasMore: result.hasMore,
    quotaExceeded: result.quotaExceeded ?? false,
    requestsRemaining: result.requestsRemaining ?? null,
    requestConcurrency: result.requestConcurrency ?? TCGGO_REQUEST_CONCURRENCY,
  };
}

function getResultStatus(result: CardHistorySyncResult): CardHistoryLogDetails["status"] {
  if (result.quotaExceeded) return "quota-paused";
  if (result.skipped) return "skipped";
  if (result.hasMore) return "running";
  return "success";
}

async function updateJobFromResult(jobId: string, result: CardHistorySyncResult) {
  const status = getResultStatus(result);
  const now = new Date();

  await db.syncJob.update({
    where: { id: jobId },
    data: {
      status,
      details_json: encodeSyncLogDetailsJson(toJobDetails(jobId, result, status)),
      heartbeat_at: now,
      ...(status === "running" ? { finished_at: null } : { finished_at: now }),
    },
  });
}

async function runPersistedCardHistorySyncJob(jobId: string, stopAtQuotaReset?: Date | null) {
  await db.syncJob.update({
    where: { id: jobId },
    data: {
      status: "running",
      started_at: new Date(),
      finished_at: null,
      heartbeat_at: new Date(),
    },
  });

  while (true) {
    // The automatic drain runs in the wind-down before the daily quota reset
    // and must never roll over into the fresh budget: once the reset moment
    // passes, stop between batches. Manual runs pass no boundary.
    if (stopAtQuotaReset && new Date() >= stopAtQuotaReset) {
      await db.syncJob.update({
        where: { id: jobId },
        data: {
          status: "success",
          finished_at: new Date(),
          heartbeat_at: new Date(),
        },
      });
      return;
    }

    const result = await runCardHistorySync();
    await updateJobFromResult(jobId, result);

    if (result.quotaExceeded || !result.hasMore || result.remainingCards <= 0) {
      return;
    }

    await waitForDelay(CARD_HISTORY_JOB_CHAIN_DELAY_MS);
  }
}

function launchJob(jobId: string, stopAtQuotaReset?: Date | null) {
  if (activeJob || areScraperRequestsDisabled()) {
    return;
  }

  activeJob = runPersistedCardHistorySyncJob(jobId, stopAtQuotaReset)
    .catch(async (error: unknown) => {
      if (error instanceof SyncConflictError && error.activeType === CARD_HISTORY_SYNC_TYPE) {
        return;
      }

      const status = error instanceof SyncCancelledError ? "cancelled" : "failed";
      const message = error instanceof Error ? error.message : String(error);
      await db.syncJob.update({
        where: { id: jobId },
        data: {
          status,
          details_json: JSON.stringify({
            version: 1,
            kind: "card-history",
            runId: jobId,
            status,
            error: message,
          }),
          finished_at: new Date(),
          heartbeat_at: new Date(),
        },
      });
    })
    .finally(() => {
      activeJob = null;
    });
}

async function findActiveCardHistorySyncLog() {
  return db.syncLog.findFirst({
    where: {
      type: CARD_HISTORY_SYNC_TYPE,
      status: "running",
    },
    orderBy: { started_at: "desc" },
    select: { started_at: true },
  });
}

function isFreshRunningJob(job: CardHistorySyncJobRecord | null, now = new Date()): boolean {
  if (job?.status !== "running" || !job.heartbeat_at) {
    return false;
  }

  return job.heartbeat_at > new Date(now.getTime() - CARD_HISTORY_JOB_STALE_MS);
}

export async function startCardHistorySyncJob(options?: {
  // Automatic drains pass the upcoming quota-reset moment; the job stops
  // between batches once it passes so it never eats into the fresh budget.
  stopAtQuotaReset?: Date | null;
}): Promise<{
  started: boolean;
  running: boolean;
  pendingCards: number;
  startedAt: string | null;
}> {
  const pendingCards = await countManualCardHistoryCandidates();

  if (pendingCards === 0) {
    return {
      started: false,
      running: false,
      pendingCards: 0,
      startedAt: null,
    };
  }

  const now = new Date();
  const existing = await db.syncJob.findUnique({
    where: { type: CARD_HISTORY_SYNC_TYPE },
  });

  if (activeJob || isFreshRunningJob(existing, now)) {
    return {
      started: false,
      running: true,
      pendingCards,
      startedAt: existing?.started_at?.toISOString() ?? null,
    };
  }

  const job = existing
    ? await db.syncJob.update({
        where: { id: existing.id },
        data: {
          status: "queued",
          finished_at: null,
          heartbeat_at: now,
        },
      })
    : await db.syncJob.create({
        data: {
          type: CARD_HISTORY_SYNC_TYPE,
          status: "queued",
          heartbeat_at: now,
        },
      });

  launchJob(job.id, options?.stopAtQuotaReset);

  return {
    started: true,
    running: true,
    pendingCards,
    startedAt: now.toISOString(),
  };
}

export async function getCardHistorySyncJobSnapshot(options?: {
  countPendingCards?: boolean;
}): Promise<{
  running: boolean;
  pendingCards: number;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
}> {
  const [pendingCards, activeLog, job] = await Promise.all([
    options?.countPendingCards === false
      ? Promise.resolve(0)
      : countManualCardHistoryCandidates(),
    findActiveCardHistorySyncLog(),
    db.syncJob.findUnique({
      where: { type: CARD_HISTORY_SYNC_TYPE },
    }),
  ]);

  const jobRunning = job?.status === "queued" || isFreshRunningJob(job);
  const running = Boolean(activeJob || activeLog || jobRunning);
  let error: string | null = null;

  if (job?.status === "failed" && job.details_json) {
    try {
      const parsed: unknown = JSON.parse(job.details_json);
      if (typeof parsed === "object" && parsed && "error" in parsed) {
        error = String((parsed as { error?: unknown }).error ?? "");
      }
    } catch {
      error = null;
    }
  }

  return {
    running,
    pendingCards,
    startedAt: activeLog?.started_at.toISOString() ?? job?.started_at?.toISOString() ?? null,
    finishedAt: job?.finished_at?.toISOString() ?? null,
    error,
  };
}
