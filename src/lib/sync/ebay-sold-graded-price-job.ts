import { db } from "@/lib/db";
import {
  countEbaySoldGradedPriceCandidates,
  runEbaySoldGradedPriceSync,
  SyncCancelledError,
  SyncConflictError,
  type EbaySoldGradedPriceSyncResult,
} from "@/lib/sync";
import { areScraperRequestsDisabled } from "@/lib/scraper-guard";
import { encodeSyncLogDetailsJson, type EbaySoldGradedPriceLogDetails } from "@/lib/sync-log-details";
import { TCGGO_REQUEST_CONCURRENCY } from "@/lib/tcggo";

const EBAY_SOLD_GRADED_PRICE_SYNC_TYPE = "ebay-sold-graded-prices";
const EBAY_SOLD_GRADED_PRICE_JOB_CHAIN_DELAY_MS = 750;
const EBAY_SOLD_GRADED_PRICE_JOB_STALE_MS = 1000 * 60 * 10;

let activeJob: Promise<void> | null = null;

type EbaySoldGradedPriceSyncJobRecord = NonNullable<
  Awaited<ReturnType<typeof db.syncJob.findUnique>>
>;

function waitForDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toJobDetails(
  jobId: string,
  result: EbaySoldGradedPriceSyncResult,
  status: EbaySoldGradedPriceLogDetails["status"]
): EbaySoldGradedPriceLogDetails {
  return {
    version: 1,
    kind: "ebay-sold-graded-prices",
    runId: jobId,
    status,
    candidateCards: result.candidateCards,
    selectedCards: result.selectedCards,
    processedCards: result.processedCards,
    cardsWithPrices: result.cardsWithPrices,
    cardsWithoutPrices: result.cardsWithoutPrices,
    failedCards: result.failedCards,
    ebaySoldGradedPricesUpdated: result.ebaySoldGradedPricesUpdated,
    remainingCards: result.remainingCards,
    hasMore: result.hasMore,
    quotaExceeded: result.quotaExceeded ?? false,
    requestsRemaining: result.requestsRemaining ?? null,
    requestConcurrency: result.requestConcurrency ?? TCGGO_REQUEST_CONCURRENCY,
  };
}

function getResultStatus(
  result: EbaySoldGradedPriceSyncResult
): EbaySoldGradedPriceLogDetails["status"] {
  if (result.quotaExceeded) return "quota-paused";
  if (result.skipped) return "skipped";
  if (result.hasMore) return "running";
  return "success";
}

async function updateJobFromResult(jobId: string, result: EbaySoldGradedPriceSyncResult) {
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

async function runPersistedEbaySoldGradedPriceSyncJob(jobId: string) {
  await db.syncJob.update({
    where: { id: jobId },
    data: {
      status: "running",
      started_at: new Date(),
      finished_at: null,
      heartbeat_at: new Date(),
    },
  });

  let skippedAttemptedCards = 0;

  while (true) {
    const result = await runEbaySoldGradedPriceSync({
      skip: skippedAttemptedCards,
    });
    await updateJobFromResult(jobId, result);

    if (!result.quotaExceeded) {
      skippedAttemptedCards += result.cardsWithoutPrices + result.failedCards;
    }

    if (result.quotaExceeded || !result.hasMore || result.remainingCards <= 0) {
      return;
    }

    await waitForDelay(EBAY_SOLD_GRADED_PRICE_JOB_CHAIN_DELAY_MS);
  }
}

function launchJob(jobId: string) {
  if (activeJob || areScraperRequestsDisabled()) {
    return;
  }

  activeJob = runPersistedEbaySoldGradedPriceSyncJob(jobId)
    .catch(async (error: unknown) => {
      if (
        error instanceof SyncConflictError &&
        error.activeType === EBAY_SOLD_GRADED_PRICE_SYNC_TYPE
      ) {
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
            kind: "ebay-sold-graded-prices",
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

async function findActiveEbaySoldGradedPriceSyncLog() {
  return db.syncLog.findFirst({
    where: {
      type: EBAY_SOLD_GRADED_PRICE_SYNC_TYPE,
      status: "running",
    },
    orderBy: { started_at: "desc" },
    select: { started_at: true },
  });
}

function isFreshRunningJob(
  job: EbaySoldGradedPriceSyncJobRecord | null,
  now = new Date()
): boolean {
  if (job?.status !== "running" || !job.heartbeat_at) {
    return false;
  }

  return job.heartbeat_at > new Date(now.getTime() - EBAY_SOLD_GRADED_PRICE_JOB_STALE_MS);
}

function isRecoverableJob(
  job: EbaySoldGradedPriceSyncJobRecord | null,
  now = new Date()
): boolean {
  if (!job) return false;
  if (job.status === "queued") return true;
  if (job.status !== "running" || !job.heartbeat_at) return false;

  return job.heartbeat_at <= new Date(now.getTime() - EBAY_SOLD_GRADED_PRICE_JOB_STALE_MS);
}

async function resumeRecoverableEbaySoldGradedPriceJob(): Promise<void> {
  if (activeJob || areScraperRequestsDisabled()) {
    return;
  }

  const [pendingCards, activeLog, job] = await Promise.all([
    countEbaySoldGradedPriceCandidates(),
    findActiveEbaySoldGradedPriceSyncLog(),
    db.syncJob.findUnique({
      where: { type: EBAY_SOLD_GRADED_PRICE_SYNC_TYPE },
    }),
  ]);

  if (pendingCards === 0 || activeLog || !job || !isRecoverableJob(job)) {
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

export async function startEbaySoldGradedPriceSyncJob(): Promise<{
  started: boolean;
  running: boolean;
  pendingCards: number;
  startedAt: string | null;
}> {
  const pendingCards = await countEbaySoldGradedPriceCandidates();

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
    where: { type: EBAY_SOLD_GRADED_PRICE_SYNC_TYPE },
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
          type: EBAY_SOLD_GRADED_PRICE_SYNC_TYPE,
          status: "queued",
          heartbeat_at: now,
        },
      });

  launchJob(job.id);

  return {
    started: true,
    running: true,
    pendingCards,
    startedAt: now.toISOString(),
  };
}

export async function getEbaySoldGradedPriceSyncJobSnapshot(): Promise<{
  running: boolean;
  pendingCards: number;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
}> {
  await resumeRecoverableEbaySoldGradedPriceJob();

  const [pendingCards, activeLog, job] = await Promise.all([
    countEbaySoldGradedPriceCandidates(),
    findActiveEbaySoldGradedPriceSyncLog(),
    db.syncJob.findUnique({
      where: { type: EBAY_SOLD_GRADED_PRICE_SYNC_TYPE },
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
