@echo off
rem Runs the sales report from the repo and appends the output to the log.
rem Used by the two Windows scheduled tasks (scripts\sales-report-schedule.ps1);
rem any arguments go straight to sales-report.mjs (e.g. --month=previous).
cd /d "%~dp0.."
echo. >> "C:\Users\Karen Plankton\Desktop\Tour Archive\sales-report.log"
"C:\Program Files\nodejs\node.exe" scripts\sales-report.mjs %* >> "C:\Users\Karen Plankton\Desktop\Tour Archive\sales-report.log" 2>&1
