import "server-only";

import fs from "node:fs/promises";
import { db } from "@/lib/db";
import { getSqliteSidecarPaths, LIVE_DB_PATH } from "@/lib/db-paths";

const SCHEDULER_HEALTHY_WITHIN_MS = 15 * 60 * 1000;
const SYNC_SCHEDULER_JOB_TYPE = "sync-scheduler";

export interface HealthSnapshot {
  ok: boolean;
  checkedAt: string;
  db: {
    ok: boolean;
    error: string | null;
  };
  sqlite: {
    liveDbPath: string;
    walBytes: number | null;
    shmBytes: number | null;
  };
  scheduler: {
    ok: boolean;
    status: string | null;
    heartbeatAt: string | null;
    heartbeatAgeSeconds: number | null;
    error: string | null;
  };
}

async function getFileSize(path: string): Promise<number | null> {
  try {
    return (await fs.stat(path)).size;
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? error.code : null;
    if (code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function getHealthSnapshot(now = new Date()): Promise<HealthSnapshot> {
  const checkedAt = now.toISOString();
  const [walPath, shmPath] = getSqliteSidecarPaths(LIVE_DB_PATH);
  const [walBytes, shmBytes] = await Promise.all([getFileSize(walPath), getFileSize(shmPath)]);

  let dbOk = false;
  let dbError: string | null = null;
  try {
    await db.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch (error) {
    dbError = toErrorMessage(error);
  }

  let schedulerStatus: string | null = null;
  let schedulerHeartbeatAt: string | null = null;
  let schedulerHeartbeatAgeSeconds: number | null = null;
  let schedulerError: string | null = null;

  if (dbOk) {
    try {
      const schedulerJob = await db.syncJob.findUnique({
        where: { type: SYNC_SCHEDULER_JOB_TYPE },
        select: {
          status: true,
          heartbeat_at: true,
          updated_at: true,
        },
      });
      const heartbeatAt = schedulerJob?.heartbeat_at ?? schedulerJob?.updated_at ?? null;
      schedulerStatus = schedulerJob?.status ?? null;
      schedulerHeartbeatAt = heartbeatAt?.toISOString() ?? null;
      schedulerHeartbeatAgeSeconds = heartbeatAt
        ? Math.max(0, Math.round((now.getTime() - heartbeatAt.getTime()) / 1000))
        : null;
    } catch (error) {
      schedulerError = toErrorMessage(error);
    }
  }

  const schedulerOk = Boolean(
    schedulerHeartbeatAgeSeconds != null &&
      schedulerHeartbeatAgeSeconds * 1000 <= SCHEDULER_HEALTHY_WITHIN_MS
  );

  return {
    ok: dbOk && schedulerOk,
    checkedAt,
    db: {
      ok: dbOk,
      error: dbError,
    },
    sqlite: {
      liveDbPath: LIVE_DB_PATH,
      walBytes,
      shmBytes,
    },
    scheduler: {
      ok: schedulerOk,
      status: schedulerStatus,
      heartbeatAt: schedulerHeartbeatAt,
      heartbeatAgeSeconds: schedulerHeartbeatAgeSeconds,
      error: schedulerError,
    },
  };
}
