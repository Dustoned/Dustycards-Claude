import { db } from "@/lib/db";
import { getLatestDailyBackupAt, getLatestOffsiteBackupAt } from "@/lib/backups";

const now = new Date();
const hourAgo = new Date(now.getTime() - 60 * 60_000);
const retentionFloor = new Date(now.getTime() - 90 * 24 * 60 * 60_000);
const offsiteConfigured = Boolean(process.env.DUSTYCARDS_OFFSITE_BACKUP_DIR?.trim());
const [backup, offsiteBackup] = await Promise.all([
  getLatestDailyBackupAt(),
  getLatestOffsiteBackupAt(),
]);
const backupAgeHours = backup ? (now.getTime() - new Date(backup).getTime()) / 3_600_000 : null;
const offsiteBackupAgeHours = offsiteBackup
  ? (now.getTime() - new Date(offsiteBackup).getTime()) / 3_600_000
  : null;

const [failedLogins, criticalEvents] = await Promise.all([
  db.securityEvent.count({
    where: { event_type: { in: ["auth.login.failed", "auth.mfa.failed"] }, created_at: { gte: hourAgo } },
  }),
  db.securityEvent.count({ where: { severity: "critical", created_at: { gte: hourAgo } } }),
]);

await db.$transaction([
  db.rateLimitBucket.deleteMany({ where: { expires_at: { lte: now } } }),
  db.securityEvent.deleteMany({ where: { created_at: { lt: retentionFloor } } }),
]);

const unhealthy = backupAgeHours == null
  || backupAgeHours > 36
  || (offsiteConfigured && (offsiteBackupAgeHours == null || offsiteBackupAgeHours > 36))
  || criticalEvents > 0;
console.log(JSON.stringify({
  ok: !unhealthy,
  checkedAt: now.toISOString(),
  backupAt: backup,
  backupAgeHours,
  offsiteConfigured,
  offsiteBackupAt: offsiteBackup,
  offsiteBackupAgeHours,
  failedLoginsLastHour: failedLogins,
  criticalEventsLastHour: criticalEvents,
  warning: failedLogins >= 20
    ? "elevated-auth-failures"
    : (!offsiteConfigured ? "offsite-backup-not-configured" : null),
}));

if (unhealthy) process.exitCode = 1;
