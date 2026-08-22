$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$outputDir = "D:\DustyCards-backups"
$envFile = Join-Path $projectRoot ".env"
$logFile = Join-Path $outputDir "offsite-backup.log"

New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
$deployTarget = $env:DUSTYCARDS_DEPLOY_HOST
if (-not $deployTarget -and (Test-Path -LiteralPath $envFile)) {
  $match = Select-String -LiteralPath $envFile -Pattern '^\s*DUSTYCARDS_DEPLOY_HOST\s*=\s*"?([^"\r\n]+)"?' | Select-Object -First 1
  if ($match) {
    $deployTarget = $match.Matches[0].Groups[1].Value.Trim()
  }
}
if (-not $deployTarget) {
  throw "DUSTYCARDS_DEPLOY_HOST is not configured."
}

$startedAt = Get-Date -Format o
"[$startedAt] Starting DustyCards offsite backup." | Add-Content -LiteralPath $logFile
& node (Join-Path $PSScriptRoot "pull-production-backup.mjs") `
  --host $deployTarget `
  --output $outputDir 2>&1 | Tee-Object -FilePath $logFile -Append
if ($LASTEXITCODE -ne 0) {
  throw "DustyCards offsite backup failed with exit code $LASTEXITCODE."
}
