@echo off
setlocal
echo Starting Healthcare Discharge Instructions Generator...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\app.ps1" start -OpenBrowser
set "result=%errorlevel%"
if not "%result%"=="0" pause
exit /b %result%
