import { db } from "@/lib/db";
import { areScraperRequestsDisabled } from "@/lib/scraper-guard";
import {
  getAutoPriceRefreshSnapshot,
  runAutoPriceRefresh,
  SyncCancelledError,
  SyncConflictError,
  type AutoPriceRefreshResult,
} from "@/lib/sync";
import { maybeStartCardHistoryQuotaDrainJob } from "@/lib/sync/card-history-auto-drain";
import { createAutoPriceRefreshResultDetails } from "@/lib/sync/progress-details";
import {
  decodeSyncLogDetailsJson,
  encodeSyncLogDetailsJson,
  type AutoPriceRefreshLogDetails,
} from "@/lib/sync-log-details";

const AUTO_PRICE_REFRESH_SYNC_TYPE = "auto-prices";
const AUTO_PRICE_REFRESH_JOB_CHAIN_DELAY_MS = 5_000;
const AUTO_PRICE_REFRESH_JOB_STALE_MS = 1000 * 60 * 10;
const AUTO_PRICE_REFRESH_JOB_START_COOLDOWN_MS = 1000 * 60 * 15;
const AUTO_PRICE_REFRESH_JOB_MAX_BATCHES = 12;
const AUTO_PRICE_REFRESH_JOB_MAX_RUNTIME_MS = 1000 * 60 * 45;
const AUTO_PRICE_REFRESH_JOB_HEARTBEAT_INTERVAL_MS = 1000 * 60;
const AUTO_PRICE_REFRESH_JOB_RESUME_COOLDOWN_MS = 1000 * 60;

let activeJob: Promise<void> | null = null;
let lastResumeAttemptAt = 0;

type AutoPriceRefreshJobRecord = NonNullable<
  Awaited<ReturnType<typeof db.syncJob.findUnique>>
>;

function waitForDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRemainingMissingPriceCards(result: AutoPriceRefreshResult): number {
  return Math.max(result.missingPriceCards - result.backfillCards, 0);
}

function hasRemainingAutoPriceWork(result: AutoPriceRefreshResult): boolean {
  return result.remainingDueCards > 0 || getRemainingMissingPriceCards(result) > 0;
}

function shouldSkipCardHistoryQuotaDrain(result: AutoPriceRefreshResult): boolean {
  const pausedAfterManualStop =
    result.skipped && result.message.toLowerCase().includes("paused");

  return (
    result.quotaExceeded ||
    pausedAfterManualStop ||
    result.remainingDueCards > 0 ||
    getRemainingMissingPriceCards(result) > 0
  );
}

function getResultStatus(
  result: AutoPriceRefreshResult,
  hasMore: boolean
): AutoPriceRefreshLogDetails["status"] {
  if (result.quotaExceeded) return "quota-paused";
  if (result.skipped) return "skipped";
  if (hasMore) return "running";
  return "success";
}

async function updateJobFromResult(
  jobId: string,
  result: AutoPriceRefreshResult,
  batchCount: number
) {
  const hasMore = hasRemainingAutoPriceWork(result);
  const detailsStatus = getResultStatus(result, hasMore);
  const jobStatus =
    detailsStatus === "running" && batchCount >= AUTO_PRICE_REFRESH_JOB_MAX_BATCHES
      ? "queued"
      : detailsStatus;
  const now = new Date();

  await db.syncJob.update({
    where: { id: jobId },
    data: {
      status: jobStatus,
      details_json: encodeSyncLogDetailsJson(
        createAutoPriceRefreshResultDetails(
          jobId,
          result,
          detailsStatus
        )
      ),
      heartbeat_at: now,
      ...(jobStatus === "running" || jobStatus === "queued"
        ? { finished_at: null }
        : { finished_at: now }),
    },
  });
}

