import "server-only";

import { createDailyBackup, getLatestDailyBackupAt } from "@/lib/backups";

// Nightly automatic database backup. Runs inside the scheduler tick: during
// the quiet UTC window, if the newest daily backup is older than ~20 hours, a
// fresh `VACUUM INTO` backup is written and the rotating sets are pruned.
// VACUUM INTO of a multi-GB database takes a minute or two of disk I/O, which
// is why this only fires at night.
const BACKUP_WINDOW_UTC_HOURS = new Set([2, 3, 4]);
const MIN_BACKUP_AGE_MS = 20 * 60 * 60 * 1000;

let running = false;
let lastError: string | null = null;
let lastFinishedAt: string | null = null;

export function getDailyBackupJobSnapshot() {
  return { running, lastFinishedAt, lastError };
}

export function maybeRunDailyBackupJob(now: Date = new Date()): void {
  if (running) return;
  if (!BACKUP_WINDOW_UTC_HOURS.has(now.getUTCHours())) return;

  running = true;
  void getLatestDailyBackupAt()
    .then((latest) => {
      if (latest && now.getTime() - new Date(latest).getTime() < MIN_BACKUP_AGE_MS) {
        return null;
      }
      return createDailyBackup();
    })
    .then(() => {
      lastError = null;
    })
    .catch((error: unknown) => {
      lastError = error instanceof Error ? error.message : String(error);
    })
    .finally(() => {
      running = false;
      lastFinishedAt = new Date().toISOString();
    });
}
