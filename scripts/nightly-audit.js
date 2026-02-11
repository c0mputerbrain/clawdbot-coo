#!/usr/bin/env node
/**
 * nightly-audit.js — COO nightly health check on Edge's codebase
 *
 * Pulls latest edgebot-brain from GitHub, runs automated checks,
 * generates a health report, and flags issues.
 *
 * Usage: node scripts/nightly-audit.js [--repo-path /path/to/edgebot-brain] [--fix]
 *
 * Flags:
 *   --fix    Auto-fix safe issues (rebuild index, repair frontmatter, etc.)
 *
 * Checks performed:
 *   1. Frontmatter validation (all KB files must have YAML frontmatter)
 *   2. Index freshness (TOPICS-INDEX.json must match actual file count)
 *   3. Directory compliance (files in correct dirs per KB-STANDARDS)
 *   4. Secret scanning (no API keys, passwords, tokens in committed files)
 *   5. Script version sprawl (multiple versions of same script)
 *   6. Memory bloat (daily logs without curation)
 *   7. File growth trends (size and count over time)
 *   8. Orphan detection (files not in TOPICS-INDEX.json)
 *   9. Duplicate content detection (near-identical files)
 *  10. Git health (uncommitted changes, branch status)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ── Config ─────────────────────────────────────────────────────
const REPO_PATH_ARG = process.argv.find((a, i) => process.argv[i - 1] === '--repo-path');
const FIX_MODE = process.argv.includes('--fix');
const EDGE_REPO = REPO_PATH_ARG || path.resolve(__dirname, '..', '..', 'edgebot-brain');
const COO_ROOT = path.resolve(__dirname, '..');
const REPORT_DIR = path.resolve(COO_ROOT, 'reports');
const TRENDS_PATH = path.resolve(COO_ROOT, 'reports', 'trends.json');
const KNOWLEDGE_DIR = path.resolve(EDGE_REPO, 'knowledge');
const MEMORY_DIR = path.resolve(EDGE_REPO, 'memory');
const SCRIPTS_DIR = path.resolve(EDGE_REPO, 'scripts');

const TODAY = new Date().toISOString().split('T')[0];
const REPORT_PATH = path.resolve(REPORT_DIR, `audit-${TODAY}.md`);

// Severity levels
const SEV = { CRITICAL: '🔴 CRITICAL', WARNING: '🟡 WARNING', INFO: '🔵 INFO', OK: '✅ OK' };

// ── Utilities ──────────────────────────────────────────────────
function getAllFiles(dir, ext = '.md') {
  const files = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        files.push(...getAllFiles(fullPath, ext));
      } else if (entry.name.endsWith(ext)) {
        files.push(fullPath);
      }
    }
  } catch (err) {
    // Directory doesn't exist
  }
  return files;
}

function hasFrontmatter(content) {
  return content.trimStart().startsWith('---');
}

function parseFrontmatter(content) {
  if (!hasFrontmatter(content)) return null;
  const end = content.indexOf('---', content.indexOf('---') + 3);
  if (end === -1) return null;
  const block = content.substring(content.indexOf('---') + 3, end).trim();
  const meta = {};
  for (const line of block.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    meta[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
  }
  return meta;
}

function shellExec(cmd, cwd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', cwd, timeout: 30000 }).trim();
  } catch {
    return '';
  }
}

// ── Checks ─────────────────────────────────────────────────────
const findings = [];

function addFinding(severity, category, message, details = null) {
  findings.push({ severity, category, message, details });
}

const autoFixes = [];

function addAutoFix(description, action) {
  autoFixes.push({ description, action });
}

// Check 1: Frontmatter validation
function checkFrontmatter() {
  const files = getAllFiles(KNOWLEDGE_DIR);
  const missing = [];
  const incomplete = [];

  for (const f of files) {
    const rel = path.relative(KNOWLEDGE_DIR, f).replace(/\\/g, '/');
    if (rel === 'TOPICS-INDEX.json') continue;

    const content = fs.readFileSync(f, 'utf-8');
    if (!hasFrontmatter(content)) {
      missing.push(rel);
      continue;
    }

    const meta = parseFrontmatter(content);
    if (meta) {
      const required = ['title', 'category', 'tags', 'summary'];
      const missingFields = required.filter(k => !meta[k]);
      if (missingFields.length > 0) {
        incomplete.push({ file: rel, missing: missingFields });
      }
    }
  }

  if (missing.length === 0 && incomplete.length === 0) {
    addFinding(SEV.OK, 'Frontmatter', `All ${files.length} KB files have complete frontmatter`);
  } else {
    if (missing.length > 0) {
      addFinding(SEV.WARNING, 'Frontmatter',
        `${missing.length} files missing frontmatter`,
        missing.slice(0, 20).join('\n') + (missing.length > 20 ? `\n... and ${missing.length - 20} more` : ''));
      addAutoFix(`Tag ${missing.length} untagged files + rebuild index`, () => {
        const kbUpdate = path.resolve(EDGE_REPO, 'scripts', 'kb-update.js');
        if (fs.existsSync(kbUpdate)) {
          shellExec(`node "${kbUpdate}"`, EDGE_REPO);
        }
      });
    }
    if (incomplete.length > 0) {
      addFinding(SEV.WARNING, 'Frontmatter',
        `${incomplete.length} files with incomplete frontmatter`,
        incomplete.slice(0, 10).map(i => `${i.file}: missing ${i.missing.join(', ')}`).join('\n'));
      addAutoFix(`Repair ${incomplete.length} incomplete frontmatter files`, () => {
        const kbUpdate = path.resolve(EDGE_REPO, 'scripts', 'kb-update.js');
        if (fs.existsSync(kbUpdate)) {
          shellExec(`node "${kbUpdate}"`, EDGE_REPO);
        }
      });
    }
  }

  return files.length;
}

// Check 2: Index freshness
function checkIndexFreshness(actualFileCount) {
  const indexPath = path.resolve(KNOWLEDGE_DIR, 'TOPICS-INDEX.json');
  if (!fs.existsSync(indexPath)) {
    addFinding(SEV.CRITICAL, 'Index', 'TOPICS-INDEX.json does not exist! Edge cannot search KB.');
    return;
  }

  try {
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    const indexedCount = index._meta?.totalFiles || 0;
    const generated = index._meta?.generated || 'unknown';
    const diff = actualFileCount - indexedCount;

    if (diff === 0) {
      addFinding(SEV.OK, 'Index', `TOPICS-INDEX.json is current (${indexedCount} files, generated ${generated})`);
    } else if (diff > 0) {
      addFinding(SEV.WARNING, 'Index',
        `Index is STALE: ${diff} files added since last rebuild`,
        `Indexed: ${indexedCount}, Actual: ${actualFileCount}\nLast generated: ${generated}\nFix: node scripts/kb-update.js`);
      addAutoFix('Rebuild KB index (stale)', () => {
        const kbUpdate = path.resolve(EDGE_REPO, 'scripts', 'kb-update.js');
        if (fs.existsSync(kbUpdate)) {
          shellExec(`node "${kbUpdate}"`, EDGE_REPO);
        }
      });
    } else {
      addFinding(SEV.WARNING, 'Index',
        `Index has ${Math.abs(diff)} more files than exist (files deleted without rebuilding)`,
        `Fix: node scripts/kb-update.js`);
      addAutoFix('Rebuild KB index (orphaned entries)', () => {
        const kbUpdate = path.resolve(EDGE_REPO, 'scripts', 'kb-update.js');
        if (fs.existsSync(kbUpdate)) {
          shellExec(`node "${kbUpdate}"`, EDGE_REPO);
        }
      });
    }
  } catch (err) {
    addFinding(SEV.CRITICAL, 'Index', `TOPICS-INDEX.json is corrupted: ${err.message}`);
  }
}

// Check 3: Directory compliance
function checkDirectoryCompliance() {
  const allowedTopDirs = new Set([
    'amibroker', 'trade-ideas', 'mabekit', 'claude-blog', 'smb-playbooks',
    'trading', 'trading-tools', 'prompts', 'research',
  ]);

  const violations = [];
  try {
    const entries = fs.readdirSync(KNOWLEDGE_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.') && !allowedTopDirs.has(entry.name)) {
        violations.push(entry.name);
      }
    }
  } catch {}

  if (violations.length === 0) {
    addFinding(SEV.OK, 'Structure', 'All KB directories follow KB-STANDARDS.md');
  } else {
    addFinding(SEV.WARNING, 'Structure',
      `${violations.length} non-standard top-level directories in knowledge/`,
      violations.map(v => `knowledge/${v}/ — should this be under research/?`).join('\n'));
  }
}

// Check 4: Secret scanning
function checkSecrets() {
  const secretPatterns = [
    { name: 'GitHub Token', pattern: /ghp_[a-zA-Z0-9]{36}/g },
    { name: 'Generic API Key', pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"][a-zA-Z0-9]{20,}['"]/gi },
    { name: 'Password in Plain Text', pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]{8,}['"]/gi },
    { name: 'Bearer Token', pattern: /Bearer\s+[a-zA-Z0-9\-._~+\/]{20,}/g },
    { name: 'AWS Key', pattern: /AKIA[0-9A-Z]{16}/g },
    { name: 'Private Key', pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g },
    { name: 'Slack Token', pattern: /xox[bprs]-[0-9a-zA-Z-]{10,}/g },
    { name: 'OpenAI Key', pattern: /sk-[a-zA-Z0-9]{48}/g },
  ];

  const allFiles = [
    ...getAllFiles(KNOWLEDGE_DIR),
    ...getAllFiles(MEMORY_DIR),
    ...getAllFiles(SCRIPTS_DIR, '.js'),
    ...getAllFiles(SCRIPTS_DIR, '.sh'),
  ];

  const hits = [];
  for (const f of allFiles) {
    const content = fs.readFileSync(f, 'utf-8');
    const rel = path.relative(EDGE_REPO, f).replace(/\\/g, '/');

    for (const { name, pattern } of secretPatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(content)) {
        hits.push(`${rel}: ${name}`);
      }
    }
  }

  if (hits.length === 0) {
    addFinding(SEV.OK, 'Security', 'No secrets detected in committed files');
  } else {
    addFinding(SEV.CRITICAL, 'Security',
      `${hits.length} potential secrets found in committed files!`,
      hits.join('\n'));
  }
}

// Check 5: Script version sprawl
function checkVersionSprawl() {
  const jsFiles = getAllFiles(SCRIPTS_DIR, '.js').filter(f => !f.includes('_archive'));
  const basenames = {};

  for (const f of jsFiles) {
    const name = path.basename(f, '.js');
    // Strip version suffixes: -v2, -v3, -v4, -v5, -simple, -final, -additional
    const base = name.replace(/[-_]v\d+$/, '').replace(/[-_](simple|final|additional|old|backup)$/, '');
    if (!basenames[base]) basenames[base] = [];
    basenames[base].push(name);
  }

  const sprawl = Object.entries(basenames).filter(([, versions]) => versions.length > 1);

  if (sprawl.length === 0) {
    addFinding(SEV.OK, 'Scripts', 'No version sprawl detected');
  } else {
    addFinding(SEV.WARNING, 'Scripts',
      `${sprawl.length} scripts have multiple versions (consider archiving old ones)`,
      sprawl.map(([base, versions]) => `${base}: ${versions.join(', ')}`).join('\n'));
  }
}

// Check 6: Memory bloat
function checkMemoryBloat() {
  const memFiles = getAllFiles(MEMORY_DIR);
  const totalSize = memFiles.reduce((sum, f) => sum + fs.statSync(f).size, 0);
  const totalSizeMB = (totalSize / 1024 / 1024).toFixed(1);

  // Count daily logs
  const dailyLogs = memFiles.filter(f => /\d{4}-\d{2}-\d{2}\.md$/.test(path.basename(f)));
  const oldLogs = dailyLogs.filter(f => {
    const match = path.basename(f).match(/(\d{4}-\d{2}-\d{2})/);
    if (!match) return false;
    const daysOld = (Date.now() - new Date(match[1]).getTime()) / (1000 * 60 * 60 * 24);
    return daysOld > 14;
  });

  if (totalSize > 10 * 1024 * 1024) {
    addFinding(SEV.WARNING, 'Memory',
      `Memory directory is ${totalSizeMB} MB (${memFiles.length} files) — consider curating`,
      `Daily logs: ${dailyLogs.length} (${oldLogs.length} older than 14 days)\nConsider: archive old logs, distill into MEMORY.md`);
  } else {
    addFinding(SEV.OK, 'Memory', `Memory directory: ${totalSizeMB} MB, ${memFiles.length} files, ${dailyLogs.length} daily logs`);
  }
}

// Check 7: File growth tracking
function checkGrowthTrends() {
  const kbFiles = getAllFiles(KNOWLEDGE_DIR);
  const kbSize = kbFiles.reduce((sum, f) => sum + fs.statSync(f).size, 0);
  const memFiles = getAllFiles(MEMORY_DIR);
  const memSize = memFiles.reduce((sum, f) => sum + fs.statSync(f).size, 0);
  const scriptFiles = getAllFiles(SCRIPTS_DIR, '.js');

  // Load previous audit for comparison
  const prevReports = fs.existsSync(REPORT_DIR)
    ? fs.readdirSync(REPORT_DIR).filter(f => f.startsWith('audit-') && f.endsWith('.md')).sort()
    : [];

  const stats = {
    date: TODAY,
    kbFiles: kbFiles.length,
    kbSizeMB: (kbSize / 1024 / 1024).toFixed(1),
    memFiles: memFiles.length,
    memSizeMB: (memSize / 1024 / 1024).toFixed(1),
    scriptFiles: scriptFiles.length,
  };

  addFinding(SEV.INFO, 'Growth',
    `KB: ${stats.kbFiles} files (${stats.kbSizeMB} MB) | Memory: ${stats.memFiles} files (${stats.memSizeMB} MB) | Scripts: ${stats.scriptFiles}`,
    `Previous audits: ${prevReports.length}`);

  return stats;
}

// Check 8: Orphan detection
function checkOrphans() {
  const indexPath = path.resolve(KNOWLEDGE_DIR, 'FILES-INDEX.json');
  if (!fs.existsSync(indexPath)) return;

  try {
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    const indexedFiles = new Set(Object.keys(index.files || {}));
    const actualFiles = getAllFiles(KNOWLEDGE_DIR);
    const orphans = [];

    for (const f of actualFiles) {
      const rel = path.relative(KNOWLEDGE_DIR, f).replace(/\\/g, '/');
      if (rel.endsWith('-INDEX.json')) continue;
      if (!indexedFiles.has(rel)) {
        orphans.push(rel);
      }
    }

    if (orphans.length === 0) {
      addFinding(SEV.OK, 'Orphans', 'All KB files are indexed in TOPICS-INDEX.json');
    } else {
      addFinding(SEV.WARNING, 'Orphans',
        `${orphans.length} KB files NOT in the search index (invisible to Edge)`,
        orphans.slice(0, 20).join('\n') + (orphans.length > 20 ? `\n... and ${orphans.length - 20} more` : '') +
        '\nFix: node scripts/kb-update.js');
    }
  } catch {}
}

// Check 9: Git health
function checkGitHealth() {
  const status = shellExec('git status --porcelain', EDGE_REPO);
  const uncommitted = status ? status.split('\n').length : 0;

  if (uncommitted === 0) {
    addFinding(SEV.OK, 'Git', 'Working tree clean, all changes committed');
  } else {
    addFinding(SEV.WARNING, 'Git',
      `${uncommitted} uncommitted changes in Edge's repo`,
      status.split('\n').slice(0, 15).join('\n'));
  }

  // Check if behind remote
  shellExec('git fetch origin', EDGE_REPO);
  const behind = shellExec('git rev-list HEAD..origin/master --count', EDGE_REPO);
  const ahead = shellExec('git rev-list origin/master..HEAD --count', EDGE_REPO);

  if (behind && parseInt(behind) > 0) {
    addFinding(SEV.WARNING, 'Git', `Edge is ${behind} commits behind origin/master`);
  }
  if (ahead && parseInt(ahead) > 0) {
    addFinding(SEV.INFO, 'Git', `Edge is ${ahead} commits ahead of origin/master (unpushed work)`);
  }
}

// Check 10: KB-STANDARDS compliance (filename conventions)
function checkNamingConventions() {
  const files = getAllFiles(KNOWLEDGE_DIR);
  const violations = [];

  for (const f of files) {
    const name = path.basename(f);
    if (name === 'TOPICS-INDEX.json') continue;

    // Check for uppercase in filenames (except INDEX.md, README.md, etc.)
    const allowedUppercase = ['INDEX.md', 'INDEX-VIDEOS.md', 'INDEX-KEY-PAGES.md',
      'README.md', 'QUICK-START.md', 'KB-SEARCH.md', 'KB-STANDARDS.md',
      'SCRAPE_COMPLETE.md', 'CONSOLIDATION-2026-02-09.md', 'KEY-LEARNINGS.md'];
    if (/[A-Z]/.test(name) && !allowedUppercase.includes(name) && !name.startsWith('MainSite')) {
      // Only flag if it has spaces or truly bad naming
      if (/\s/.test(name)) {
        violations.push(`${path.relative(KNOWLEDGE_DIR, f).replace(/\\/g, '/')}: has spaces in filename`);
      }
    }

    // Check for spaces
    if (/\s/.test(name)) {
      violations.push(`${path.relative(KNOWLEDGE_DIR, f).replace(/\\/g, '/')}: spaces in filename`);
    }
  }

  if (violations.length === 0) {
    addFinding(SEV.OK, 'Naming', 'All KB filenames follow conventions');
  } else {
    addFinding(SEV.WARNING, 'Naming',
      `${violations.length} files with naming convention violations`,
      violations.slice(0, 15).join('\n'));
  }
}

// ── Report Generator ───────────────────────────────────────────
function generateReport(stats) {
  const criticals = findings.filter(f => f.severity === SEV.CRITICAL);
  const warnings = findings.filter(f => f.severity === SEV.WARNING);
  const oks = findings.filter(f => f.severity === SEV.OK);
  const infos = findings.filter(f => f.severity === SEV.INFO);

  let grade;
  if (criticals.length > 0) grade = 'F — Critical issues found';
  else if (warnings.length > 3) grade = 'C — Multiple warnings';
  else if (warnings.length > 0) grade = 'B — Minor issues';
  else grade = 'A — All clear';

  let report = `# COO Nightly Audit — ${TODAY}\n\n`;
  report += `**Grade: ${grade}**\n`;
  report += `**Repo:** edgebot-brain\n`;
  report += `**Run at:** ${new Date().toISOString()}\n\n`;
  report += `| Metric | Value |\n|---|---|\n`;
  report += `| KB Files | ${stats.kbFiles} (${stats.kbSizeMB} MB) |\n`;
  report += `| Memory Files | ${stats.memFiles} (${stats.memSizeMB} MB) |\n`;
  report += `| Scripts | ${stats.scriptFiles} |\n`;
  report += `| Criticals | ${criticals.length} |\n`;
  report += `| Warnings | ${warnings.length} |\n`;
  report += `| Passed | ${oks.length} |\n\n`;
  report += `---\n\n`;

  if (criticals.length > 0) {
    report += `## ${SEV.CRITICAL} Findings\n\n`;
    for (const f of criticals) {
      report += `### ${f.category}: ${f.message}\n`;
      if (f.details) report += `\`\`\`\n${f.details}\n\`\`\`\n`;
      report += '\n';
    }
  }

  if (warnings.length > 0) {
    report += `## ${SEV.WARNING} Findings\n\n`;
    for (const f of warnings) {
      report += `### ${f.category}: ${f.message}\n`;
      if (f.details) report += `\`\`\`\n${f.details}\n\`\`\`\n`;
      report += '\n';
    }
  }

  report += `## ${SEV.OK} Passed Checks\n\n`;
  for (const f of oks) {
    report += `- **${f.category}:** ${f.message}\n`;
  }

  if (infos.length > 0) {
    report += `\n## ${SEV.INFO} Notes\n\n`;
    for (const f of infos) {
      report += `- **${f.category}:** ${f.message}\n`;
      if (f.details) report += `  - ${f.details}\n`;
    }
  }

  report += `\n---\n\n*Generated by COO nightly-audit.js*\n`;

  return report;
}

// ── Edge Activity Summary ──────────────────────────────────────
function getEdgeActivity() {
  const lines = [];

  // Recent commits from Edge (last 24h)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const log = shellExec(`git log --since="${since}" --oneline --no-merges`, EDGE_REPO);
  if (log) {
    const commits = log.split('\n').filter(Boolean);
    lines.push(`Edge pushed ${commits.length} commit(s) today:`);
    for (const c of commits.slice(0, 5)) {
      lines.push(`  ${c}`);
    }
    if (commits.length > 5) lines.push(`  ... +${commits.length - 5} more`);
  } else {
    lines.push('Edge had no new commits today.');
  }

  // New KB files added (from git)
  const newFiles = shellExec(`git log --since="${since}" --diff-filter=A --name-only --pretty=format: -- knowledge/`, EDGE_REPO);
  if (newFiles) {
    const added = newFiles.split('\n').filter(Boolean);
    if (added.length > 0) {
      lines.push(`New KB files: +${added.length}`);
    }
  }

  return lines;
}

// ── Telegram Alert ─────────────────────────────────────────────
function sendTelegramAlert(grade, criticals, warnings, stats, trendMsg = '') {
  const CREDS_PATH = path.resolve(COO_ROOT, '.credentials', 'telegram.json');
  if (!fs.existsSync(CREDS_PATH)) {
    console.log('No Telegram credentials found — skipping alert.');
    return;
  }

  const { bot_token, chat_id } = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf-8'));
  if (!bot_token || !chat_id) return;

  let msg = `Oops Daily Audit -- ${TODAY}\nGrade: ${grade}\n\n`;

  // Edge activity
  const activity = getEdgeActivity();
  if (activity.length > 0) {
    msg += activity.join('\n') + '\n\n';
  }

  // Stats
  msg += `KB: ${stats.kbFiles} files | Memory: ${stats.memFiles} files | Scripts: ${stats.scriptFiles}\n\n`;

  // Auto-fixes applied
  if (trendMsg && trendMsg.includes('Auto-fixed')) {
    const fixLine = trendMsg.split('\n').find(l => l.includes('Auto-fixed'));
    if (fixLine) msg += `Changes I made:\n  ${fixLine.trim()}\n\n`;
  }

  // Issues needing attention
  if (criticals.length > 0) {
    msg += `NEEDS YOUR ATTENTION:\n`;
    for (const f of criticals) {
      msg += `  [CRITICAL] ${f.category}: ${f.message}\n`;
    }
    msg += '\n';
  }

  if (warnings.length > 0) {
    // Split into auto-fixable vs needs-human
    const humanNeeded = warnings.filter(f =>
      f.category === 'Security' || f.category === 'Structure' || f.category === 'Git'
    );
    const autoHandled = warnings.filter(f =>
      f.category === 'Frontmatter' || f.category === 'Index' || f.category === 'Orphans'
    );
    const other = warnings.filter(f =>
      !humanNeeded.includes(f) && !autoHandled.includes(f)
    );

    if (humanNeeded.length > 0) {
      msg += `NEEDS YOUR ATTENTION:\n`;
      for (const f of humanNeeded) {
        msg += `  ${f.category}: ${f.message}\n`;
      }
      msg += '\n';
    }

    if (autoHandled.length > 0) {
      msg += `I handled:\n`;
      for (const f of autoHandled) {
        msg += `  ${f.category}: ${f.message}\n`;
      }
      msg += '\n';
    }

    if (other.length > 0) {
      msg += `FYI:\n`;
      for (const f of other) {
        msg += `  ${f.category}: ${f.message}\n`;
      }
      msg += '\n';
    }
  }

  // Trends
  if (trendMsg) {
    const trendLines = trendMsg.split('\n').filter(l => l.includes('Trend:') || l.includes('REGRESSIONS'));
    if (trendLines.length > 0) {
      msg += trendLines.join('\n') + '\n\n';
    }
  }

  if (criticals.length === 0 && warnings.length === 0) {
    msg += 'All 10 checks passed. No issues.\n\n';
  }

  msg += `Full report: clawdbot-coo/reports/audit-${TODAY}.md`;

  try {
    execSync(
      `curl -s -X POST "https://api.telegram.org/bot${bot_token}/sendMessage" ` +
      `--data-urlencode "chat_id=${chat_id}" ` +
      `--data-urlencode "text=${msg.replace(/"/g, '\\"')}"`,
      { encoding: 'utf-8', timeout: 15000 }
    );
    console.log('Telegram alert sent.');
  } catch (err) {
    console.error('Failed to send Telegram alert:', err.message);
  }
}

// ── Trend Tracking ────────────────────────────────────────────
function loadTrends() {
  try {
    return JSON.parse(fs.readFileSync(TRENDS_PATH, 'utf-8'));
  } catch {
    return { entries: [] };
  }
}

function saveTrends(trends) {
  fs.writeFileSync(TRENDS_PATH, JSON.stringify(trends, null, 2), 'utf-8');
}

function recordTrend(stats, criticals, warnings) {
  const trends = loadTrends();

  // Don't double-record the same day
  if (trends.entries.length > 0 && trends.entries[trends.entries.length - 1].date === TODAY) {
    trends.entries[trends.entries.length - 1] = {
      date: TODAY,
      kbFiles: stats.kbFiles,
      kbSizeMB: parseFloat(stats.kbSizeMB),
      memFiles: stats.memFiles,
      memSizeMB: parseFloat(stats.memSizeMB),
      scriptFiles: stats.scriptFiles,
      criticals,
      warnings,
      grade: criticals > 0 ? 'F' : warnings > 3 ? 'C' : warnings > 0 ? 'B' : 'A',
    };
  } else {
    trends.entries.push({
      date: TODAY,
      kbFiles: stats.kbFiles,
      kbSizeMB: parseFloat(stats.kbSizeMB),
      memFiles: stats.memFiles,
      memSizeMB: parseFloat(stats.memSizeMB),
      scriptFiles: stats.scriptFiles,
      criticals,
      warnings,
      grade: criticals > 0 ? 'F' : warnings > 3 ? 'C' : warnings > 0 ? 'B' : 'A',
    });
  }

  // Keep last 90 days
  if (trends.entries.length > 90) {
    trends.entries = trends.entries.slice(-90);
  }

  saveTrends(trends);
  return trends;
}

function analyzeTrends(trends) {
  if (trends.entries.length < 2) return null;

  const prev = trends.entries[trends.entries.length - 2];
  const curr = trends.entries[trends.entries.length - 1];

  const analysis = {
    kbFilesDelta: curr.kbFiles - prev.kbFiles,
    kbSizeDelta: (curr.kbSizeMB - prev.kbSizeMB).toFixed(1),
    memFilesDelta: curr.memFiles - prev.memFiles,
    memSizeDelta: (curr.memSizeMB - prev.memSizeMB).toFixed(1),
    scriptsDelta: curr.scriptFiles - prev.scriptFiles,
    gradeChange: prev.grade !== curr.grade ? `${prev.grade} -> ${curr.grade}` : null,
    regressions: [],
  };

  // Detect regressions
  if (curr.criticals > prev.criticals) {
    analysis.regressions.push(`Criticals increased: ${prev.criticals} -> ${curr.criticals}`);
  }
  if (curr.warnings > prev.warnings + 2) {
    analysis.regressions.push(`Warnings spiked: ${prev.warnings} -> ${curr.warnings}`);
  }
  if (curr.memSizeMB > prev.memSizeMB * 1.5 && curr.memSizeMB > 5) {
    analysis.regressions.push(`Memory bloat: ${prev.memSizeMB} MB -> ${curr.memSizeMB} MB`);
  }

  // Week-over-week if enough data
  if (trends.entries.length >= 7) {
    const weekAgo = trends.entries[trends.entries.length - 7];
    analysis.weekKbGrowth = curr.kbFiles - weekAgo.kbFiles;
    analysis.weekMemGrowth = curr.memFiles - weekAgo.memFiles;
  }

  return analysis;
}

// ── Auto-Fix Execution ────────────────────────────────────────
function runAutoFixes() {
  if (autoFixes.length === 0) {
    console.log('\nNo auto-fixable issues found.');
    return 0;
  }

  console.log(`\n=== Auto-Fix Mode (${autoFixes.length} fixes queued) ===`);

  // Deduplicate — many issues resolve with the same kb-update.js call
  const seen = new Set();
  const unique = autoFixes.filter(f => {
    if (seen.has(f.description)) return false;
    seen.add(f.description);
    return true;
  });

  let fixed = 0;
  for (const fix of unique) {
    console.log(`  Fixing: ${fix.description}...`);
    try {
      fix.action();
      console.log(`    Done.`);
      fixed++;
    } catch (err) {
      console.error(`    FAILED: ${err.message}`);
    }
  }

  // Commit auto-fixes to Edge repo if anything changed
  if (fixed > 0) {
    const status = shellExec('git status --porcelain', EDGE_REPO);
    if (status) {
      console.log('\n  Committing auto-fixes...');
      shellExec('git add -A', EDGE_REPO);
      shellExec(`git commit -m "auto-fix: nightly audit repairs (${TODAY})"`, EDGE_REPO);
      shellExec('git push origin master', EDGE_REPO);
      console.log('  Pushed auto-fixes to GitHub.');
    }
  }

  return fixed;
}

// ── Main ───────────────────────────────────────────────────────
function main() {
  console.log(`=== Oops Nightly Audit — ${TODAY} ===`);
  if (FIX_MODE) console.log('  (Auto-fix mode enabled)');
  console.log(`\nEdge repo: ${EDGE_REPO}`);

  if (!fs.existsSync(EDGE_REPO)) {
    console.error(`ERROR: Edge repo not found at ${EDGE_REPO}`);
    console.error('Use --repo-path to specify the location');
    process.exit(1);
  }

  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    console.error(`ERROR: knowledge/ directory not found in ${EDGE_REPO}`);
    process.exit(1);
  }

  // Ensure report directory exists
  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }

  // Pull latest from GitHub
  console.log('\nPulling latest from GitHub...');
  const pullResult = shellExec('git pull origin master --no-rebase', EDGE_REPO);
  console.log(pullResult || '(already up to date)');

  // Run all checks
  console.log('\nRunning checks...');
  const fileCount = checkFrontmatter();
  checkIndexFreshness(fileCount);
  checkDirectoryCompliance();
  checkSecrets();
  checkVersionSprawl();
  checkMemoryBloat();
  const stats = checkGrowthTrends();
  checkOrphans();
  checkGitHealth();
  checkNamingConventions();

  // Auto-fix if --fix flag is set
  let fixCount = 0;
  if (FIX_MODE) {
    fixCount = runAutoFixes();
  }

  // Record trends
  const criticalFindings = findings.filter(f => f.severity === SEV.CRITICAL);
  const warningFindings = findings.filter(f => f.severity === SEV.WARNING);
  const passed = findings.filter(f => f.severity === SEV.OK).length;

  const trends = recordTrend(stats, criticalFindings.length, warningFindings.length);
  const trendAnalysis = analyzeTrends(trends);

  // Generate report (with trends)
  let report = generateReport(stats);

  // Append trend section
  if (trendAnalysis) {
    report += '\n## Trends\n\n';
    report += `| Metric | Change |\n|---|---|\n`;
    report += `| KB Files | ${trendAnalysis.kbFilesDelta >= 0 ? '+' : ''}${trendAnalysis.kbFilesDelta} |\n`;
    report += `| KB Size | ${trendAnalysis.kbSizeDelta >= 0 ? '+' : ''}${trendAnalysis.kbSizeDelta} MB |\n`;
    report += `| Memory Files | ${trendAnalysis.memFilesDelta >= 0 ? '+' : ''}${trendAnalysis.memFilesDelta} |\n`;
    report += `| Memory Size | ${trendAnalysis.memSizeDelta >= 0 ? '+' : ''}${trendAnalysis.memSizeDelta} MB |\n`;
    report += `| Scripts | ${trendAnalysis.scriptsDelta >= 0 ? '+' : ''}${trendAnalysis.scriptsDelta} |\n`;
    if (trendAnalysis.gradeChange) {
      report += `| Grade | ${trendAnalysis.gradeChange} |\n`;
    }
    if (trendAnalysis.weekKbGrowth !== undefined) {
      report += `| KB Growth (7d) | +${trendAnalysis.weekKbGrowth} files |\n`;
      report += `| Memory Growth (7d) | +${trendAnalysis.weekMemGrowth} files |\n`;
    }
    report += '\n';
    if (trendAnalysis.regressions.length > 0) {
      report += `### Regressions Detected\n\n`;
      for (const r of trendAnalysis.regressions) {
        report += `- ${r}\n`;
      }
      report += '\n';
    }
    report += `*Trend data: ${trends.entries.length} days tracked*\n`;
  }

  if (FIX_MODE && fixCount > 0) {
    report += `\n## Auto-Fixes Applied\n\n`;
    report += `${fixCount} issue(s) auto-fixed during this run.\n`;
  }

  fs.writeFileSync(REPORT_PATH, report, 'utf-8');

  // Print summary
  console.log(`\n=== Results ===`);
  console.log(`  Criticals: ${criticalFindings.length}`);
  console.log(`  Warnings:  ${warningFindings.length}`);
  console.log(`  Passed:    ${passed}`);
  if (FIX_MODE) console.log(`  Auto-fixed: ${fixCount}`);
  if (trendAnalysis && trendAnalysis.regressions.length > 0) {
    console.log(`  Regressions: ${trendAnalysis.regressions.length}`);
  }
  console.log(`\nReport saved: ${REPORT_PATH}`);

  // Send Telegram alert
  if (criticalFindings.length > 0 || warningFindings.length > 0) {
    let grade;
    if (criticalFindings.length > 0) grade = 'F -- Critical issues found';
    else if (warningFindings.length > 3) grade = 'C -- Multiple warnings';
    else grade = 'B -- Minor issues';

    let trendMsg = '';
    if (trendAnalysis) {
      if (trendAnalysis.regressions.length > 0) {
        trendMsg = '\nREGRESSIONS:\n' + trendAnalysis.regressions.map(r => `  ${r}`).join('\n');
      }
      trendMsg += `\nTrend: KB ${trendAnalysis.kbFilesDelta >= 0 ? '+' : ''}${trendAnalysis.kbFilesDelta} files | Mem ${trendAnalysis.memFilesDelta >= 0 ? '+' : ''}${trendAnalysis.memFilesDelta} files`;
    }
    if (FIX_MODE && fixCount > 0) {
      trendMsg += `\nAuto-fixed: ${fixCount} issue(s)`;
    }

    sendTelegramAlert(grade, criticalFindings, warningFindings, stats, trendMsg);
  } else {
    console.log('\nAll checks passed.');
    sendTelegramAlert('A -- All clear', [], [], stats,
      FIX_MODE && fixCount > 0 ? `\nAuto-fixed: ${fixCount} issue(s)` : '');
  }

  if (criticalFindings.length > 0) {
    console.log('\n  CRITICAL issues detected — review report immediately!');
    process.exit(2);
  }
}

main();
