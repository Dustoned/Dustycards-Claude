import "server-only";

import os from "node:os";
import { db } from "@/lib/db";

// A scheduler tick can take a few seconds to reach its expensive work. Keep a
// generous quiet window so a collector returning between two five-minute
// ticks cannot race a synchronous SQLite scan that already started.
const ACTIVE_USER_WINDOW_MS = 15 * 60_000;
const MAX_BACKGROUND_LOAD_PER_CPU = 0.7;

export interface BackgroundLoadSnapshot {
  activeUsers: number;
  logicalCpus: number;
  load1m: number;
  loadPerCpu: number;
  deferred: boolean;
}

/**
 * One cheap guard shared by scheduler-owned maintenance. Low-priority work
 * yields whenever a collector is actively using the app or the one-minute
 * system load is already high. Required sync jobs keep their own cadence.
 */
export async function getBackgroundLoadSnapshot(
  now: Date = new Date()
): Promise<BackgroundLoadSnapshot> {
  const activeSince = new Date(now.getTime() - ACTIVE_USER_WINDOW_MS).toISOString();
  const rows = await db.$queryRawUnsafe<Array<{ count: bigint | number }>>(
    `
    SELECT count(DISTINCT user_id) AS count
    FROM "Session"
    WHERE expires_at > ?
      AND coalesce(last_seen_at, created_at) >= ?
    `,
    now.toISOString(),
    activeSince
  );
  const activeUsers = Number(rows[0]?.count ?? 0);
  const logicalCpus = Math.max(1, os.availableParallelism?.() ?? os.cpus().length);
  const load1m = Math.max(0, os.loadavg()[0] ?? 0);
  const loadPerCpu = load1m / logicalCpus;

  return {
    activeUsers,
    logicalCpus,
    load1m,
    loadPerCpu,
    deferred: activeUsers > 0 || loadPerCpu >= MAX_BACKGROUND_LOAD_PER_CPU,
  };
}
