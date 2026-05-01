# Oops Weekly Review — 2026-05-01

**Overall Grade: F — Critical issues**

## 1. Audit Trends (Last 7 Days) [!]

- Audits this week: 7
- Grades: B, B, B, B, B, B, B
- Avg criticals: 2.3 | Avg warnings: 9.4
- Warnings every day — recurring issues not being resolved
- KB growth: 2300 -> 2300 files (+0)
- Memory growth: 1162 -> 1168 files (+6)
- Recurring warnings: [P1] Frontmatter (7x), [P1] Push Health (7x), [P1] Feedback Loop (7x), [P2] Scripts (7x)

## 2. KB Quality [OK]

- Files indexed: 2353
- Keywords: 9815
- TOPICS-INDEX.json: 529 KB
- KEYWORDS-INDEX.json: 4594 KB
- FILES-INDEX.json: 1364 KB
- Sample frontmatter check: 5/5 complete
  CONSOLIDATION-2026-02-09.md: complete
  trade-ideas/filters/Up10.md: complete
  amibroker/afl-functions/bbandbot.md: complete
  amibroker/afl-functions/guisetcolors.md: complete
  amibroker/kb/forum/2021-09-19-trading-system-design-how-parse-non-ohlc-json-file-amiquote-4-10-javascript-save-a.md: complete
- Topic clusters: 23

## 3. Memory Hygiene [!]

- Memory directory: 1173 files, 4.1 MB
- Daily logs: 97 total, 88 older than 14 days
- ACTION NEEDED: 88 old logs should be distilled into MEMORY.md and archived
- MEMORY.md: 69 lines, 11 KB

## 4. Script Inventory [!]

