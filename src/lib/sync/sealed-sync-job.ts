import "server-only";

import { db } from "@/lib/db";
import { runSealedSync } from "@/lib/sync";

// Sealed product prices (and their snapshots, which feed sealed sudden drops,
// the value drivers and set-lifecycle observations) previously only refreshed
// when someone pressed the manual "Sync Sealed Products" button. This job
// keeps them fresh automatically, once per interval.
const SEALED_SYNC_LOG_TYPE = "sealed";
const SEALED_SYNC_INTERVAL_MS = 24 * 60 * 60_000;
// A full sealed sync walks every visible expansion; treat an unfinished run
// older than this as crashed instead of blocking the next attempt forever.
const SEALED_SYNC_STALE_RUNNING_MS = 3 * 60 * 60_000;
// After a failed or quota-cut attempt, wait before retrying so an exhausted
// API day cannot turn into a retry loop on every scheduler tick.
const SEALED_SYNC_RETRY_BACKOFF_MS = 2 * 60 * 60_000;

export interface SealedSyncJobSnapshot {
  started: boolean;
  running: boolean;
  due: boolean;
  lastFinishedAt: string | null;
  skippedReason: string | null;
}

export async function maybeStartSealedSyncJob(options: {
  skip: boolean;
  now?: Date;
}): Promise<SealedSyncJobSnapshot> {
  const now = options.now ?? new Date();
  const [runningLog, lastSuccessLog, lastAttemptLog] = await Promise.all([
    db.syncLog.findFirst({
      where: { type: SEALED_SYNC_LOG_TYPE, status: "running" },
      orderBy: { started_at: "desc" },
      select: { started_at: true },
    }),
    db.syncLog.findFirst({
      where: { type: SEALED_SYNC_LOG_TYPE, status: "success" },
      orderBy: { finished_at: "desc" },
      select: { finished_at: true },
    }),
    db.syncLog.findFirst({
      where: { type: SEALED_SYNC_LOG_TYPE },
      orderBy: { started_at: "desc" },
      select: { started_at: true },
    }),
  ]);

  const running = Boolean(
    runningLog &&
      now.getTime() - new Date(runningLog.started_at).getTime() < SEALED_SYNC_STALE_RUNNING_MS
  );
  const lastFinishedAt = lastSuccessLog?.finished_at
    ? new Date(lastSuccessLog.finished_at)
    : null;
  const due =
    !lastFinishedAt || now.getTime() - lastFinishedAt.getTime() >= SEALED_SYNC_INTERVAL_MS;
  const base: SealedSyncJobSnapshot = {
    started: false,
    running,
    due,
    lastFinishedAt: lastFinishedAt?.toISOString() ?? null,
    skippedReason: null,
  };

  if (options.skip) return { ...base, skippedReason: "scraper-disabled" };
  if (running) return { ...base, skippedReason: "already-running" };
  if (!due) return { ...base, skippedReason: "not-due" };

  const lastAttemptAt = lastAttemptLog?.started_at ? new Date(lastAttemptLog.started_at) : null;
  if (
    lastAttemptAt &&
    now.getTime() - lastAttemptAt.getTime() < SEALED_SYNC_RETRY_BACKOFF_MS &&
    (!lastFinishedAt || lastAttemptAt.getTime() > lastFinishedAt.getTime())
  ) {
    return { ...base, skippedReason: "retry-backoff" };
  }

  void runSealedSync().catch((error: unknown) => {
    console.error(
      "[sealed-sync-job] scheduled sealed sync failed:",
      error instanceof Error ? error.message : String(error)
    );
  });

  return { ...base, started: true, running: true };
}
