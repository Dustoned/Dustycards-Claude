import "server-only";
import { db } from "@/lib/db";

const BOOT_RECONCILE_RETRY_DELAYS_MS = [250, 1000, 2500] as const;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function reconcileOrphanedSyncsOnce(now: Date): Promise<{ logs: number; jobs: number }> {
  const logs = await db.syncLog.updateMany({
    where: { status: "running" },
    data: { status: "failed", finished_at: now },
  });

  const jobs = await db.syncJob.updateMany({
    where: { status: "running" },
    data: { status: "queued", finished_at: null, heartbeat_at: now },
  });

  return { logs: logs.count, jobs: jobs.count };
}

// On a freshly started process, no sync can actually be in flight — the worker
// lives in memory and is gone after a restart/crash/deploy. Any SyncLog or
// SyncJob still marked "running" is therefore an orphan from a previous process.
//
// This matters because the sync-conflict check (acquireSyncLog) refuses to start
// any new sync while a "running" SyncLog exists, and only reconciles such a log
// after the 2-hour ACTIVE_SYNC_STALE_MS window. So a deploy/restart that lands
// mid-batch would wedge the background price refresh for up to two hours
// (conflict loop: re-queued every tick, never allowed to run). Clearing the
// orphans on boot makes restarts self-healing.
export async function reconcileOrphanedSyncsOnBoot(): Promise<void> {
  const now = new Date();

  for (let attempt = 0; attempt <= BOOT_RECONCILE_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const result = await reconcileOrphanedSyncsOnce(now);

      if (result.logs > 0 || result.jobs > 0) {
        console.info(
          `[boot-reconcile] cleared ${result.logs} orphaned running sync log(s), re-queued ${result.jobs} job(s)`
        );
      }
      return;
    } catch (error) {
      const delayMs = BOOT_RECONCILE_RETRY_DELAYS_MS[attempt];
      const message = error instanceof Error ? error.message : String(error);
      if (delayMs == null) {
        console.warn("[boot-reconcile] could not reconcile orphaned syncs:", message);
        return;
      }

      console.warn(
        `[boot-reconcile] reconcile attempt ${attempt + 1} failed, retrying in ${delayMs}ms:`,
        message
      );
      await delay(delayMs);
    }
  }
}