- Active scripts: 225 JS, 27 shell
  ab-drive-watcher.js: (no description)
  add-1min-bars-to-samples.js: (no description)
  add-frontmatter.js: (no description)
  trade-analyzer.js: (no description)
  analyze-bar-break-exits.js: (no description)
  append-catalysts-032626.js: (no description)
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
  backfill-r-multiple.js: (no description)
  backfill-slt-journal.js: Normalize strategy names for fuzzy matching 
  batch-playbook-032626.js: (no description)
  best-trades-analysis.js: (no description)
  build-baba-playbook.js: (no description)
  build-best-trades-v2.js: (no description)
  build-best-trades.js: (no description)
  build-category-charts.js: (no description)
  build-category-mc.js: (no description)
  build-comprehensive-slt-sheet.js: (no description)
  build-daily-breakout-index.js: (no description)
  build-drc-031926.js: (no description)
  build-drc-032026.js: (no description)
  build-drc-032326.js: (no description)
  build-drc-032426.js: (no description)
  build-drc-032526.js: (no description)
  build-drc-032626.js: (no description)
  build-drc-032726-v7.js: (no description)
  build-drc-032726.js: (no description)
  build-expenses-dashboard.js: Tabs 
  build-intraday-index.js: (no description)
  build-kb-index.js: (no description)
  build-mc-charts.js: (no description)
  build-monthly-review.js: unless[^.!?]
  build-orb-sheet.js: (no description)
  build-playbook-sample-032626.js: (no description)
  build-post-market-final.js: (no description)
  build-slt-sheet.js: (no description)
  build-strategy-charts.js: (no description)
  build-weekly-review-032026.js: (no description)
  build-weekly-review-032326-v2.js: (no description)
  build-weekly-review-032326.js: (no description)
  build-weekly-review-032826.js: (no description)
  build-weekly-review.js: unless[^.!?]
  catalyst-scanner-v5.js: (no description)
  catalyst-search.js: (no description)
  catalyst-watchlist.js: (no description)
  check-email.js: (no description)
  compare-gdrive-manifest.js: (no description)
  context-budget.js: (no description)
  context-compress.js: (no description)
  context7.js: (no description)
  create-bars-db.js: (no description)
  create-best-trades-monthly-db.js: (no description)
  cron-health-reporter.js: (no description)
  daily-learning.js: (no description)
  data-explore.js: (no description)
  dave-mabe-emails-to-notion.js: (no description)
  day2-populate.js: (no description)
  day2-refresh.js: (no description)
  detect-amnesia.js: (no description)
  detect-entry.js: (no description)
  discord-alpha-order.js: (no description)
  discord-channel-audit.js: (no description)
  drc-charts-fix.js: (no description)
  drc-charts-update-15min.js: (no description)
  drc-charts-upload.js: (no description)
  drc-iren-dedup.js: (no description)
  drc-to-playbook-032326.js: (no description)
  drc-to-playbook.js: (no description)
  drc-voice.js: (no description)
  drift-guard.js: (no description)
  embed-1min-bars.js: (no description)
  enrich-drc-catalysts.js: (no description)
  enrich-drc-video.js: (no description)
  enrich-drc-youtube.js: (no description)
  entity-ab-test.js: (no description)
  entity-backfill.js: (no description)
  entity-extract.js: (no description)
  entity-query.js: (no description)
  export-slt-csv.js: (no description)
  export-trade-journal.js: (no description)
  fash-late-exit-analysis.js: (no description)
  feedback-analyzer.js: (no description)
  fetch-1min-bars-orb.js: (no description)
  fetch-emails.js: (no description)
  finviz-api.js: (no description)
  fix-best-trades-images-v2.js: (no description)
  fix-drc-031726.js: already deleted 
  fix-images-resume.js: (no description)
  fix-mfe-mae.js: (no description)
  gdrive-find-new-files.js: (no description)
  gdrive-kb-sync-processor.js: (no description)
  gdrive-monitor.js: (no description)
  gdrive-sync-process.js: (no description)
  gdrive-sync-processor.js: (no description)
  gen-qqq-daily.js: (no description)
  generate-1d-charts.js: (no description)
  generate-drc.js: Format a UTC-stored datetime as ET time string HH:MM AM/PM 
  generate-trade-charts.js: (no description)
  health-monitor.js: (no description)
  iqfeed-fetch-with-retry.js: (no description)
  kanban-add.js: (no description)
  kanban-process-events.js: (no description)
  kb-update.js: (no description)
  lcm-health-snapshot.js: (no description)
  lcm-trial-scorer.js: ignore parse errors 
  discord-alert.js: (no description)
  mc-smoke-test.js: (no description)
  morning-intel-build.js: skip 
  morning-intel-report.js: (no description)
  notion-book-catalog.js: (no description)
  notion-dave-mabe-v2.js: (no description)
  notion-dave-mabe.js: (no description)
  notion-rebuild-pages.js: (no description)
  notion-reorder-pages.js: (no description)
  notion-reupload-charts.js: (no description)
  ofm-0323.js: (no description)
  ofm-reflect.js: (no description)
  ofm-rename.js: (no description)
  ofm-tweak.js: (no description)
  ofm-tweak2.js: (no description)
  oops-prefilter.js: (no description)
  open-loops-alert.js: (no description)
  open-loops.js: (no description)
  orb-category-analysis.js: (no description)
  orb-category-full.js: (no description)
  orb-chart-viewer.js: (no description)
  orb-mcpt.js: (no description)
  orb-wf-mcpt.js: (no description)
  output-watchdog.js: (no description)
  patch-chart-embed-mode.js: Embed mode 
  patch-charts-et-shading-v2.js: (no description)
  patch-charts-et-shading.js: (no description)
  patch-daily-charts-overlays.js: (no description)
  populate-slt-sheet.js: (no description)
  position-size.js: (no description)
  premarket-movers.js: (no description)
  proactive-analysis.js: (no description)
  process-emails-to-kb.js: (no description)
  read-tweet.js: (no description)
  rebuild-best-trades-page.js: (no description)
  rebuild-best-trades-summary.js: (no description)
  rebuild-best-trades-v2.js: (no description)
  regenerate-drc-charts.js: (no description)
  rr-calc.js: (no description)
  sanitize.js: (no description)
  scan-ticker-news.js: (no description)
  scrape-slt-backfill.js: (no description)
  scrape-slt-data.js: (no description)
  screenshot-charts-032626.js: (no description)
  security-scan.js: (no description)
  session-checkpoint.js: (no description)
  session-circuit-breaker.js: (no description)
  skill-eval.js: (no description)
  slim-samples-json.js: (no description)
  slim-versioned-charts.js: (no description)
  slt-backfill.js: (no description)
  slt-enrich.js: (no description)
  slt-playbook-enrich.js: (no description)
  spawn-with-retry-test.js: (no description)
  spawn-with-retry.js: (no description)
  strategy-cruncher.js: tabs 
  task-progress-cron.js: (no description)
  task-progress-heartbeat.js: (no description)
  task-progress-runner.js: (no description)
  task-progress.js: (no description)
  test-detect-entry.js: (no description)
  test-sanitize.js: (no description)
  test-task-progress.js: (no description)
  trade-import-full.js: (no description)
  backfill-slt.js: Extract ET hour + minute from open_datetime "YYYY-MM-DD HH:M
  compute-stats.js: (no description)
  db.js: (no description)
  enrich-mfe-mae.js: (no description)
  enrich-volume.js: (no description)
  export-dashboard.js: (no description)
  import-daily.js: (no description)
  import-das.js: (no description)
  import-slt.js: (no description)
  import-ti-alerts.js: (no description)
  import-tradervue.js: (no description)
  migrate-slt.js: (no description)
  queries.js: (no description)
  slt-enrich.js: (no description)
  slt-scraper.js: (no description)
  slt-store.js: Open a WAL-mode DB connection 
  slt-sync-json.js: (no description)
  validate-tags.js: (no description)
  trade-journal.js: (no description)
  build-sheet.js: (no description)
  build-unified.js: (no description)
  extract-trades.js: (no description)
  scrape-slt.js: (no description)
  update-manifest.js: Purpose 
  validate-morning-intel.js: (no description)
  vault.js: (no description)
  wip-tracker.js: (no description)
  working-memory.js: Returns the default empty structure 
  working-memory.test.js: (no description)
  stockfetcher-scanner.sh: (no description)
  auto-pull.sh: (no description)
  batch2-monitor.sh: (no description)
  download-notion-pdf.sh: (no description)
  gateway-restart.sh: (no description)
  git-pull-review.sh: (no description)
  health-check.sh: (no description)
  heartbeat-health-check.sh: (no description)
  lint-design-system.sh: #ef4444 
  mc-rebuild.sh: (no description)
  morning-intel-runner.sh: (no description)
  move-credentials.sh: (no description)
  nightly-backup.sh: (no description)
  nightly-optimization.sh: (no description)
  edge-pullout-2-2026-04-07.sh: (no description)
  edge-pullout-2-revised-2026-04-07.sh: (no description)
  edge-pullout-2026-04-07.sh: (no description)
  patch-chart-embed-mode.sh: Embed mode: hide header + legend when loaded with ?embed 
  pre-commit-check.sh: (no description)
  trading-books-batch2-phase1.sh: (no description)
  trading-books-batch2-phase2.sh: (no description)
  verify-build.sh: (no description)
  weekly-update.sh: (no description)
  worktree-agent.sh: (no description)
  worktree-cleanup.sh: (no description)
  worktree-merge.sh: (no description)
  x-watchlist-scan.sh: (no description)
