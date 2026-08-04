# Tour Archive — the desk's rounds.
#
# Opens each find that is still waiting to be dressed, in the same robot
# browser the archive uses, and writes back its picture, title and price.
# That is ALL it does. It does not run git, it does not install anything, it
# does not deploy. A scheduled task that commits has already cost this machine
# a stuck merge once (the T42 radar) — if a git line ever appears below,
# delete it.
#
# Registered as the task "TourArchiveDeskSweep" — ACTIONS.md § 0.
# Health check:  Get-Content "$env:LOCALAPPDATA\TourArchive\desk-sweep.log" -Tail 12
$ErrorActionPreference = 'Stop'

$Repo = 'C:\Users\Karen Plankton\Desktop\claret-archive'
$Dir  = Join-Path $env:LOCALAPPDATA 'TourArchive'
$Log  = Join-Path $Dir 'desk-sweep.log'
$Max  = 15

New-Item -ItemType Directory -Path $Dir -Force | Out-Null
function Log($m) {
  "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m |
    Out-File -FilePath $Log -Append -Encoding utf8
}

# Rotate at 512 KB, one generation — two months of diary, not an archive.
if ((Test-Path $Log) -and (Get-Item $Log).Length -gt 512KB) {
  Move-Item $Log (Join-Path $Dir 'desk-sweep.1.log') -Force
}

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { $node = 'C:\Program Files\nodejs\node.exe' }

try {
  if (-not (Test-Path $node)) { Log 'COULD NOT SWEEP: node is not installed on this machine'; exit 1 }
  Set-Location $Repo
  $env:DESK_SWEEP_LOG = $Log          # the sweep writes its own per-find lines here
  $started = Get-Date

  # PowerShell 5.1 turns a native command's stderr line into a terminating
  # error while $ErrorActionPreference is 'Stop' — warnings are not failures.
  $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  & $node 'scripts\curate-enrich.mjs' '--max' $Max | Out-Null
  $code = $LASTEXITCODE
  $ErrorActionPreference = $prev

  # The wrapper CLASSIFIES exit codes — it does not just echo them.
  # 4 = a sweep was already out (a founder hand-run, most likely): fine.
  if ($code -eq 4) { exit 0 }
  if ($code -ne 0) {
    Log ("sweep failed (exit {0}, {1}s) - see the lines above" -f $code, [int]((Get-Date) - $started).TotalSeconds)
    exit 1
  }
} catch {
  Log ("COULD NOT SWEEP: " + $_.Exception.Message)
  exit 1
} finally {
  Remove-Item Env:\DESK_SWEEP_LOG -ErrorAction SilentlyContinue
}
