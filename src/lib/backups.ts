import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";

export interface BackupFileInfo {
  name: string;
  sizeBytes: number;
  updatedAt: string;
  manual: boolean;
}

const MANUAL_BACKUP_PREFIX = "dustycards-manual-";
const MANUAL_BACKUPS_TO_KEEP = 5;
const DAILY_BACKUP_PREFIX = "dustycards-daily-";
// The production VPS has a 38 GB disk while one compacted database backup is
// already more than 3 GB. Keep one current nightly restore point locally; the
// separately configured off-site directory retains the longer seven-day run.
const LOCAL_DAILY_BACKUPS_TO_KEEP = 1;
const OFFSITE_DAILY_BACKUPS_TO_KEEP = 7;
// Pre-deploy backups are written by the deploy pipeline (~3 GB each) and were
// never pruned; keep the newest few. Named milestone backups (migrations,
// repairs) are left alone.
const PREDEPLOY_BACKUP_PREFIX = "dustycards-predeploy-";
const PREDEPLOY_BACKUPS_TO_KEEP = 2;

function joinRuntimeFile(dir: string, fileName: string): string {
  const normalizedDir = dir.replace(/[\\/]+$/, "");
  return `${normalizedDir}${path.sep}${fileName}`;
}

function getBackupDirCandidates(): string[] {
  const candidates = [
    process.env.DUSTYCARDS_BACKUP_DIR,
    path.resolve(/*turbopackIgnore: true*/ process.cwd(), "..", "dustycards-db-backups"),
    path.resolve(/*turbopackIgnore: true*/ process.cwd(), "..", "backups"),
    path.resolve(/*turbopackIgnore: true*/ process.cwd(), "backups"),
    "/opt/dustycards/backups",
  ].filter((entry): entry is string => Boolean(entry));

  return [...new Set(candidates)];
}

async function dirExists(dir: string): Promise<boolean> {
  try {
    return (await fs.stat(/*turbopackIgnore: true*/ dir)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * The directory backups are read from and written to: the configured
 * DUSTYCARDS_BACKUP_DIR wins, otherwise the first existing known location.
 */
export async function resolveBackupDir(options?: { create?: boolean }): Promise<string | null> {
  const configured = process.env.DUSTYCARDS_BACKUP_DIR;
  if (configured) {
    if (options?.create) await fs.mkdir(/*turbopackIgnore: true*/ configured, { recursive: true });
    return (await dirExists(configured)) ? configured : null;
  }

  for (const candidate of getBackupDirCandidates()) {
    if (await dirExists(candidate)) return candidate;
  }

  if (options?.create) {
    const fallback = path.resolve(/*turbopackIgnore: true*/ process.cwd(), "..", "backups");
    await fs.mkdir(/*turbopackIgnore: true*/ fallback, { recursive: true });
    return fallback;
  }

  return null;
}

export async function listBackups(): Promise<{ dir: string | null; backups: BackupFileInfo[] }> {
  const dir = await resolveBackupDir();
  if (!dir) return { dir: null, backups: [] };

  const entries = await fs.readdir(/*turbopackIgnore: true*/ dir, { withFileTypes: true });
  const backups = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".db"))
      .map(async (entry) => {
        const stat = await fs.stat(/*turbopackIgnore: true*/ joinRuntimeFile(dir, entry.name));
        return {
          name: entry.name,
          sizeBytes: stat.size,
          updatedAt: stat.mtime.toISOString(),
          manual: entry.name.startsWith(MANUAL_BACKUP_PREFIX),
        };
      })
  );

  backups.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { dir, backups };
}

function buildTimestampedBackupName(prefix: string, now: Date): string {
  const stamp = now
    .toISOString()
    .slice(0, 19)
    .replace("T", "-")
    .replaceAll(":", "");
  return `${prefix}${stamp}.db`;
}

function buildManualBackupName(now: Date): string {
  return buildTimestampedBackupName(MANUAL_BACKUP_PREFIX, now);
}

async function prunePrefixedBackups(dir: string, prefix: string, keep: number): Promise<number> {
  const { backups } = await listBackups();
  const matching = backups.filter((backup) => backup.name.startsWith(prefix));
  const stale = matching.slice(keep);

  await Promise.all(
    stale.map((backup) =>
      fs.rm(/*turbopackIgnore: true*/ joinRuntimeFile(dir, backup.name), { force: true })
    )
  );
  return stale.length;
}

async function pruneManualBackups(dir: string): Promise<number> {
  return prunePrefixedBackups(dir, MANUAL_BACKUP_PREFIX, MANUAL_BACKUPS_TO_KEEP);
}