- Version sprawl: build-best-trades (2 versions), build-drc-032726 (2 versions), build-weekly-review-032326 (2 versions), notion-dave-mabe (2 versions), patch-charts-et-shading (2 versions), slt-enrich (2 versions)
- Archived scripts: 6

## 5. Edge Intelligence Check [!]

- directives.md: 513 lines
  PASS: TOPICS-INDEX.json referenced
  PASS: KB-STANDARDS.md referenced
  PASS: kb-update.js referenced
  FAIL: KB-SEARCH.md referenced
  PASS: Model routing defined
  PASS: No legacy SEARCH-INDEX.json as primary
- FAIL: AGENTS.md missing git pull — Edge won't sync fixes
  FAIL: Git pull in heartbeat
  PASS: Knowledge capture loop
  PASS: KB-STANDARDS.md referenced
  PASS: kb-update.js referenced

## 6. Security [!!!]

- FOUND: Private Key in knowledge/gdrive-imports/gcp-sheets-service-account.md
- FOUND: GitHub Token in knowledge/gdrive-imports/github.md
- FOUND: Password in scripts/scrape-slt-backfill.js
- FOUND: Password in scripts/trade-journal/slt-enrich.js
- PASS: .credentials in .gitignore

## 7. Recommendations

1. [CRITICAL] 6. Security: FOUND: Private Key in knowledge/gdrive-imports/gcp-sheets-service-account.md
2. [FIX] 1. Audit Trends (Last 7 Days): Recurring warnings: [P1] Frontmatter (7x), [P1] Push Health (7x), [P1] Feedback Loop (7x), [P2] Scripts (7x)
3. [FIX] 3. Memory Hygiene: ACTION NEEDED: 88 old logs should be distilled into MEMORY.md and archived
4. [FIX] 4. Script Inventory: Version sprawl: build-best-trades (2 versions), build-drc-032726 (2 versions), build-weekly-review-032326 (2 versions), notion-dave-mabe (2 versions), patch-charts-et-shading (2 versions), slt-enrich (2 versions)
5. [FIX] 5. Edge Intelligence Check:   FAIL: KB-SEARCH.md referenced

---

*Generated by Oops weekly-review.js — 2026-05-01T17:00:11.204Z*
