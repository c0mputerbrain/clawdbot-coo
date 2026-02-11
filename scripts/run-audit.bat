@echo off
REM COO Nightly Audit — runs health checks on Edge's codebase
REM Schedule this with Windows Task Scheduler (daily, e.g. 11:30 PM ET)

cd /d "%~dp0\.."
node scripts\nightly-audit.js --repo-path "%USERPROFILE%\edgebot-brain" --fix

REM Auto-commit the report + trends to COO repo
cd /d "%USERPROFILE%\clawdbot-coo"
git add reports\*.md reports\trends.json
git commit -m "Nightly audit report %date:~-4%-%date:~4,2%-%date:~7,2%" 2>nul
git push origin main 2>nul

pause
