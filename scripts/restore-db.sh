#!/usr/bin/env bash
set -euo pipefail

backup_path="${1:-}"
app_path="${2:-/opt/dustycards/app}"

if [ -z "$backup_path" ]; then
  echo "Usage: scripts/restore-db.sh /path/to/backup.db [/opt/dustycards/app]" >&2
  exit 64
fi

if [ ! -f "$backup_path" ]; then
  echo "Backup file not found: $backup_path" >&2
  exit 66
fi

case "$app_path" in
  /opt/dustycards/*) ;;
  *)
    echo "Refusing to restore outside /opt/dustycards: $app_path" >&2
    exit 73
    ;;
esac

live_db="$app_path/dustycards.db"
tmp_db="$live_db.restore-tmp"
rollback_db="$live_db.before-restore-$(date -u +%Y%m%d-%H%M%S)"

cd "$app_path"

systemctl stop dustycards-sync-scheduler.timer 2>/dev/null || true
systemctl stop dustycards-sync-scheduler.service 2>/dev/null || true
systemctl stop dustycards 2>/dev/null || true

if [ -f "$live_db" ]; then
  if ! NODE_PATH="$app_path/node_modules" node - "$live_db" "$rollback_db" <<'NODE'
const Database = require("better-sqlite3");
const [, , sourcePath, targetPath] = process.argv;
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const db = new Database(sourcePath);
try {
  db.pragma("busy_timeout = 10000");
  db.exec(`VACUUM INTO ${quote(targetPath)}`);
} finally {
  db.close();
}
NODE
  then
    echo "Warning: could not create before-restore backup; continuing with requested restore." >&2
    rm -f -- "$rollback_db"
  fi
fi

rm -f -- "$live_db-wal" "$live_db-shm" "$tmp_db" "$tmp_db-wal" "$tmp_db-shm"
cp -- "$backup_path" "$tmp_db"

NODE_PATH="$app_path/node_modules" node - "$tmp_db" <<'NODE'
const Database = require("better-sqlite3");
const [, , dbPath] = process.argv;
const db = new Database(dbPath, { readonly: true });
try {
  const result = db.pragma("quick_check", { simple: true });
  if (result !== "ok") {
    throw new Error(`restore quick_check failed: ${result}`);
  }
} finally {
  db.close();
}
NODE

mv -f -- "$tmp_db" "$live_db"
rm -f -- "$live_db-wal" "$live_db-shm"
chown dustycards:dustycards "$live_db" 2>/dev/null || true

systemctl start dustycards
systemctl start dustycards-sync-scheduler.timer 2>/dev/null || true
systemctl is-active dustycards
