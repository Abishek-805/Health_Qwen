@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\app.ps1" stop
set "result=%errorlevel%"
if not "%result%"=="0" pause
exit /b %result%
