import "server-only";
import { db } from "@/lib/db";

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

  try {
    const logs = await db.syncLog.updateMany({
      where: { status: "running" },
      data: { status: "failed", finished_at: now },
    });

    // Re-queue (rather than fail) running jobs so the scheduler resumes them
    // immediately instead of waiting out the 10-minute stale-heartbeat window.
    const jobs = await db.syncJob.updateMany({
      where: { status: "running" },
      data: { status: "queued", finished_at: null, heartbeat_at: now },
    });

    if (logs.count > 0 || jobs.count > 0) {
      console.info(
        `[boot-reconcile] cleared ${logs.count} orphaned running sync log(s), re-queued ${jobs.count} job(s)`
      );
    }
  } catch (error) {
    console.warn(
      "[boot-reconcile] could not reconcile orphaned syncs:",
      error instanceof Error ? error.message : String(error)
    );
  }
}
