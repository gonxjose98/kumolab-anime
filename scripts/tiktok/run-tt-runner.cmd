@echo off
REM Task Scheduler entry point for the TikTok runner.
REM
REM Exists so every scheduled run is timestamped and appended to a log. Task
REM Scheduler only keeps an exit code, and "0x1" three weeks later tells you
REM nothing about which job failed or why. out\ is gitignored, so the log and
REM the phase screenshots stay local.

cd /d "C:\Users\Jose G\Workspace\workspace-kumolab"
if not exist "scripts\tiktok\out" mkdir "scripts\tiktok\out"

echo. >> "scripts\tiktok\out\runner.log"
echo ===== run started %DATE% %TIME% ===== >> "scripts\tiktok\out\runner.log"

"C:\Program Files\nodejs\node.exe" scripts\tiktok\tt-runner.mjs >> "scripts\tiktok\out\runner.log" 2>&1
set RC=%ERRORLEVEL%

echo ===== run finished %DATE% %TIME% (exit %RC%) ===== >> "scripts\tiktok\out\runner.log"

REM Exit 2 means the TikTok login session expired and needs tt-capture.mjs.
if %RC%==2 echo *** SESSION EXPIRED - run: node scripts/tiktok/tt-capture.mjs *** >> "scripts\tiktok\out\runner.log"

exit /b %RC%
