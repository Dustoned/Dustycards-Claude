param(
  [string]$HostName = "",
  [string]$RemoteAppPath = "/opt/dustycards/app"
)

$ErrorActionPreference = "Stop"

# Resolve the deploy target: -HostName param, DUSTYCARDS_DEPLOY_HOST env var, or .env entry.
if (-not $HostName) {
  $HostName = $env:DUSTYCARDS_DEPLOY_HOST
}
if (-not $HostName) {
  $envFile = Join-Path $PSScriptRoot "..\.env"
  if (Test-Path -LiteralPath $envFile) {
    $match = Select-String -LiteralPath $envFile -Pattern '^\s*DUSTYCARDS_DEPLOY_HOST\s*=\s*"?([^"\r\n]+)"?' | Select-Object -First 1
    if ($match) {
      $HostName = $match.Matches[0].Groups[1].Value.Trim()
    }
  }
}
if (-not $HostName) {
  throw "No deploy host configured. Pass -HostName user@host or set DUSTYCARDS_DEPLOY_HOST in .env."
}

$archive = Join-Path $env:TEMP "dustycards-deploy.tar.gz"
if (Test-Path -LiteralPath $archive) {
  Remove-Item -LiteralPath $archive -Force
}
$remoteScriptFile = Join-Path $env:TEMP "dustycards-deploy.sh"
if (Test-Path -LiteralPath $remoteScriptFile) {
  Remove-Item -LiteralPath $remoteScriptFile -Force
}