async function copyDailyBackupOffServer(source: string, name: string): Promise<void> {
  const configured = process.env.DUSTYCARDS_OFFSITE_BACKUP_DIR?.trim();
  if (!configured) return;
  const primaryDir = path.resolve(/*turbopackIgnore: true*/ path.dirname(source));
  const offsiteDir = path.resolve(/*turbopackIgnore: true*/ configured);
  if (offsiteDir === primaryDir) {
    throw new Error("Offsite backup directory must differ from the primary backup directory");
  }
  await fs.mkdir(/*turbopackIgnore: true*/ offsiteDir, { recursive: true });
  const finalTarget = joinRuntimeFile(offsiteDir, name);
  const partialTarget = `${finalTarget}.partial`;
  await fs.rm(/*turbopackIgnore: true*/ partialTarget, { force: true });
  await fs.copyFile(/*turbopackIgnore: true*/ source, /*turbopackIgnore: true*/ partialTarget);
  const [sourceStat, copyStat] = await Promise.all([
    fs.stat(/*turbopackIgnore: true*/ source),
    fs.stat(/*turbopackIgnore: true*/ partialTarget),
  ]);
  if (sourceStat.size !== copyStat.size) {
    await fs.rm(/*turbopackIgnore: true*/ partialTarget, { force: true });
    throw new Error("Offsite backup verification failed: copied size differs");
  }
  await fs.rename(/*turbopackIgnore: true*/ partialTarget, /*turbopackIgnore: true*/ finalTarget);
  const entries = await fs.readdir(/*turbopackIgnore: true*/ offsiteDir, { withFileTypes: true });
  const dailyFiles = entries
    .filter((entry) => entry.isFile() && entry.name.startsWith(DAILY_BACKUP_PREFIX) && entry.name.endsWith(".db"))
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left));
  await Promise.all(
    dailyFiles.slice(OFFSITE_DAILY_BACKUPS_TO_KEEP).map((fileName) =>
      fs.rm(/*turbopackIgnore: true*/ joinRuntimeFile(offsiteDir, fileName), { force: true })
    )
  );
}

/**
 * Creates a consistent online backup of the live database via SQLite's
 * `VACUUM INTO`, then prunes old manual backups (newest 5 are kept).
 */
export async function createManualBackup(): Promise<BackupFileInfo> {
  const dir = await resolveBackupDir({ create: true });
  if (!dir) {
    throw new Error("No backup directory available");
  }

  const name = buildManualBackupName(new Date());
  const target = joinRuntimeFile(dir, name);
  // VACUUM INTO refuses to overwrite; the timestamped name makes collisions
  // practically impossible, but clear a leftover partial file just in case.
  await fs.rm(/*turbopackIgnore: true*/ target, { force: true });

  const escapedTarget = target.replaceAll("'", "''");
  await db.$executeRawUnsafe(`VACUUM INTO '${escapedTarget}'`);

  const stat = await fs.stat(/*turbopackIgnore: true*/ target);
  await pruneManualBackups(dir);

  return {
    name,
    sizeBytes: stat.size,
    updatedAt: stat.mtime.toISOString(),
    manual: true,
  };
}

/** ISO timestamp of the newest automatic daily backup, or null. */
export async function getLatestDailyBackupAt(): Promise<string | null> {
  const { backups } = await listBackups();
  return backups.find((backup) => backup.name.startsWith(DAILY_BACKUP_PREFIX))?.updatedAt ?? null;
}

/**
 * Creates the nightly automatic backup via `VACUUM INTO` and prunes the local
 * rotating sets to one nightly and two pre-deploy restore points. The off-site
 * directory keeps seven nightly copies when configured.
 */
export async function createDailyBackup(): Promise<BackupFileInfo> {
  const dir = await resolveBackupDir({ create: true });
  if (!dir) {
    throw new Error("No backup directory available");
  }

  const name = buildTimestampedBackupName(DAILY_BACKUP_PREFIX, new Date());
  const target = joinRuntimeFile(dir, name);
  await fs.rm(/*turbopackIgnore: true*/ target, { force: true });

  // Reserve room before VACUUM INTO starts. Pruning only after the copy made
  // retention useless once the disk was already full. Two verified pre-deploy
  // restore points remain available if the new nightly copy were to fail.
  await prunePrefixedBackups(
    dir,
    DAILY_BACKUP_PREFIX,
    LOCAL_DAILY_BACKUPS_TO_KEEP - 1
  );
  await prunePrefixedBackups(dir, PREDEPLOY_BACKUP_PREFIX, PREDEPLOY_BACKUPS_TO_KEEP);

  const escapedTarget = target.replaceAll("'", "''");
  await db.$executeRawUnsafe(`VACUUM INTO '${escapedTarget}'`);

  const stat = await fs.stat(/*turbopackIgnore: true*/ target);
  await prunePrefixedBackups(dir, DAILY_BACKUP_PREFIX, LOCAL_DAILY_BACKUPS_TO_KEEP);
  await prunePrefixedBackups(dir, PREDEPLOY_BACKUP_PREFIX, PREDEPLOY_BACKUPS_TO_KEEP);
  await copyDailyBackupOffServer(target, name);

  return {
    name,
    sizeBytes: stat.size,
    updatedAt: stat.mtime.toISOString(),
    manual: false,
  };
}
