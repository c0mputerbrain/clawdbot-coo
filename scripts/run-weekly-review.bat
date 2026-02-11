@echo off
REM Oops Weekly Review — deep code review of Edge's codebase
REM Scheduled: Fridays at 1:00 PM ET via Windows Task Scheduler

cd /d "%~dp0\.."
node scripts\weekly-review.js --repo-path "%USERPROFILE%\edgebot-brain"

REM Auto-commit the report to COO repo
cd /d "%USERPROFILE%\clawdbot-coo"
git add reports\weekly-review-*.md
git commit -m "Weekly review %date:~-4%-%date:~4,2%-%date:~7,2%" 2>nul
git push origin main 2>nul

pause
