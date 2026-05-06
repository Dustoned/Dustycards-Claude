param(
  [string]$HostName = "root@93.190.187.221",
  [string]$RemoteAppPath = "/opt/dustycards/app"
)

$ErrorActionPreference = "Stop"

$archive = Join-Path $env:TEMP "dustycards-deploy.tar.gz"
if (Test-Path -LiteralPath $archive) {
  Remove-Item -LiteralPath $archive -Force
}

tar -czf $archive `
  --exclude=".git" `
  --exclude="node_modules" `
  --exclude=".next" `
  --exclude="test-results" `
  --exclude="playwright-report" `
  --exclude=".env*" `
  --exclude="*.log" `
  --exclude="*.db" `
  --exclude="*.sqlite" `
  --exclude="*.sqlite3" `
  -C . .

scp -o BatchMode=yes -o StrictHostKeyChecking=no $archive "${HostName}:/tmp/dustycards-deploy.tar.gz"

ssh -o BatchMode=yes -o StrictHostKeyChecking=no $HostName @"
set -e
mkdir -p /opt/dustycards/backups
if [ -f "$RemoteAppPath/dustycards.db" ]; then
  cp "$RemoteAppPath/dustycards.db" "/opt/dustycards/backups/dustycards-predeploy-\$(date -u +%Y%m%d-%H%M%S).db"
fi
tar -xzf /tmp/dustycards-deploy.tar.gz -C "$RemoteAppPath"
cd "$RemoteAppPath"
npm install
npx prisma migrate deploy
npm run build
systemctl restart dustycards
systemctl is-active dustycards
"@
