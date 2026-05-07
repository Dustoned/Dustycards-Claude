param(
  [string]$HostName = "root@93.190.187.221",
  [string]$RemoteAppPath = "/opt/dustycards/app"
)

$ErrorActionPreference = "Stop"

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

function ConvertTo-ShellSingleQuoted {
  param([string]$Value)
  return "'" + ($Value -replace "'", "'""'""'") + "'"
}

$remoteAppPathLiteral = ConvertTo-ShellSingleQuoted $RemoteAppPath
$remoteScript = @'
set -e
RemoteAppPath=__REMOTE_APP_PATH__

mkdir -p /opt/dustycards/backups
if [ -f "$RemoteAppPath/dustycards.db" ]; then
  cp "$RemoteAppPath/dustycards.db" "/opt/dustycards/backups/dustycards-predeploy-$(date -u +%Y%m%d-%H%M%S).db"
fi

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
for path in src prisma scripts tests public; do
  rm -rf "$RemoteAppPath/$path"
done

tar -cf - -C "$release_dir" . | tar -xf - -C "$RemoteAppPath"

cd "$RemoteAppPath"
npm install
npx prisma migrate deploy
npm run build
systemctl restart dustycards
systemctl is-active dustycards
'@

$remoteScript = $remoteScript.Replace("__REMOTE_APP_PATH__", $remoteAppPathLiteral)
$remoteScript = $remoteScript.Replace("`r`n", "`n")
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($remoteScriptFile, $remoteScript, $utf8NoBom)

scp -o BatchMode=yes -o StrictHostKeyChecking=no $remoteScriptFile "${HostName}:/tmp/dustycards-deploy.sh"
ssh -o BatchMode=yes -o StrictHostKeyChecking=no $HostName "bash /tmp/dustycards-deploy.sh"

Remove-Item -LiteralPath $remoteScriptFile -Force