tar -czf $archive `
  --exclude=".git" `
  --exclude=".codex-screenshots" `
  --exclude=".firecrawl" `
  --exclude="node_modules" `
  --exclude=".next" `
  --exclude="data/image-cache" `
  --exclude="test-results" `
  --exclude="playwright-report" `
  --exclude="screenshots-ui" `
  --exclude=".env*" `
  --exclude="*.log" `
  --exclude="*.png" `
  --exclude="*.db" `
  --exclude="./*.db" `
  --exclude="dustycards.db" `
  --exclude="./dustycards.db" `
  --exclude="*.db-wal" `
  --exclude="./*.db-wal" `
  --exclude="dustycards.db-wal" `
  --exclude="./dustycards.db-wal" `
  --exclude="*.db-shm" `
  --exclude="./*.db-shm" `
  --exclude="dustycards.db-shm" `
  --exclude="./dustycards.db-shm" `
  --exclude="*.sqlite" `
  --exclude="*.sqlite3" `
  --exclude="*.tsbuildinfo" `
  --exclude="next-env.d.ts" `
  -C . .

scp -o BatchMode=yes -o StrictHostKeyChecking=no $archive "${HostName}:/tmp/dustycards-deploy.tar.gz"

function ConvertTo-ShellSingleQuoted {
  param([string]$Value)
  return "'" + ($Value -replace "'", "'""'""'") + "'"
}

$remoteAppPathLiteral = ConvertTo-ShellSingleQuoted $RemoteAppPath
$remoteScript = @'
set -e
RemoteAppPath=__REMOTE_APP_PATH__

mkdir -p /opt/dustycards /opt/dustycards/backups
exec 9>/opt/dustycards/deploy.lock
if ! flock -n 9; then
  echo "Another DustyCards deploy is already running; refusing to overlap." >&2
  exit 75
fi

prune_predeploy_backups() {
  backup_dir="/opt/dustycards/backups"
  tmp_all="$(mktemp)"
  tmp_keep="$(mktemp)"
  now_epoch="$(date -u +%s)"

  find "$backup_dir" -maxdepth 1 -type f -name 'dustycards-predeploy-*.db' -printf '%T@ %p\n' |
    sort -nr > "$tmp_all"

  declare -A kept_days=()
  declare -A kept_weeks=()
  recent_kept=0

  while IFS= read -r line; do
    [ -n "$line" ] || continue
    ts="${line%% *}"
    file="${line#* }"
    ts_epoch="${ts%.*}"
    age_seconds=$((now_epoch - ts_epoch))

    if [ "$age_seconds" -lt 86400 ]; then
      # Full database copies are currently about 2 GB each. Keep only the two
      # newest same-day deploy points instead of exhausting the server disk
      # during a busy release session.
      if [ "$recent_kept" -lt 2 ]; then
        printf '%s\n' "$file" >> "$tmp_keep"
        recent_kept=$((recent_kept + 1))
      fi
      continue
    fi

    if [ "$age_seconds" -lt 1209600 ]; then
      day_key="$(date -u -d "@$ts_epoch" +%Y%m%d)"
      if [ -z "${kept_days[$day_key]+x}" ]; then
        kept_days[$day_key]=1
        printf '%s\n' "$file" >> "$tmp_keep"
      fi
      continue
    fi

    if [ "$age_seconds" -lt 4838400 ]; then
      week_key="$(date -u -d "@$ts_epoch" +%G%V)"
      if [ -z "${kept_weeks[$week_key]+x}" ]; then
        kept_weeks[$week_key]=1
        printf '%s\n' "$file" >> "$tmp_keep"
      fi
    fi
  done < "$tmp_all"

  while IFS= read -r line; do
    [ -n "$line" ] || continue
    file="${line#* }"
    if grep -Fxq "$file" "$tmp_keep"; then
      continue
    fi

    case "$file" in
      "$backup_dir"/dustycards-predeploy-*.db) rm -f -- "$file" ;;
      *) echo "Refusing to remove unexpected backup path: $file" >&2; exit 1 ;;
    esac
  done < "$tmp_all"

  # Failed VACUUM INTO runs can leave multi-gigabyte temporary files behind.
  # Only remove stale files matching the exact predeploy temp naming contract.
  find "$backup_dir" -maxdepth 1 -type f \
    -name 'dustycards-predeploy-*.db.tmp*' -mmin +10 -delete

  rm -f "$tmp_all" "$tmp_keep"
}

create_predeploy_backup() {
  [ -f "$RemoteAppPath/dustycards.db" ] || return 0

  backup_file="/opt/dustycards/backups/dustycards-predeploy-$(date -u +%Y%m%d-%H%M%S).db"
  tmp_file="$backup_file.tmp"
  rm -f "$tmp_file"

  NODE_PATH="$RemoteAppPath/node_modules" node - "$RemoteAppPath/dustycards.db" "$tmp_file" <<'NODE'
const Database = require("better-sqlite3");

const [, , sourcePath, targetPath] = process.argv;
function quoteSqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

const source = new Database(sourcePath);
try {
  source.pragma("busy_timeout = 10000");
  source.exec(`VACUUM INTO ${quoteSqlString(targetPath)}`);
} finally {
  source.close();
}

const backup = new Database(targetPath, { readonly: true });
try {
  const result = backup.pragma("quick_check", { simple: true });
  if (result !== "ok") {
    throw new Error(`backup quick_check failed: ${result}`);
  }
} finally {
  backup.close();
}
NODE

  mv "$tmp_file" "$backup_file"
  prune_predeploy_backups
}

prune_predeploy_backups

cleanup_remote_junk() {
  [ -d "$RemoteAppPath" ] || return 0

  case "$RemoteAppPath" in
    /opt/dustycards/*) ;;
    *) echo "Refusing cleanup outside /opt/dustycards: $RemoteAppPath" >&2; exit 1 ;;
  esac

  # Note: data/image-cache is intentionally NOT cleaned here. It is the live
  # image cache the running app writes to continuously; removing it on deploy
  # both wastes bandwidth (forces a full re-warm) and races with the warmer
  # ("rm: Directory not empty"), which previously aborted the deploy before the
  # restart. The rm's are made non-fatal as a belt-and-suspenders.
  for path in \
    .codex-screenshots \
    .firecrawl \
    screenshots-ui \
    test-results \
    playwright-report
  do
    target="$RemoteAppPath/$path"
    if [ -e "$target" ]; then
      rm -rf -- "$target" 2>/dev/null || true
    fi
  done

  find "$RemoteAppPath" -maxdepth 1 -type f \
    \( -name 'devserver*.log' \
      -o -name 'devserver*.out.log' \
      -o -name 'devserver*.err.log' \
      -o -name '.next-dev*' \
      -o -name '*.png' \
      -o -name 'tsconfig.tsbuildinfo' \
      -o -name 'next-env.d.ts' \) \
    -delete

  if [ -d "$RemoteAppPath/.next/cache" ]; then
    rm -rf -- "$RemoteAppPath/.next/cache"
  fi
}

cleanup_remote_junk
create_predeploy_backup

release_dir="$(mktemp -d /tmp/dustycards-release.XXXXXX)"
cleanup() {
  rm -rf "$release_dir"
  rm -f /tmp/dustycards-deploy.tar.gz
  rm -f /tmp/dustycards-deploy.sh
}
trap cleanup EXIT

tar -xzf /tmp/dustycards-deploy.tar.gz -C "$release_dir"
mkdir -p "$RemoteAppPath"

# Replace only source-controlled app paths so deleted/renamed files do not linger
# on the server. Persistent runtime data (.env, dustycards.db, node_modules, .next)
# is intentionally left in place.
for path in src prisma scripts tests public docs; do
  rm -rf "$RemoteAppPath/$path"
done

tar -cf - -C "$release_dir" . | tar -xf - -C "$RemoteAppPath"

cd "$RemoteAppPath"
if [ -f .env ]; then
  node - <<'NODE'
const fs = require("fs");
const path = ".env";
const current = fs.readFileSync(path, "utf8");
const cleaned = current.replace(/\uFEFF/g, "");
if (cleaned !== current) {
  fs.writeFileSync(path, cleaned);
}
NODE
  chown dustycards:dustycards .env 2>/dev/null || true
fi

if ! grep -q '^DUSTYCARDS_SYNC_SCHEDULER_SECRET=' .env; then
  scheduler_secret="$(openssl rand -hex 32 2>/dev/null || node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')"
  printf '\nDUSTYCARDS_SYNC_SCHEDULER_SECRET=%s\n' "$scheduler_secret" >> .env
fi

npm install

# Only run `prisma migrate deploy` when there is actually an unapplied
# migration. The migrate engine opens its own connection with no busy timeout,
# so against the live WAL database it fails with "database is locked" on
# code-only deploys (which are the common case). A read-only better-sqlite3
# check never blocks in WAL mode; if it cannot determine the state it falls
# back to running migrate deploy.
PENDING_MIGRATIONS=$(NODE_PATH="$RemoteAppPath/node_modules" node -e '
  const Database = require("better-sqlite3");
  const fs = require("fs");
  let applied = new Set();
  const db = new Database(process.cwd() + "/dustycards.db", { readonly: true });
  try {
    applied = new Set(
      db.prepare("SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL")
        .all().map((r) => r.migration_name)
    );
  } finally { db.close(); }
  const dirs = fs.readdirSync("prisma/migrations", { withFileTypes: true })
    .filter((d) => d.isDirectory()).map((d) => d.name);
  console.log(dirs.filter((d) => !applied.has(d)).length);
' 2>/dev/null) || PENDING_MIGRATIONS="unknown"

# Only run migrate when the check found a DEFINITE positive count of pending
# migrations. A read-only better-sqlite3 open of the live WAL database can fail
# with "database disk image is malformed" (it cannot read the pending WAL),
# which made the check return "unknown" and previously forced a `prisma migrate
# deploy` that then died on "database is locked" and aborted the whole deploy.
# When the count is 0 or undeterminable, skip: migrations are hand-applied for
# this project, so running migrate against the live WAL db only causes locks.
if [ "$PENDING_MIGRATIONS" = "unknown" ]; then
  echo "Migration state unknown while app is live; stopping services and retrying check."
  systemctl stop dustycards-sync-scheduler.timer 2>/dev/null || true
  systemctl stop dustycards-sync-scheduler.service 2>/dev/null || true
  systemctl stop dustycards-sealed-release-refresh.timer 2>/dev/null || true
  systemctl stop dustycards-sealed-release-refresh.service 2>/dev/null || true
  systemctl stop dustycards 2>/dev/null || true
  PENDING_MIGRATIONS=$(NODE_PATH="$RemoteAppPath/node_modules" node -e '
    const Database = require("better-sqlite3");
    const fs = require("fs");
    if (!fs.existsSync("dustycards.db")) {
      console.log(0);
      process.exit(0);
    }
    const dirs = fs.readdirSync("prisma/migrations", { withFileTypes: true })
      .filter((d) => d.isDirectory()).map((d) => d.name);
    const db = new Database("dustycards.db", { readonly: true });
    try {
      const table = db.prepare("SELECT name FROM sqlite_master WHERE type = '\''table'\'' AND name = '\''_prisma_migrations'\''").get();
      if (!table) {
        console.log(dirs.length);
        process.exit(0);
      }
      const applied = new Set(
        db.prepare("SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL")
          .all().map((r) => r.migration_name)
      );
      console.log(dirs.filter((d) => !applied.has(d)).length);
    } finally { db.close(); }
  ' 2>/dev/null) || PENDING_MIGRATIONS="unknown"
fi

if [ "$PENDING_MIGRATIONS" = "unknown" ]; then
  echo "Could not determine Prisma migration state after stopping services; aborting deploy." >&2
  exit 1
fi

if [ "$PENDING_MIGRATIONS" -gt 0 ] 2>/dev/null; then
  echo "Pending migrations: $PENDING_MIGRATIONS — running prisma migrate deploy."
  systemctl stop dustycards-sync-scheduler.timer 2>/dev/null || true
  systemctl stop dustycards-sync-scheduler.service 2>/dev/null || true
  systemctl stop dustycards-sealed-release-refresh.timer 2>/dev/null || true
  systemctl stop dustycards-sealed-release-refresh.service 2>/dev/null || true
  systemctl stop dustycards 2>/dev/null || true
  npx prisma migrate deploy
else
  echo "No definite pending migrations ($PENDING_MIGRATIONS); skipping prisma migrate deploy."
fi

npx prisma generate
npm run build
cleanup_remote_junk
systemctl restart dustycards
systemctl is-active dustycards

cat > /etc/systemd/system/dustycards-sync-scheduler.service <<EOF
[Unit]
Description=DustyCards sync scheduler tick
After=dustycards.service network-online.target
Wants=dustycards.service network-online.target

[Service]
Type=oneshot
User=dustycards
Group=dustycards
WorkingDirectory=$RemoteAppPath
EnvironmentFile=$RemoteAppPath/.env
ExecStart=/bin/bash -lc '/usr/bin/curl -fsS --max-time 120 -X POST -H "x-dustycards-scheduler-secret: \${DUSTYCARDS_SYNC_SCHEDULER_SECRET}" "\${DUSTYCARDS_SYNC_SCHEDULER_URL:-http://127.0.0.1:3000}/api/internal/sync-scheduler"'
EOF

cat > /etc/systemd/system/dustycards-sync-scheduler.timer <<'EOF'
[Unit]
Description=Run DustyCards sync scheduler every five minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
AccuracySec=30s
Persistent=true
Unit=dustycards-sync-scheduler.service

[Install]
WantedBy=timers.target
EOF

# Product launch dates come straight from the official Pokemon gallery. This
# intentionally runs only twice a month and only checks the current/next year;
# already cached product pages are not downloaded again. It consumes no Tavily
# or Firecrawl credits and gives the lifecycle model real product-release
# observations instead of treating the parent set date as every product date.
cat > /etc/systemd/system/dustycards-sealed-release-refresh.service <<EOF
[Unit]
Description=DustyCards official sealed product release refresh
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=dustycards
Group=dustycards
WorkingDirectory=$RemoteAppPath
EnvironmentFile=$RemoteAppPath/.env
ExecStart=/usr/bin/env npm run sync:sealed-release-dates -- --refresh --apply --allow-partial --years=current-next --max-pages=60 --concurrency=3
Nice=10
IOSchedulingClass=best-effort
IOSchedulingPriority=7
EOF

cat > /etc/systemd/system/dustycards-sealed-release-refresh.timer <<'EOF'
[Unit]
Description=Refresh official sealed release dates twice monthly

[Timer]
OnCalendar=*-*-01,15 03:25:00
RandomizedDelaySec=20min
Persistent=true
Unit=dustycards-sealed-release-refresh.service

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now dustycards-sync-scheduler.timer
systemctl enable --now dustycards-sealed-release-refresh.timer
# Kick off one sync immediately, but do not fail the deploy if it does: the app
# has only just restarted and may not be ready to serve the sync endpoint in
# this exact instant. The timer (enabled above) runs it every 5 min regardless.
systemctl start dustycards-sync-scheduler.service || true
systemctl is-active dustycards-sync-scheduler.timer
systemctl is-active dustycards-sealed-release-refresh.timer
'@

$remoteScript = $remoteScript.Replace("__REMOTE_APP_PATH__", $remoteAppPathLiteral)
$remoteScript = $remoteScript.Replace("`r`n", "`n")
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($remoteScriptFile, $remoteScript, $utf8NoBom)

scp -o BatchMode=yes -o StrictHostKeyChecking=no $remoteScriptFile "${HostName}:/tmp/dustycards-deploy.sh"

# The remote build writes progress AND warnings (e.g. "Turbopack build
# encountered N warnings") to stderr. Under ErrorActionPreference=Stop, that
# stderr was treated as a terminating error and aborted the deploy even though
# the remote build+restart succeeded. Only the remote exit code tells us if the
# deploy actually failed, so check that instead of the error stream.
$ErrorActionPreference = "Continue"
ssh -o BatchMode=yes -o StrictHostKeyChecking=no $HostName "bash /tmp/dustycards-deploy.sh"
$deployExitCode = $LASTEXITCODE
$ErrorActionPreference = "Stop"
if ($deployExitCode -ne 0) {
  throw "Remote deploy failed with exit code $deployExitCode"
}

Remove-Item -LiteralPath $remoteScriptFile -Force
Remove-Item -LiteralPath $archive -Force
