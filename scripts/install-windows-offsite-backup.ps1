$ErrorActionPreference = "Stop"

$taskName = "DustyCards Offsite Backup"
$outputDir = "D:\DustyCards-backups"
$runner = Join-Path $PSScriptRoot "run-windows-offsite-backup.ps1"
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
& icacls.exe $outputDir /inheritance:r /grant:r "${identity}:(OI)(CI)F" "SYSTEM:(OI)(CI)F" | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Could not restrict access to $outputDir."
}

$action = New-ScheduledTaskAction `
  -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$runner`""
$daily = New-ScheduledTaskTrigger -Daily -At 4:15am
$logon = New-ScheduledTaskTrigger -AtLogOn -User $identity
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Hours 3)
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger @($daily, $logon) `
  -Settings $settings `
  -Principal $principal `
  -Force | Out-Null

Write-Output "Installed '$taskName' for $identity."
