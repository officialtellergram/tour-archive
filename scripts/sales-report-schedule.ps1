# Schedule the sales report on this PC (Drive for Desktop lives here, so the
# CSV lands straight in G:\My Drive\Finance\Transaction Invoices).
#
#   powershell -ExecutionPolicy Bypass -File scripts\sales-report-schedule.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\sales-report-schedule.ps1 -Remove
#
# Two Windows scheduled tasks, run as the signed-in user:
#   Tour Archive sales report (weekly)    Mondays 09:00  → sales-report.csv (all time)
#   Tour Archive sales report (monthly)   1st, 09:05     → sales-report-YYYY-MM.csv for the
#                                                          month just ended, with TOTAL and
#                                                          CUMULATIVE lines
# A run missed while the PC was off starts when it is next on. Each run goes
# through scripts\sales-report-run.cmd, which appends its output to
# Desktop\Tour Archive\sales-report.log.
#
# The tasks are defined as Task Scheduler XML (schtasks /XML): the cmdlets
# cannot build a monthly trigger, and schtasks /SC cannot set the missed-run
# behaviour, but the XML carries both.
param([switch]$Remove)

$repo = Split-Path -Parent $PSScriptRoot
$runner = "$repo\scripts\sales-report-run.cmd"
if (-not (Test-Path $runner)) { throw "runner not found: $runner" }
$start = (Get-Date).ToString('yyyy-MM-dd')

$weekly = @"
<CalendarTrigger><StartBoundary>${start}T09:00:00</StartBoundary><Enabled>true</Enabled>
  <ScheduleByWeek><DaysOfWeek><Monday /></DaysOfWeek><WeeksInterval>1</WeeksInterval></ScheduleByWeek></CalendarTrigger>
"@
$monthly = @"
<CalendarTrigger><StartBoundary>${start}T09:05:00</StartBoundary><Enabled>true</Enabled>
  <ScheduleByMonth><DaysOfMonth><Day>1</Day></DaysOfMonth>
  <Months><January /><February /><March /><April /><May /><June /><July /><August /><September /><October /><November /><December /></Months></ScheduleByMonth></CalendarTrigger>
"@

function TaskXml($description, $trigger, $arguments) {
  @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>$description</Description></RegistrationInfo>
  <Triggers>$trigger</Triggers>
  <Principals><Principal id="Author"><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>true</RunOnlyIfNetworkAvailable>
    <ExecutionTimeLimit>PT10M</ExecutionTimeLimit>
    <Enabled>true</Enabled>
  </Settings>
  <Actions Context="Author"><Exec><Command>"$runner"</Command><Arguments>$arguments</Arguments></Exec></Actions>
</Task>
"@
}

$tasks = @(
  @{ Name = 'Tour Archive sales report (weekly)';  Xml = TaskXml 'Tour Archive: all-time sales report to the shared Drive folder, every Monday' $weekly '' },
  @{ Name = 'Tour Archive sales report (monthly)'; Xml = TaskXml 'Tour Archive: last month''s sales statement to the shared Drive folder, on the 1st' $monthly '--month=previous' }
)

foreach ($t in $tasks) {
  schtasks /Query /TN $t.Name 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) {
    schtasks /Delete /TN $t.Name /F | Out-Null
    Write-Host "removed   $($t.Name)"
  }
  if ($Remove) { continue }
  $file = Join-Path $env:TEMP 'tour-archive-task.xml'
  [System.IO.File]::WriteAllText($file, $t.Xml, [System.Text.Encoding]::Unicode)
  schtasks /Create /TN $t.Name /XML $file /F | Out-Null
  $ok = $LASTEXITCODE -eq 0
  Remove-Item $file -ErrorAction SilentlyContinue
  if (-not $ok) { throw "could not create $($t.Name)" }
  Write-Host "scheduled $($t.Name)"
}
if (-not $Remove) {
  Get-ScheduledTask | Where-Object TaskName -like 'Tour Archive sales report*' | ForEach-Object {
    $i = $_ | Get-ScheduledTaskInfo
    Write-Host ("  {0,-40} next run {1}  missed-run catch-up {2}" -f $_.TaskName, $i.NextRunTime, $_.Settings.StartWhenAvailable)
  }
}
