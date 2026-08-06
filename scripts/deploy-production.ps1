param(
  [string]$HostName = "",
  [string]$RemoteAppPath = "/opt/dustycards/app"
)

$ErrorActionPreference = "Stop"
Set-Location -LiteralPath (Join-Path $PSScriptRoot "..")

$dirty = git status --porcelain
if ($LASTEXITCODE -ne 0) {
  throw "Could not read git status before deployment."
}
if ($dirty) {
  throw "Refusing to deploy a dirty working tree. Commit the intended release first."
}

git fetch origin main --quiet
if ($LASTEXITCODE -ne 0) {
  throw "Could not refresh origin/main before deployment."
}
$branch = (git branch --show-current).Trim()
$deploySha = (git rev-parse HEAD).Trim()
$originSha = (git rev-parse origin/main).Trim()
if ($branch -ne "main" -or $deploySha -ne $originSha -or $deploySha -notmatch '^[0-9a-f]{40}$') {
  throw "Production deploys require a clean main branch exactly matching origin/main."
}

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
  --exclude=".claude" `
  --exclude=".codex-screenshots" `
  --exclude=".codex-temp" `
  --exclude=".firecrawl" `
  --exclude="node_modules" `
  --exclude=".next" `
  --exclude="data/image-cache" `
  --exclude="data/signal-radar-snapshots" `
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
DeploySha="${DUSTYCARDS_DEPLOY_SHA:-}"
DeployArchive="${DUSTYCARDS_DEPLOY_ARCHIVE:-/tmp/dustycards-deploy.tar.gz}"

mkdir -p /opt/dustycards /opt/dustycards/backups /opt/dustycards/cache
install -d -o dustycards -g dustycards -m 0755 /opt/dustycards/backups
install -d -o dustycards -g dustycards -m 0755 /opt/dustycards/cache
touch /opt/dustycards/backup.lock
chown root:dustycards /opt/dustycards/backup.lock
chmod 0660 /opt/dustycards/backup.lock
exec 9>/opt/dustycards/deploy.lock
if ! flock -n 9; then
  echo "Another DustyCards deploy is already running; refusing to overlap." >&2
  exit 75
fi