async function runPersistedAutoPriceRefreshJob(jobId: string) {
  await db.syncJob.update({
    where: { id: jobId },
    data: {
      status: "running",
      started_at: new Date(),
      finished_at: null,
      heartbeat_at: new Date(),
    },
  });

  // Keep the heartbeat fresh during slow batches so the job is not mistaken
  // for stale (and re-queued) while a batch is still making progress.
  const heartbeatTimer = setInterval(() => {
    void db.syncJob
      .update({
        where: { id: jobId },
        data: { heartbeat_at: new Date() },
      })
      .catch(() => {});
  }, AUTO_PRICE_REFRESH_JOB_HEARTBEAT_INTERVAL_MS);
  heartbeatTimer.unref?.();

  const deadline = Date.now() + AUTO_PRICE_REFRESH_JOB_MAX_RUNTIME_MS;
  let batchCount = 0;
  let lastResult: AutoPriceRefreshResult | null = null;

  try {
    while (batchCount < AUTO_PRICE_REFRESH_JOB_MAX_BATCHES) {
      const result = await runAutoPriceRefresh();
      batchCount += 1;
      lastResult = result;
      await updateJobFromResult(jobId, result, batchCount);

      if (result.quotaExceeded || result.skipped || !hasRemainingAutoPriceWork(result)) {
        break;
      }

      if (Date.now() >= deadline) {
        // Wall-clock limit reached with work remaining: park the job as
        // queued so the next scheduler tick picks it up fresh.
        await db.syncJob.update({
          where: { id: jobId },
          data: {
            status: "queued",
            finished_at: null,
            heartbeat_at: new Date(),
          },
        });
        break;
      }

      await waitForDelay(AUTO_PRICE_REFRESH_JOB_CHAIN_DELAY_MS);
    }
  } finally {
    clearInterval(heartbeatTimer);
  }

  if (lastResult) {
    await maybeStartCardHistoryQuotaDrainJob({
      skip: shouldSkipCardHistoryQuotaDrain(lastResult),
    });
  }
}

