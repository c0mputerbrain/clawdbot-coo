# Oops Weekly Review — 2026-02-27

**Overall Grade: C — Multiple concerns**

## 1. Audit Trends (Last 7 Days) [!]

- Audits this week: 7
- Grades: B, C, C, C, C, C, C
- Avg criticals: 0.0 | Avg warnings: 5.1
- Warnings every day — recurring issues not being resolved
- KB growth: 2005 -> 2116 files (+111)
- Memory growth: 1097 -> 1108 files (+11)
- Recurring warnings: Frontmatter (3x), Structure (3x), Git (3x), [P0] Security-Deep (3x), [P2] Frontmatter (5x), [P2] Structure (4x), [P2] Tag Quality (4x), [P2] Memory Quality (4x)

## 2. KB Quality [OK]

- Files indexed: 2116
- Keywords: 8975
- TOPICS-INDEX.json: 465 KB
- KEYWORDS-INDEX.json: 4091 KB
- FILES-INDEX.json: 1225 KB
- Sample frontmatter check: 5/5 complete
  trade-ideas/compare-tradeideas-vs-cheddarflow.html.md: complete
  amibroker/afl-functions/advvolume.md: complete
  amibroker/kb/INDEX-VIDEOS.md: complete
  amibroker/afl-functions/getcursormousebuttons.md: complete
  amibroker/guide/iqfeed-setup.md: complete
- Topic clusters: 23

## 3. Memory Hygiene [!]

- Memory directory: 1108 files, 3.6 MB
- Daily logs: 40 total, 25 older than 14 days
- ACTION NEEDED: 25 old logs should be distilled into MEMORY.md and archived
- MEMORY.md: 39 lines, 3 KB

## 4. Script Inventory [OK]

- Active scripts: 79 JS, 17 shell
  add-frontmatter.js: (no description)
  trade-analyzer.js: (no description)
  fetch-iqfeed-bars.js: (no description)
  iq-batch-fetch.js: (no description)
  browser-login.js: (no description)
  browser-session.js: (no description)
  compare-sources.js: (no description)
  extract-all-tickers.js: (no description)
  extract-tickers-playwright.js: (no description)
  generate-pdf-report.js: (no description)
  generate-post-market-filtered.js: (no description)
  github-trading-scanner.js: (no description)
  parse-stockfetcher-email.js: (no description)
  smb-screenshot.js: (no description)
  premarket-scanner-v2.js: (no description)
  seeking-alpha-scanner.js: (no description)
  stockfetcher-scanner.js: (no description)
  amibroker-forum-scraper.js: (no description)
  amibroker-kb-scraper.js: (no description)
  fetch-help-center.js: (no description)
  fetch-youtube-transcripts.js: (no description)
  scrape-key-pages.js: (no description)
  scrape-trade-ideas-guide.js: (no description)
  scrape-trade-ideas-help.js: (no description)
  scrape-trade-ideas.js: (no description)
  ti-help-scraper.js: (no description)
  tradestation-api.js: (no description)
  tradestation-auth.js: (no description)
  tradestation-trade.js: (no description)
  archive-chart-versions.js: (no description)
  audit.js: (no description)
  build-daily-breakout-index.js: (no description)
  build-expenses-dashboard.js: Tabs 
  build-intraday-index.js: (no description)
  build-kb-index.js: (no description)
  build-mc-charts.js: (no description)
  build-post-market-final.js: (no description)
  catalyst-scanner-v5.js: (no description)
  catalyst-search.js: (no description)
  check-email.js: (no description)
  cron-health-reporter.js: (no description)
  detect-entry.js: (no description)
  entity-ab-test.js: (no description)
  entity-backfill.js: (no description)
  entity-extract.js: (no description)
  entity-query.js: (no description)
  fetch-emails.js: (no description)
  finviz-api.js: (no description)
  gdrive-find-new-files.js: (no description)
  gdrive-monitor.js: (no description)
  health-monitor.js: (no description)
  iqfeed-fetch-with-retry.js: (no description)
  kanban-process-events.js: (no description)
  kb-update.js: (no description)
  morning-intel-report.js: (no description)
  orb-chart-viewer.js: (no description)
  position-size.js: (no description)
  process-emails-to-kb.js: (no description)
  read-tweet.js: (no description)
  rr-calc.js: (no description)
  sanitize.js: (no description)
  scan-ticker-news.js: (no description)
  security-scan.js: (no description)
  session-circuit-breaker.js: (no description)
  spawn-with-retry-test.js: (no description)
  spawn-with-retry.js: (no description)
  test-detect-entry.js: (no description)
  test-sanitize.js: (no description)
  compute-stats.js: (no description)
  db.js: (no description)
  enrich-mfe-mae.js: (no description)
  export-dashboard.js: (no description)
  import-daily.js: (no description)
  import-das.js: (no description)
  import-ti-alerts.js: (no description)
  import-tradervue.js: (no description)
  queries.js: (no description)
  trade-journal.js: (no description)
  vault.js: (no description)
  stockfetcher-scanner.sh: (no description)
  auto-pull.sh: (no description)
  batch2-monitor.sh: (no description)
  download-notion-pdf.sh: (no description)
  gateway-restart.sh: (no description)
  git-pull-review.sh: (no description)
  health-check.sh: (no description)
  heartbeat-health-check.sh: (no description)
  move-credentials.sh: (no description)
  nightly-backup.sh: (no description)
  nightly-optimization.sh: (no description)
  trading-books-batch2-phase1.sh: (no description)
  trading-books-batch2-phase2.sh: (no description)
  worktree-agent.sh: (no description)
  worktree-cleanup.sh: (no description)
  worktree-merge.sh: (no description)
  x-watchlist-scan.sh: (no description)
- Archived scripts: 6

## 5. Edge Intelligence Check [!]

- directives.md: 95 lines
  PASS: TOPICS-INDEX.json referenced
  PASS: KB-STANDARDS.md referenced
  PASS: kb-update.js referenced
  FAIL: KB-SEARCH.md referenced
  PASS: Model routing defined
  PASS: No legacy SEARCH-INDEX.json as primary
- PASS: AGENTS.md includes git pull on startup
  FAIL: Git pull in heartbeat
  PASS: Knowledge capture loop
  PASS: KB-STANDARDS.md referenced
  PASS: kb-update.js referenced

## 6. Security [OK]

- No secrets detected in committed files
- PASS: .credentials in .gitignore

## 7. Recommendations

1. [FIX] 1. Audit Trends (Last 7 Days): Recurring warnings: Frontmatter (3x), Structure (3x), Git (3x), [P0] Security-Deep (3x), [P2] Frontmatter (5x), [P2] Structure (4x), [P2] Tag Quality (4x), [P2] Memory Quality (4x)
2. [FIX] 3. Memory Hygiene: ACTION NEEDED: 25 old logs should be distilled into MEMORY.md and archived
3. [FIX] 5. Edge Intelligence Check:   FAIL: KB-SEARCH.md referenced

---

*Generated by Oops weekly-review.js — 2026-02-27T18:00:08.078Z*