prune_predeploy_backups() {
  backup_dir="/opt/dustycards/backups"
  keep_count="${1:-2}"
  mapfile -t backup_files < <(
    find "$backup_dir" -maxdepth 1 -type f -name 'dustycards-predeploy-*.db' -printf '%T@ %p\n' |
      sort -nr | cut -d' ' -f2-
  )

  # A compacted backup is currently more than 3 GB on a 38 GB VPS. Before a
  # new copy, keep one verified restore point so VACUUM INTO has room; after
  # it succeeds, keep the two newest. Manually named migration/repair backups
  # remain untouched.
  for ((index=keep_count; index<${#backup_files[@]}; index++)); do
    file="${backup_files[$index]}"
    case "$file" in
      "$backup_dir"/dustycards-predeploy-*.db) rm -f -- "$file" ;;
      *) echo "Refusing to remove unexpected backup path: $file" >&2; exit 1 ;;
    esac
  done

  # The deploy lock guarantees there is no other active backup writer here, so
  # every exact predeploy temp file belongs to an interrupted earlier attempt.
  find "$backup_dir" -maxdepth 1 -type f \
    -name 'dustycards-predeploy-*.db.tmp*' -delete

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
  prune_predeploy_backups 2
}

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
    .claude \
    .codex-screenshots \
    .codex-temp \
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

release_dir="$(mktemp -d /tmp/dustycards-release.XXXXXX)"
services_stopped=0
cleanup() {
  if [ "$services_stopped" -eq 1 ]; then
    systemctl start dustycards 2>/dev/null || true
  fi
  rm -rf "$release_dir"
  rm -f -- "$DeployArchive"
  rm -f /tmp/dustycards-deploy.sh
}
trap cleanup EXIT

tar -xzf "$DeployArchive" -C "$release_dir"
# `mktemp -d` creates the staging directory as root:root/0700. A plain
# `tar -C "$release_dir" . | tar -C "$RemoteAppPath"` also copies the `.`
# directory metadata and silently turns the live app directory into 0700.
# systemd then cannot CHDIR as the `dustycards` user after restart. Keep the
# live directory ownership/mode explicit and never overwrite it from staging.
install -d -o dustycards -g dustycards -m 0755 "$RemoteAppPath"

# Replace only source-controlled app paths so deleted/renamed files do not linger
# on the server. Persistent runtime data (.env, dustycards.db, node_modules, .next)
# is intentionally left in place.
for path in src prisma scripts tests public docs deploy; do
  rm -rf "$RemoteAppPath/$path"
done

tar -cf - -C "$release_dir" . | tar --no-overwrite-dir -xf - -C "$RemoteAppPath"
chown dustycards:dustycards "$RemoteAppPath"
chmod 0755 "$RemoteAppPath"
# The sealed-release timer writes its persistent JSON cache here as the
# unprivileged app user. Keep the directory writable after root-run deploys.
install -d -o dustycards -g dustycards -m 0755 "$RemoteAppPath/data"

# Runtime images live outside the source tree. The first deployment moves the
# existing cache on the same filesystem and leaves a compatibility symlink.
image_cache_dir="/opt/dustycards/cache/image-cache"
legacy_image_cache_dir="$RemoteAppPath/data/image-cache"
if [ -d "$legacy_image_cache_dir" ] && [ ! -L "$legacy_image_cache_dir" ] && [ ! -e "$image_cache_dir" ]; then
  mv -- "$legacy_image_cache_dir" "$image_cache_dir"
fi
install -d -o dustycards -g dustycards -m 0755 "$image_cache_dir"
if [ ! -e "$legacy_image_cache_dir" ]; then
  ln -s "$image_cache_dir" "$legacy_image_cache_dir"
fi
chown -R dustycards:dustycards "$image_cache_dir"

# Caddy serves immutable browser assets without involving the Next web
# process. Merge every retained release into one shared directory before the
# proxy configuration is reloaded; this also backfills the directory on the
# first deploy that introduces it. Hashed assets from recently replaced builds
# remain available to tabs that were already open during a deployment.
next_static_dir="/opt/dustycards/cache/next-static"
install -d -o dustycards -g dustycards -m 0755 "$next_static_dir"
if [ -d "$RemoteAppPath/.next-releases" ]; then
  for retained_static_dir in "$RemoteAppPath"/.next-releases/*/static; do
    [ -d "$retained_static_dir" ] || continue
    cp -a -- "$retained_static_dir/." "$next_static_dir/"
  done
fi
chown -R dustycards:dustycards "$next_static_dir"

# Keep proxy-level response timings with bounded rotation. Validate before
# replacing the live configuration and reload without dropping connections.
if [ -f "$RemoteAppPath/deploy/Caddyfile" ]; then
  caddy validate --config "$RemoteAppPath/deploy/Caddyfile" --adapter caddyfile
  install -d -o caddy -g caddy -m 0755 /var/log/caddy
  install -m 0644 "$RemoteAppPath/deploy/Caddyfile" /etc/caddy/Caddyfile
  systemctl reload caddy
fi

cd "$RemoteAppPath"
# `.next` is only a compatibility link to the active immutable release. Next's
# type checker resolves generated imports from the link path and would then
# look for source files below `.next-releases` during the next build. Caddy is
# already on the shared static directory at this point, so remove only the
# symlink while building and recreate it after the new release is healthy.
if [ -L "$RemoteAppPath/.next" ]; then
  rm -f -- "$RemoteAppPath/.next"
fi
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

npm install --no-audit --no-fund
npx prisma generate

# Build the immutable Next release while the previous process remains online.
# Migration downtime is then limited to the schema change and one restart.
release_build="${DeploySha:-$(date -u +%Y%m%dT%H%M%SZ)}"
release_dist_dir=".next-releases/$release_build"
rm -rf -- "$RemoteAppPath/$release_dist_dir"
install -d -o dustycards -g dustycards -m 0755 "$RemoteAppPath/.next-releases"
DUSTYCARDS_IMAGE_CACHE_DIR="$image_cache_dir" \
DUSTYCARDS_NEXT_DIST_DIR="$release_dist_dir" \
NEXT_PUBLIC_APP_BUILD="$release_build" \
  APP_BUILD="$release_build" \
  NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=2048}" \
  npm run build

# Publish this build's hashed chunks, styles and fonts into the shared static
# asset directory before activating the new process. Files copied by a fresh
# build have a fresh mtime; assets unused for 30 days can be removed without
# breaking normal deployment hand-offs or long-lived installed clients.
cp -a -- "$RemoteAppPath/$release_dist_dir/static/." "$next_static_dir/"
chown -R dustycards:dustycards "$next_static_dir"
find "$next_static_dir" -type f -mtime +30 -delete
find "$next_static_dir" -mindepth 1 -type d -empty -delete

# The build runs as root, while Next writes image/fetch caches as dustycards.
install -d -o dustycards -g dustycards -m 0755 "$RemoteAppPath/$release_dist_dir/cache"
chown -R dustycards:dustycards "$RemoteAppPath/$release_dist_dir/cache"
cleanup_remote_junk

# Only run `prisma migrate deploy` when there is actually an unapplied
# migration. The migrate engine opens its own connection with no busy timeout,
# so against the live WAL database it fails with "database is locked" on
# code-only deploys (which are the common case). A normal handle sees the live
# WAL; this check executes read statements only.
PENDING_MIGRATIONS=$(NODE_PATH="$RemoteAppPath/node_modules" node -e '
  const Database = require("better-sqlite3");
  const fs = require("fs");
  const dirs = fs.readdirSync("prisma/migrations", { withFileTypes: true })
    .filter((d) => d.isDirectory()).map((d) => d.name);
  if (!fs.existsSync("dustycards.db")) {
    console.log(dirs.length);
    process.exit(0);
  }
  let applied = new Set();
  const db = new Database(process.cwd() + "/dustycards.db", { timeout: 5000 });
  try {
    db.pragma("busy_timeout = 5000");
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type = '\''table'\'' AND name = '\''_prisma_migrations'\''").get();
    if (!table) {
      console.log(dirs.length);
      process.exit(0);
    }
    applied = new Set(
      db.prepare("SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL")
        .all().map((r) => r.migration_name)
    );
  } finally { db.close(); }
  console.log(dirs.filter((d) => !applied.has(d)).length);
' 2>/dev/null) || PENDING_MIGRATIONS="unknown"

# If the live check is inconclusive, stop only after the new build is complete
# and retry. The cleanup trap restarts the previous build if a later step fails.
if [ "$PENDING_MIGRATIONS" = "unknown" ]; then
  echo "Migration state unknown while app is live; stopping services and retrying check."
  systemctl stop dustycards-sync-scheduler.timer 2>/dev/null || true
  systemctl stop dustycards-sync-scheduler.service 2>/dev/null || true
  systemctl stop dustycards-sealed-release-refresh.timer 2>/dev/null || true
  systemctl stop dustycards-sealed-release-refresh.service 2>/dev/null || true
  systemctl stop dustycards-daily-backup.service 2>/dev/null || true
  systemctl stop dustycards-reprint-backlog.service 2>/dev/null || true
  systemctl stop dustycards 2>/dev/null || true
  services_stopped=1
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
  # Multi-GB pre-deploy backups are needed only for schema changes. Code-only
  # releases no longer create one and no longer flood the disk on every push.
  prune_predeploy_backups 1
  exec 8>/opt/dustycards/backup.lock
  flock -w 900 8
  create_predeploy_backup
  flock -u 8
  echo "Pending migrations: $PENDING_MIGRATIONS — running prisma migrate deploy."
  systemctl stop dustycards-sync-scheduler.timer 2>/dev/null || true
  systemctl stop dustycards-sync-scheduler.service 2>/dev/null || true
  systemctl stop dustycards-sealed-release-refresh.timer 2>/dev/null || true
  systemctl stop dustycards-sealed-release-refresh.service 2>/dev/null || true
  systemctl stop dustycards-daily-backup.service 2>/dev/null || true
  systemctl stop dustycards-reprint-backlog.service 2>/dev/null || true
  systemctl stop dustycards 2>/dev/null || true
  services_stopped=1
  npx prisma migrate deploy
else
  echo "No definite pending migrations ($PENDING_MIGRATIONS); skipping prisma migrate deploy."
fi

# Give both the server-rendered shell and /api/app-version the exact same,
# immutable release id. The installed iOS app can then detect a new deploy even
# when WebKit resumes an old in-memory page after hours in the background.
install -d -m 0755 /etc/systemd/system/dustycards.service.d
cat > /etc/systemd/system/dustycards.service.d/10-release-build.conf <<EOF
[Service]
Environment=APP_BUILD=$release_build
Environment=DUSTYCARDS_NEXT_DIST_DIR=$release_dist_dir
Environment=DUSTYCARDS_IMAGE_CACHE_DIR=$image_cache_dir
Environment=DUSTYCARDS_TIMING=1
EOF
cat > /etc/systemd/system/dustycards.service.d/20-resource-priority.conf <<'EOF'
[Service]
CPUWeight=1000
IOWeight=1000
TimeoutStopSec=30
EOF
systemctl daemon-reload
systemctl restart dustycards
services_stopped=0
systemctl is-active dustycards

health_ok=0
for attempt in $(seq 1 30); do
  if /usr/bin/curl -fsS --max-time 5 http://127.0.0.1:3000/api/health >/dev/null; then
    health_ok=1
    break
  fi
  sleep 1
done
if [ "$health_ok" -ne 1 ]; then
  echo "DustyCards failed its localhost health check after restart." >&2
  journalctl -u dustycards -n 80 --no-pager >&2 || true
  exit 1
fi

# The new process is healthy and no longer reads the legacy in-place build.
# Keep the current and two previous immutable releases for a quick rollback while
# removing older build output that would otherwise accumulate on the VPS. The
# compatibility symlink keeps local tooling correct; Caddy uses the shared
# static directory above so older open tabs remain valid across this switch.
rm -rf -- "$RemoteAppPath/.next"
ln -s "$release_dist_dir" "$RemoteAppPath/.next"
node scripts/prune-next-release-builds.mjs --keep=3

# Build the durable, user-independent Radar snapshot before real traffic lands.
# A warm-up failure must not roll back an otherwise healthy release.
radar_warm_secret="$(node -e 'require("dotenv").config({ quiet: true }); process.stdout.write(process.env.DUSTYCARDS_SYNC_SCHEDULER_SECRET || "")')"
if [ -n "$radar_warm_secret" ]; then
  /usr/bin/curl -fsS --max-time 240 -X POST \
    -H "x-dustycards-scheduler-secret: $radar_warm_secret" \
    http://127.0.0.1:3000/api/internal/warm-signal-radar >/dev/null ||
    echo "Signal Radar warm-up failed; the first feed request will rebuild it." >&2

  # Fill the new process's authenticated Home caches before a collector opens
  # the freshly deployed app. This turns the 5-6 second first Home request into
  # the same fast cache hit as later visits.
  /usr/bin/curl -fsS --max-time 240 -X POST \
    -H "x-dustycards-scheduler-secret: $radar_warm_secret" \
    "http://127.0.0.1:3000/api/internal/warm-collection-overviews?force=1" >/dev/null ||
    echo "Collection overview warm-up failed; Home will warm on first use." >&2
else
  echo "Signal Radar warm-up skipped because the scheduler secret is unavailable." >&2
fi

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

cat > /etc/systemd/system/dustycards-reprint-backlog.service <<EOF
[Unit]
Description=DustyCards low-priority reprint backlog worker
After=dustycards.service network-online.target
Wants=dustycards.service network-online.target

[Service]
Type=simple
User=dustycards
Group=dustycards
WorkingDirectory=$RemoteAppPath
EnvironmentFile=$RemoteAppPath/.env
Environment=UV_THREADPOOL_SIZE=1
ExecStart=/usr/bin/node --no-warnings scripts/card-reprint-backlog-worker.mjs
Nice=15
IOSchedulingClass=idle
CPUQuota=20%
CPUWeight=10
IOWeight=10
MemoryHigh=768M
MemoryMax=1G
TimeoutStopSec=180
Restart=on-failure
RestartSec=30

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/dustycards-daily-backup.service <<EOF
[Unit]
Description=DustyCards low-priority daily database backup
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=dustycards
Group=dustycards
WorkingDirectory=$RemoteAppPath
EnvironmentFile=$RemoteAppPath/.env
ExecStart=/usr/bin/flock -w 900 /opt/dustycards/backup.lock /usr/bin/node --no-warnings scripts/daily-backup-worker.mjs
Nice=15
IOSchedulingClass=idle
CPUQuota=25%
CPUWeight=10
IOWeight=10
MemoryHigh=512M
MemoryMax=1G
TimeoutStartSec=3h
EOF

cat > /etc/systemd/system/dustycards-runtime-maintenance.service <<EOF
[Unit]
Description=DustyCards low-priority database and image-cache maintenance
After=dustycards.service network-online.target
Wants=dustycards.service network-online.target

[Service]
Type=oneshot
User=dustycards
Group=dustycards
WorkingDirectory=$RemoteAppPath
EnvironmentFile=$RemoteAppPath/.env
Environment=DUSTYCARDS_IMAGE_CACHE_DIR=$image_cache_dir
ExecStart=/usr/bin/node --no-warnings scripts/runtime-maintenance-worker.mjs
Nice=19
IOSchedulingClass=idle
CPUQuota=20%
CPUWeight=5
IOWeight=5
MemoryHigh=512M
MemoryMax=768M
TimeoutStartSec=3h
EOF

cat > /etc/systemd/system/dustycards-live-performance-probe.service <<EOF
[Unit]
Description=DustyCards live latency probe
After=network-online.target caddy.service
Wants=network-online.target

[Service]
Type=oneshot
User=dustycards
Group=dustycards
WorkingDirectory=$RemoteAppPath
EnvironmentFile=$RemoteAppPath/.env
ExecStart=/usr/bin/node scripts/live-performance-probe.mjs
Nice=10
CPUWeight=10
IOWeight=10
MemoryMax=128M
TimeoutStartSec=30
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
IOSchedulingClass=idle
CPUQuota=35%
CPUWeight=10
IOWeight=10
MemoryHigh=768M
MemoryMax=1536M
EOF

cat > /etc/systemd/system/dustycards-daily-backup.timer <<'EOF'
[Unit]
Description=Create one bounded DustyCards database backup per day

[Timer]
OnCalendar=*-*-* 02:20:00
RandomizedDelaySec=20min
Persistent=true
Unit=dustycards-daily-backup.service

[Install]
WantedBy=timers.target
EOF

cat > /etc/systemd/system/dustycards-runtime-maintenance.timer <<'EOF'
[Unit]
Description=Run bounded DustyCards maintenance during the quiet window

[Timer]
OnCalendar=*-*-* 03:10:00
RandomizedDelaySec=20min
Unit=dustycards-runtime-maintenance.service

[Install]
WantedBy=timers.target
EOF

cat > /etc/systemd/system/dustycards-live-performance-probe.timer <<'EOF'
[Unit]
Description=Measure DustyCards live latency every two minutes

[Timer]
OnBootSec=90s
OnUnitActiveSec=2min
AccuracySec=15s
Unit=dustycards-live-performance-probe.service

[Install]
WantedBy=timers.target
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
systemctl enable --now dustycards-daily-backup.timer
systemctl enable --now dustycards-runtime-maintenance.timer
systemctl enable --now dustycards-live-performance-probe.timer
systemctl enable dustycards-reprint-backlog.service
systemctl restart dustycards-reprint-backlog.service || true
# Kick off one sync immediately, but do not fail the deploy if it does: the app
# has only just restarted and may not be ready to serve the sync endpoint in
# this exact instant. The timer (enabled above) runs it every 5 min regardless.
systemctl start dustycards-sync-scheduler.service || true
systemctl is-active dustycards-sync-scheduler.timer
systemctl is-active dustycards-sealed-release-refresh.timer
systemctl is-active dustycards-daily-backup.timer
systemctl is-active dustycards-runtime-maintenance.timer
systemctl is-active dustycards-live-performance-probe.timer

# Production follows GitHub over an outbound connection. This removes inbound
# SSH from the normal release path: a push to main is picked up within a minute
# and applied through the same backup/build/health-checked deploy script.
auto_repo="/opt/dustycards/repo"
if [ -d "$auto_repo/.git" ]; then
  git -C "$auto_repo" remote set-url origin https://github.com/Dustoned/Dustycards-Claude.git
  GIT_TERMINAL_PROMPT=0 git -C "$auto_repo" fetch --quiet --prune origin main
elif [ ! -e "$auto_repo" ] || [ -z "$(find "$auto_repo" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]; then
  mkdir -p "$(dirname "$auto_repo")"
  GIT_TERMINAL_PROMPT=0 git clone --quiet --filter=blob:none --single-branch --branch main \
    https://github.com/Dustoned/Dustycards-Claude.git "$auto_repo"
else
  echo "Refusing to replace non-git auto-deploy directory: $auto_repo" >&2
  exit 1
fi

cat > /usr/local/sbin/dustycards-auto-deploy <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

repo="/opt/dustycards/repo"
marker="/opt/dustycards/deployed-sha"
exec 8>/opt/dustycards/auto-deploy.lock
flock -n 8 || exit 0

target_sha="$(GIT_TERMINAL_PROMPT=0 git -C "$repo" ls-remote origin refs/heads/main | awk 'NR == 1 { print $1 }')"
[ -n "$target_sha" ] || { echo "Could not resolve origin/main" >&2; exit 1; }
deployed_sha="$(cat "$marker" 2>/dev/null || true)"
[ "$target_sha" = "$deployed_sha" ] && exit 0

GIT_TERMINAL_PROMPT=0 git -C "$repo" fetch --quiet --prune origin main
fetched_sha="$(git -C "$repo" rev-parse origin/main)"
[ "$target_sha" = "$fetched_sha" ] || { echo "Fetched SHA does not match remote SHA" >&2; exit 1; }

archive="/tmp/dustycards-auto-${target_sha}.tar.gz"
rm -f -- "$archive"
git -C "$repo" archive --format=tar.gz --output="$archive" "$target_sha"
DUSTYCARDS_DEPLOY_SHA="$target_sha" \
  DUSTYCARDS_DEPLOY_ARCHIVE="$archive" \
  /usr/local/sbin/dustycards-apply-release
EOF
chmod 0755 /usr/local/sbin/dustycards-auto-deploy

cat > /etc/systemd/system/dustycards-auto-deploy.service <<'EOF'
[Unit]
Description=Deploy the latest DustyCards main commit
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/dustycards-auto-deploy
Nice=15
IOSchedulingClass=idle
CPUQuota=65%
CPUWeight=10
IOWeight=10
MemoryHigh=2300M
MemoryMax=2800M
TasksMax=96
EOF

cat > /etc/systemd/system/dustycards-auto-deploy.timer <<'EOF'
[Unit]
Description=Check GitHub for a DustyCards release every five minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
AccuracySec=30s
Persistent=true
Unit=dustycards-auto-deploy.service

[Install]
WantedBy=timers.target
EOF

if [ -n "$DeploySha" ]; then
  marker_tmp="/opt/dustycards/deployed-sha.tmp"
  printf '%s\n' "$DeploySha" > "$marker_tmp"
  mv "$marker_tmp" /opt/dustycards/deployed-sha
fi

systemctl daemon-reload
systemctl enable --now dustycards-auto-deploy.timer
systemctl is-active dustycards-auto-deploy.timer
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
ssh -o BatchMode=yes -o StrictHostKeyChecking=no $HostName "install -m 0755 /tmp/dustycards-deploy.sh /usr/local/sbin/dustycards-apply-release && DUSTYCARDS_DEPLOY_SHA=$deploySha /usr/local/sbin/dustycards-apply-release"
$deployExitCode = $LASTEXITCODE
$ErrorActionPreference = "Stop"
if ($deployExitCode -ne 0) {
  Remove-Item -LiteralPath $remoteScriptFile -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue
  throw "Remote deploy failed with exit code $deployExitCode"
}

$health = Invoke-RestMethod -Uri "https://dustycards.myftp.org/api/health" -TimeoutSec 20
if (-not $health.ok) {
  throw "Production health check did not return ok after deployment."
}

Remove-Item -LiteralPath $remoteScriptFile -Force
Remove-Item -LiteralPath $archive -Force
