# Tour Archive — the shop's daily sold sync.
#
# Reads the eBay seller index, confirms each vanished listing on its own
# page ("This listing sold on …"), and writes sold:true into the manifest.
# By default that is ALL it does — no git, same house rule as desk-sweep.ps1
# (a scheduled task that commits once cost this machine a stuck merge).
# Set SOLD_SYNC_PUSH=1 in the task environment to enable the GUARDED push
# (clean tree only, pull --rebase first, manifest.json alone).
#
# Registered as the task "TourArchiveShopSweep".
# Health check:  Get-Content "$env:LOCALAPPDATA\TourArchive\shop-sweep.log" -Tail 12
$ErrorActionPreference = 'Stop'

$Repo = 'C:\Users\Karen Plankton\Desktop\claret-archive'
$Dir  = Join-Path $env:LOCALAPPDATA 'TourArchive'
$Log  = Join-Path $Dir 'shop-sweep.log'

New-Item -ItemType Directory -Path $Dir -Force | Out-Null
function Log($m) {
  "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m |
    Out-File -FilePath $Log -Append -Encoding utf8
}

if ((Test-Path $Log) -and (Get-Item $Log).Length -gt 512KB) {
  Move-Item $Log (Join-Path $Dir 'shop-sweep.1.log') -Force
}

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { $node = 'C:\Program Files\nodejs\node.exe' }

try {
  if (-not (Test-Path $node)) { Log 'COULD NOT SYNC: node is not installed on this machine'; exit 1 }
  Set-Location $Repo
  $env:SOLD_SYNC_LOG = $Log
  $started = Get-Date
  $flags = @()
  if ($env:SOLD_SYNC_PUSH -eq '1') { $flags += '--push' }

  # PowerShell 5.1 turns a native command's stderr line into a terminating
  # error while $ErrorActionPreference is 'Stop' — warnings are not failures.
  $ErrorActionPreference = 'Continue'
  & $node (Join-Path $Repo 'scripts\sold-sync.mjs') @flags 2>&1 | Out-Null
  $code = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'

  $secs = [int]((Get-Date) - $started).TotalSeconds
  if ($code -eq 0) { Log "sync finished in ${secs}s" } else { Log "sync FAILED (exit $code) after ${secs}s" }
  exit $code
} catch {
  Log "sync CRASHED: $($_.Exception.Message)"
  exit 1
}
