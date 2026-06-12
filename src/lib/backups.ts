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

function getBackupDirCandidates(): string[] {
  const candidates = [
    process.env.DUSTYCARDS_BACKUP_DIR,
    path.resolve(process.cwd(), "..", "dustycards-db-backups"),
    path.resolve(process.cwd(), "..", "backups"),
    path.resolve(process.cwd(), "backups"),
    "/opt/dustycards/backups",
  ].filter((entry): entry is string => Boolean(entry));

  return [...new Set(candidates)];
}

async function dirExists(dir: string): Promise<boolean> {
  try {
    return (await fs.stat(dir)).isDirectory();
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
    if (options?.create) await fs.mkdir(configured, { recursive: true });
    return (await dirExists(configured)) ? configured : null;
  }

  for (const candidate of getBackupDirCandidates()) {
    if (await dirExists(candidate)) return candidate;
  }

  if (options?.create) {
    const fallback = path.resolve(process.cwd(), "..", "backups");
    await fs.mkdir(fallback, { recursive: true });
    return fallback;
  }

  return null;
}

export async function listBackups(): Promise<{ dir: string | null; backups: BackupFileInfo[] }> {
  const dir = await resolveBackupDir();
  if (!dir) return { dir: null, backups: [] };

  const entries = await fs.readdir(dir, { withFileTypes: true });
  const backups = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".db"))
      .map(async (entry) => {
        const stat = await fs.stat(path.join(dir, entry.name));
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

function buildManualBackupName(now: Date): string {
  const stamp = now
    .toISOString()
    .slice(0, 19)
    .replace("T", "-")
    .replaceAll(":", "");
  return `${MANUAL_BACKUP_PREFIX}${stamp}.db`;
}

async function pruneManualBackups(dir: string): Promise<number> {
  const { backups } = await listBackups();
  const manualBackups = backups.filter((backup) => backup.manual);
  const stale = manualBackups.slice(MANUAL_BACKUPS_TO_KEEP);

  await Promise.all(stale.map((backup) => fs.rm(path.join(dir, backup.name), { force: true })));
  return stale.length;
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
  const target = path.join(dir, name);
  // VACUUM INTO refuses to overwrite; the timestamped name makes collisions
  // practically impossible, but clear a leftover partial file just in case.
  await fs.rm(target, { force: true });

  const escapedTarget = target.replaceAll("'", "''");
  await db.$executeRawUnsafe(`VACUUM INTO '${escapedTarget}'`);

  const stat = await fs.stat(target);
  await pruneManualBackups(dir);

  return {
    name,
    sizeBytes: stat.size,
    updatedAt: stat.mtime.toISOString(),
    manual: true,
  };
}