function launchJob(jobId: string) {
  if (activeJob || areScraperRequestsDisabled()) {
    return;
  }

  activeJob = runPersistedAutoPriceRefreshJob(jobId)
    .catch(async (error: unknown) => {
      if (error instanceof SyncConflictError) {
        await db.syncJob.update({
          where: { id: jobId },
          data: {
            status: "queued",
            heartbeat_at: new Date(),
          },
        });
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
            kind: "auto-price-refresh",
            batchId: jobId,
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

function isFreshRunningJob(job: AutoPriceRefreshJobRecord | null, now = new Date()): boolean {
  if (job?.status !== "running" || !job.heartbeat_at) {
    return false;
  }

  return job.heartbeat_at > new Date(now.getTime() - AUTO_PRICE_REFRESH_JOB_STALE_MS);
}

function isRecoverableJob(job: AutoPriceRefreshJobRecord | null, now = new Date()): boolean {
  if (!job) return false;
  if (job.status === "queued") return true;
  if (job.status !== "running" || !job.heartbeat_at) return false;

  return job.heartbeat_at <= new Date(now.getTime() - AUTO_PRICE_REFRESH_JOB_STALE_MS);
}

function isCoolingDown(job: AutoPriceRefreshJobRecord | null, now = new Date()): boolean {
  if (!job?.finished_at) return false;
  if (job.status === "quota-paused" || job.status === "failed") return false;

  return job.finished_at > new Date(now.getTime() - AUTO_PRICE_REFRESH_JOB_START_COOLDOWN_MS);
}

function getJobError(job: AutoPriceRefreshJobRecord | null): string | null {
  if (job?.status !== "failed" || !job.details_json) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(job.details_json);
    if (typeof parsed === "object" && parsed && "error" in parsed) {
      return String((parsed as { error?: unknown }).error ?? "");
    }
  } catch {
    return null;
  }

  return null;
}

function getJobDetails(job: AutoPriceRefreshJobRecord | null): AutoPriceRefreshLogDetails | null {
  const details = decodeSyncLogDetailsJson(job?.details_json ?? null);
  return details?.kind === "auto-price-refresh" ? details : null;
}

async function resumeRecoverableAutoPriceRefreshJob(): Promise<void> {
  if (activeJob || areScraperRequestsDisabled()) {
    return;
  }

  // This runs on every snapshot/scheduler tick; the cooldown stops a job that
  // keeps conflicting or hanging from being relaunched in a tight loop.
  const now = Date.now();
  if (now - lastResumeAttemptAt < AUTO_PRICE_REFRESH_JOB_RESUME_COOLDOWN_MS) {
    return;
  }
  lastResumeAttemptAt = now;

  const job = await db.syncJob.findUnique({
    where: { type: AUTO_PRICE_REFRESH_SYNC_TYPE },
  });

  if (!job || !isRecoverableJob(job)) {
    return;
  }

  await db.syncJob.update({
    where: { id: job.id },
    data: {
      status: "queued",
      finished_at: null,
      heartbeat_at: new Date(),
    },
  });

  launchJob(job.id);
}

export async function startAutoPriceRefreshJob(): Promise<{
  started: boolean;
  running: boolean;
  pendingCards: number;
  dueCards: number;
  missingPriceCards: number;
  submittedCardCandidates: number;
  nextBatchCards: number;
  nextBatchEpisodes: number;
  status: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}> {
  const now = new Date();
  const [existing, snapshot] = await Promise.all([
    db.syncJob.findUnique({
      where: { type: AUTO_PRICE_REFRESH_SYNC_TYPE },
    }),
    getAutoPriceRefreshSnapshot(),
  ]);
  const pendingCards =
    snapshot.dueCards + snapshot.missingPriceCards + snapshot.submittedCardCandidates;

  if (activeJob || isFreshRunningJob(existing, now)) {
    return {
      started: false,
      running: true,
      pendingCards,
      dueCards: snapshot.dueCards,
      missingPriceCards: snapshot.missingPriceCards,
      submittedCardCandidates: snapshot.submittedCardCandidates,
      nextBatchCards: snapshot.nextBatchCards,
      nextBatchEpisodes: snapshot.nextBatchEpisodes,
      status: existing?.status ?? "running",
      startedAt: existing?.started_at?.toISOString() ?? null,
      finishedAt: existing?.finished_at?.toISOString() ?? null,
    };
  }

  if (pendingCards === 0 && isCoolingDown(existing, now)) {
    return {
      started: false,
      running: false,
      pendingCards,
      dueCards: snapshot.dueCards,
      missingPriceCards: snapshot.missingPriceCards,
      submittedCardCandidates: snapshot.submittedCardCandidates,
      nextBatchCards: snapshot.nextBatchCards,
      nextBatchEpisodes: snapshot.nextBatchEpisodes,
      status: existing?.status ?? null,
      startedAt: existing?.started_at?.toISOString() ?? null,
      finishedAt: existing?.finished_at?.toISOString() ?? null,
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
          type: AUTO_PRICE_REFRESH_SYNC_TYPE,
          status: "queued",
          heartbeat_at: now,
        },
      });

  launchJob(job.id);

  return {
    started: true,
    running: true,
    pendingCards,
    dueCards: snapshot.dueCards,
    missingPriceCards: snapshot.missingPriceCards,
    submittedCardCandidates: snapshot.submittedCardCandidates,
    nextBatchCards: snapshot.nextBatchCards,
    nextBatchEpisodes: snapshot.nextBatchEpisodes,
    status: "queued",
    startedAt: now.toISOString(),
    finishedAt: null,
  };
}

export async function getAutoPriceRefreshJobSnapshot(): Promise<{
  running: boolean;
  pendingCards: number;
  dueCards: number;
  missingPriceCards: number;
  submittedCardCandidates: number;
  nextBatchCards: number;
  nextBatchEpisodes: number;
  status: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  heartbeatAt: string | null;
  error: string | null;
  details: AutoPriceRefreshLogDetails | null;
}> {
  await resumeRecoverableAutoPriceRefreshJob();

  const [snapshot, activeLog, job] = await Promise.all([
    getAutoPriceRefreshSnapshot(),
    db.syncLog.findFirst({
      where: {
        type: AUTO_PRICE_REFRESH_SYNC_TYPE,
        status: "running",
      },
      orderBy: { started_at: "desc" },
      select: { started_at: true },
    }),
    db.syncJob.findUnique({
      where: { type: AUTO_PRICE_REFRESH_SYNC_TYPE },
    }),
  ]);
  const jobRunning = job?.status === "queued" || isFreshRunningJob(job);

  return {
    running: Boolean(activeJob || activeLog || jobRunning),
    pendingCards: snapshot.dueCards + snapshot.missingPriceCards + snapshot.submittedCardCandidates,
    dueCards: snapshot.dueCards,
    missingPriceCards: snapshot.missingPriceCards,
    submittedCardCandidates: snapshot.submittedCardCandidates,
    nextBatchCards: snapshot.nextBatchCards,
    nextBatchEpisodes: snapshot.nextBatchEpisodes,
    status: job?.status ?? null,
    startedAt: activeLog?.started_at.toISOString() ?? job?.started_at?.toISOString() ?? null,
    finishedAt: job?.finished_at?.toISOString() ?? null,
    heartbeatAt: job?.heartbeat_at?.toISOString() ?? null,
    error: getJobError(job),
    details: getJobDetails(job),
  };
}
