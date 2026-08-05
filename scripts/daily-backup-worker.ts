import { db } from "@/lib/db";
import { createDailyBackup, getLatestDailyBackupAt } from "@/lib/backups";

const MIN_BACKUP_AGE_MS = 20 * 60 * 60_000;

try {
  const now = new Date();
  const latest = await getLatestDailyBackupAt();
  if (latest && now.getTime() - new Date(latest).getTime() < MIN_BACKUP_AGE_MS) {
    console.log(JSON.stringify({ ok: true, skipped: "fresh", latest }));
  } else {
    const backup = await createDailyBackup();
    console.log(JSON.stringify({ ok: true, backup }));
  }
} catch (error) {
  console.error(
    "[daily-backup-worker]",
    error instanceof Error ? error.message : String(error)
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
