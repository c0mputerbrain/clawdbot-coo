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
 *   4. Full security audit (secrets + deep scan for injection/exfiltration/hidden content)
 *   5. Script version sprawl (multiple versions of same script)
 *   6. Memory bloat (daily logs without curation)
 *   7. File growth trends (size and count over time)
 *   8. Orphan detection (files not in TOPICS-INDEX.json)
 *   9. Git health (uncommitted changes, branch status)
 *  10. Filename naming conventions (KB-STANDARDS compliance)
 *  11. Tag quality (tag count, consistency, orphan tags)
 *  12. Memory curation (daily log bloat, core memory freshness, distillation)
 *  13. Index search coverage (files indexed but unreachable via search)
 *  14. Cron health (Edge cron job failures and circuit breakers)
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

// Check 4: Full security audit
function checkSecrets() {
  // ── Layer 1: Secret/credential pattern scanning ──
  const secretPatterns = [
    // Original patterns
    { name: 'GitHub Token', pattern: /ghp_[a-zA-Z0-9]{36}/g },
    { name: 'Generic API Key', pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"][a-zA-Z0-9]{20,}['"]/gi },
    { name: 'Password in Plain Text', pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]{8,}['"]/gi },
    { name: 'Bearer Token', pattern: /Bearer\s+[a-zA-Z0-9\-._~+\/]{20,}/g },
    { name: 'AWS Key', pattern: /AKIA[0-9A-Z]{16}/g },
    { name: 'Private Key', pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g },
    { name: 'Slack Token', pattern: /xox[bprs]-[0-9a-zA-Z-]{10,}/g },
    { name: 'OpenAI Key', pattern: /sk-[a-zA-Z0-9]{48}/g },
    // New patterns
    { name: 'Telegram Bot Token', pattern: /\b\d{8,10}:[a-zA-Z0-9_-]{35}\b/g },
    { name: 'Anthropic API Key', pattern: /sk-ant-[a-zA-Z0-9-]{20,}/g },
    { name: 'Google OAuth Client Secret', pattern: /(?:client_secret|client-secret)\s*[:=]\s*['"][a-zA-Z0-9_-]{20,}['"]/gi },
    { name: 'Google OAuth Token', pattern: /ya29\.[a-zA-Z0-9_-]{50,}/g },
    { name: 'MongoDB Connection String', pattern: /mongodb(?:\+srv)?:\/\/[^'"` \n]{10,}/gi },
    { name: 'PostgreSQL Connection String', pattern: /postgres(?:ql)?:\/\/[^'"` \n]{10,}/gi },
    { name: 'Redis Connection String', pattern: /redis:\/\/[^'"` \n]{10,}/gi },
    { name: 'JWT Token', pattern: /eyJ[a-zA-Z0-9_-]{20,}\.eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/g },
    { name: 'Generic Secret Assignment', pattern: /(?:secret|token|auth_key|access_key)\s*[:=]\s*['"][a-zA-Z0-9\/+_-]{20,}['"]/gi },
    { name: 'URL with Embedded Credentials', pattern: /https?:\/\/[^:'"` \n]+:[^@'"` \n]+@[^'"` \n]+/gi },
    { name: 'Cloudflare Token', pattern: /(?:cf_|cloudflare[_-]?)(?:api[_-]?)?(?:token|key)\s*[:=]\s*['"][a-zA-Z0-9_-]{20,}['"]/gi },
    { name: 'GitHub OAuth/App Secret', pattern: /gho_[a-zA-Z0-9]{36}|ghu_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{22,}/g },
  ];

  // Scan .md, .js, .sh, .json, .py, .yaml, .yml, .txt files
  const allFiles = [
    ...getAllFiles(KNOWLEDGE_DIR),
    ...getAllFiles(KNOWLEDGE_DIR, '.json'),
    ...getAllFiles(KNOWLEDGE_DIR, '.py'),
    ...getAllFiles(KNOWLEDGE_DIR, '.txt'),
    ...getAllFiles(MEMORY_DIR),
    ...getAllFiles(MEMORY_DIR, '.json'),
    ...getAllFiles(SCRIPTS_DIR, '.js'),
    ...getAllFiles(SCRIPTS_DIR, '.sh'),
    ...getAllFiles(SCRIPTS_DIR, '.py'),
    ...getAllFiles(SCRIPTS_DIR, '.json'),
  ];

  // Deduplicate file list
  const fileSet = [...new Set(allFiles)];

  // Exclude known safe files (the scanner itself, test patterns, etc.)
  // Exclude scanner tools, test files, and Edge's own behavioral config files
  const excludePatterns = ['security-scan.js', 'sanitize.js', 'auto-pull.sh', 'test-sanitize.js'];
  const deepScanExcludePaths = ['memory/directives.md', 'memory/self-improvement-log.md',
    'AGENTS.md', 'HEARTBEAT.md', 'SOUL.md', 'RUNTIME-TRIGGERS.md', 'USER.md', 'IDENTITY.md'];

  const secretHits = [];
  for (const f of fileSet) {
    const basename = path.basename(f);
    if (excludePatterns.includes(basename)) continue;

    const content = fs.readFileSync(f, 'utf-8');
    const rel = path.relative(EDGE_REPO, f).replace(/\\/g, '/');

    for (const { name, pattern } of secretPatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(content)) {
        secretHits.push(`${rel}: ${name}`);
      }
    }
  }

  if (secretHits.length === 0) {
    addFinding(SEV.OK, 'Security', 'No secrets detected in committed files');
  } else {
    addFinding(SEV.CRITICAL, 'Security',
      `${secretHits.length} potential secrets found in committed files!`,
      secretHits.join('\n'));
  }

  // ── Layer 2: Deep security scan (prompt injection, exfiltration, etc.) ──
  const deepPatterns = [
    // Prompt injection
    { name: 'Prompt Injection', severity: 'HIGH',
      pattern: /ignore (?:all )?(?:previous|prior|above) (?:instructions|prompts|rules)/gi },
    { name: 'Role Reassignment', severity: 'HIGH',
      pattern: /you are now (?:a |an |in )/gi },
    { name: 'Safety Bypass', severity: 'HIGH',
      pattern: /(?:forget|override|bypass) (?:your |all )?(?:rules|safety|restrictions|guidelines)/gi },
    { name: 'Memory Injection', severity: 'HIGH',
      pattern: /add (?:this |the following )?(?:to|into) (?:your )?(?:memory|directives|rules|triggers)/gi },
    { name: 'Delayed Trigger', severity: 'HIGH',
      pattern: /on (?:your )?next (?:heartbeat|session|wake)/gi },
    // Data exfiltration
    { name: 'Suspicious Webhook URL', severity: 'HIGH',
      pattern: /webhook|ngrok|pipedream|requestbin|hookbin|beeceptor|postb\.in/gi },
    // Hidden content
    { name: 'Zero-Width Characters', severity: 'MEDIUM',
      pattern: /[\u200B\u200C\u200D\uFEFF\u2060\u00AD]/g },
    { name: 'Suspicious HTML Comment', severity: 'MEDIUM',
      pattern: /<!--[\s\S]{0,500}?(?:prompt|instruction|system|ignore|override|inject)[\s\S]{0,500}?-->/gi },
    // Dangerous file operations
    { name: 'Destructive rm Command', severity: 'HIGH',
      pattern: /\brm\s+-rf\s+[\/~]/gi },
    { name: 'SSH Key Access', severity: 'HIGH',
      pattern: /\.ssh\/|id_rsa|authorized_keys/gi },
  ];

  // Only deep-scan recently changed files (last 7 days) for performance
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentFiles = fileSet.filter(f => {
    try {
      return fs.statSync(f).mtimeMs > sevenDaysAgo;
    } catch { return false; }
  });

  const deepHits = [];
  for (const f of recentFiles) {
    const basename = path.basename(f);
    if (excludePatterns.includes(basename)) continue;

    const rel = path.relative(EDGE_REPO, f).replace(/\\/g, '/');
    // Skip Edge's own behavioral/config files (they legitimately contain trigger phrases)
    // Also skip Edge's daily memory logs (they reference heartbeats naturally)
    if (deepScanExcludePaths.some(p => rel === p || rel.endsWith('/' + p))) continue;
    if (/^memory\/\d{4}-\d{2}-\d{2}\.md$/.test(rel)) continue;

    const content = fs.readFileSync(f, 'utf-8');

    for (const { name, severity, pattern } of deepPatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(content)) {
        deepHits.push({ file: rel, name, severity });
      }
    }
  }

  if (deepHits.length === 0) {
    addFinding(SEV.OK, 'Security-Deep', `Deep scan clean (${recentFiles.length} recent files checked for injection/exfiltration/hidden content)`);
  } else {
    const criticalDeep = deepHits.filter(h => h.severity === 'CRITICAL' || h.severity === 'HIGH');
    const mediumDeep = deepHits.filter(h => h.severity === 'MEDIUM');

    if (criticalDeep.length > 0) {
      addFinding(SEV.CRITICAL, 'Security-Deep',
        `${criticalDeep.length} HIGH/CRITICAL security patterns detected in recent files!`,
        criticalDeep.map(h => `${h.file}: ${h.name} [${h.severity}]`).join('\n'));
    }
    if (mediumDeep.length > 0) {
      addFinding(SEV.WARNING, 'Security-Deep',
        `${mediumDeep.length} MEDIUM security patterns in recent files (review recommended)`,
        mediumDeep.map(h => `${h.file}: ${h.name}`).join('\n'));
    }
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

// Check 11: Tag quality
function checkTagQuality() {
  const files = getAllFiles(KNOWLEDGE_DIR);
  const lowTagFiles = [];
  const inconsistentTags = [];
  const tagUsage = {}; // tag -> count of files using it

  for (const f of files) {
    const rel = path.relative(KNOWLEDGE_DIR, f).replace(/\\/g, '/');
    if (rel.endsWith('.json')) continue;

    const content = fs.readFileSync(f, 'utf-8');
    if (!hasFrontmatter(content)) continue;

    const meta = parseFrontmatter(content);
    if (!meta || !meta.tags) continue;

    // Parse tags from JSON array format: ["tag1", "tag2"]
    let tags = [];
    try {
      const raw = meta.tags.trim();
      if (raw.startsWith('[')) {
        tags = JSON.parse(raw);
      } else {
        tags = raw.split(',').map(t => t.trim().replace(/^["']|["']$/g, ''));
      }
    } catch {
      tags = [];
    }

    // Flag files with fewer than 5 tags
    if (tags.length < 5 && tags.length > 0) {
      lowTagFiles.push({ file: rel, count: tags.length });
    }

    // Check for inconsistent naming (camelCase or spaces instead of kebab-case)
    for (const tag of tags) {
      if (/[A-Z]/.test(tag) && tag !== tag.toLowerCase()) {
        inconsistentTags.push({ file: rel, tag, issue: 'camelCase/uppercase' });
      }
      if (/\s/.test(tag)) {
        inconsistentTags.push({ file: rel, tag, issue: 'contains spaces' });
      }
      // Track usage
      const normalized = tag.toLowerCase().trim();
      if (normalized) {
        tagUsage[normalized] = (tagUsage[normalized] || 0) + 1;
      }
    }
  }

  // Find orphan tags (used by only 1 file — useless for search cross-referencing)
  const orphanTags = Object.entries(tagUsage).filter(([, count]) => count === 1);
  const totalTags = Object.keys(tagUsage).length;

  const issues = [];
  if (lowTagFiles.length > 0) {
    issues.push(`${lowTagFiles.length} files have fewer than 5 tags (weak searchability)`);
  }
  if (inconsistentTags.length > 0) {
    issues.push(`${inconsistentTags.length} tag naming violations (should be kebab-case)`);
  }
  if (orphanTags.length > totalTags * 0.4) {
    issues.push(`${orphanTags.length}/${totalTags} tags are used by only 1 file (${Math.round(orphanTags.length / totalTags * 100)}% orphan rate — poor cross-referencing)`);
  }

  if (issues.length === 0) {
    addFinding(SEV.OK, 'Tag Quality', `${totalTags} unique tags across KB, tag quality is good`);
  } else {
    let details = '';
    if (lowTagFiles.length > 0) {
      details += 'Low-tag files:\n' + lowTagFiles.slice(0, 10).map(f => `  ${f.file}: only ${f.count} tags`).join('\n');
      if (lowTagFiles.length > 10) details += `\n  ... and ${lowTagFiles.length - 10} more`;
      details += '\n';
    }
    if (inconsistentTags.length > 0) {
      const unique = [...new Set(inconsistentTags.map(t => t.tag))];
      details += 'Inconsistent tags: ' + unique.slice(0, 15).join(', ');
      if (unique.length > 15) details += ` ... +${unique.length - 15} more`;
      details += '\n';
    }
    details += `Tag stats: ${totalTags} unique tags, ${orphanTags.length} orphan tags (single-use)`;

    addFinding(SEV.WARNING, 'Tag Quality',
      issues.join('; '),
      details);
  }
}

// Check 12: Memory curation
function checkMemoryCuration() {
  const memFiles = getAllFiles(MEMORY_DIR);
  const issues = [];
  const details = [];

  // Check daily logs for bloat (>500 lines = never distilled)
  const dailyLogs = memFiles.filter(f => /\d{4}-\d{2}-\d{2}\.md$/.test(path.basename(f)));
  const bloatedLogs = [];
  for (const f of dailyLogs) {
    const content = fs.readFileSync(f, 'utf-8');
    const lineCount = content.split('\n').length;
    if (lineCount > 500) {
      bloatedLogs.push({ file: path.basename(f), lines: lineCount });
    }
  }

  if (bloatedLogs.length > 0) {
    issues.push(`${bloatedLogs.length} daily logs over 500 lines (never distilled)`);
    details.push('Bloated logs:\n' + bloatedLogs.slice(0, 5).map(l => `  ${l.file}: ${l.lines} lines`).join('\n'));
  }

  // Check CORE_MEMORY.md freshness
  const coreMemPath = path.resolve(MEMORY_DIR, 'CORE_MEMORY.md');
  if (fs.existsSync(coreMemPath)) {
    const stat = fs.statSync(coreMemPath);
    const daysOld = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24);
    if (daysOld > 7) {
      issues.push(`CORE_MEMORY.md hasn't been updated in ${Math.floor(daysOld)} days (stale)`);
    }
  } else {
    issues.push('CORE_MEMORY.md does not exist — Edge has no persistent core memory');
  }

  // Check MEMORY.md freshness
  const memoryMdPath = path.resolve(MEMORY_DIR, 'MEMORY.md');
  if (fs.existsSync(memoryMdPath)) {
    const stat = fs.statSync(memoryMdPath);
    const daysOld = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24);
    if (daysOld > 7) {
      issues.push(`MEMORY.md hasn't been updated in ${Math.floor(daysOld)} days`);
    }
  }

  // Count uncurated daily logs older than 14 days
  const oldUncurated = dailyLogs.filter(f => {
    const match = path.basename(f).match(/(\d{4}-\d{2}-\d{2})/);
    if (!match) return false;
    const daysOld = (Date.now() - new Date(match[1]).getTime()) / (1000 * 60 * 60 * 24);
    return daysOld > 14;
  });

  if (oldUncurated.length > 10) {
    issues.push(`${oldUncurated.length} daily logs older than 14 days without curation (should be distilled into topic files)`);
  }

  // Total memory stats
  const totalLines = dailyLogs.reduce((sum, f) => {
    try { return sum + fs.readFileSync(f, 'utf-8').split('\n').length; } catch { return sum; }
  }, 0);

  if (issues.length === 0) {
    addFinding(SEV.OK, 'Memory Quality', `Memory well-curated: ${dailyLogs.length} daily logs, ${memFiles.length} total files, core memories fresh`);
  } else {
    details.push(`Memory stats: ${dailyLogs.length} daily logs (${totalLines} total lines), ${oldUncurated.length} uncurated (>14d)`);
    addFinding(SEV.WARNING, 'Memory Quality',
      issues.join('; '),
      details.join('\n'));
  }
}

// Check 13: Index search coverage
function checkSearchCoverage() {
  const filesIndexPath = path.resolve(KNOWLEDGE_DIR, 'FILES-INDEX.json');
  const topicsIndexPath = path.resolve(KNOWLEDGE_DIR, 'TOPICS-INDEX.json');
  const keywordsIndexPath = path.resolve(KNOWLEDGE_DIR, 'KEYWORDS-INDEX.json');

  // Need all three indexes to check coverage
  if (!fs.existsSync(filesIndexPath) || !fs.existsSync(topicsIndexPath) || !fs.existsSync(keywordsIndexPath)) {
    addFinding(SEV.INFO, 'Search Coverage', 'Cannot check search coverage — one or more index files missing');
    return;
  }

  let filesIndex, topicsIndex, keywordsIndex;
  try {
    filesIndex = JSON.parse(fs.readFileSync(filesIndexPath, 'utf-8'));
    topicsIndex = JSON.parse(fs.readFileSync(topicsIndexPath, 'utf-8'));
    keywordsIndex = JSON.parse(fs.readFileSync(keywordsIndexPath, 'utf-8'));
  } catch {
    addFinding(SEV.INFO, 'Search Coverage', 'Cannot check search coverage — index files corrupted (merge conflicts?)');
    return;
  }

  // Get all indexed files
  const allIndexedFiles = new Set(Object.keys(filesIndex.files || {}));

  // Get all files reachable via topic clusters
  const topicReachable = new Set();
  for (const [, files] of Object.entries(topicsIndex.topics || {})) {
    if (Array.isArray(files)) {
      for (const f of files) topicReachable.add(f);
    }
  }
  // Also check category listings
  for (const [, files] of Object.entries(topicsIndex.categories || {})) {
    if (Array.isArray(files)) {
      for (const f of files) topicReachable.add(f);
    }
  }

  // Get all files reachable via keyword search
  const keywordReachable = new Set();
  for (const [, files] of Object.entries(keywordsIndex.keywords || {})) {
    if (Array.isArray(files)) {
      for (const f of files) keywordReachable.add(f);
    }
  }

  // Find files that are in FILES-INDEX but unreachable via topics OR keywords
  const unreachable = [];
  for (const file of allIndexedFiles) {
    if (!topicReachable.has(file) && !keywordReachable.has(file)) {
      unreachable.push(file);
    }
  }

  // Find files reachable by keywords only (not in any topic cluster — weaker discovery)
  const keywordOnly = [];
  for (const file of allIndexedFiles) {
    if (!topicReachable.has(file) && keywordReachable.has(file)) {
      keywordOnly.push(file);
    }
  }

  if (unreachable.length === 0 && keywordOnly.length < allIndexedFiles.size * 0.1) {
    addFinding(SEV.OK, 'Search Coverage',
      `All ${allIndexedFiles.size} indexed files are searchable (${topicReachable.size} via topics, ${keywordReachable.size} via keywords)`);
  } else {
    const details = [];
    if (unreachable.length > 0) {
      details.push('UNREACHABLE (not in any topic or keyword index):\n' +
        unreachable.slice(0, 15).map(f => `  ${f}`).join('\n') +
        (unreachable.length > 15 ? `\n  ... and ${unreachable.length - 15} more` : ''));
    }
    if (keywordOnly.length > 0) {
      details.push(`KEYWORD-ONLY (${keywordOnly.length} files not in any topic cluster — harder to discover):\n` +
        keywordOnly.slice(0, 10).map(f => `  ${f}`).join('\n') +
        (keywordOnly.length > 10 ? `\n  ... and ${keywordOnly.length - 10} more` : ''));
    }

    if (unreachable.length > 0) {
      addFinding(SEV.WARNING, 'Search Coverage',
        `${unreachable.length} indexed files are completely unsearchable (invisible to Edge)`,
        details.join('\n\n'));
    } else {
      addFinding(SEV.INFO, 'Search Coverage',
        `All files searchable, but ${keywordOnly.length} only reachable via exact keyword match (not in topic clusters)`,
        details.join('\n\n'));
    }
  }
}

// Check 14: Cron health (reads report from cron-health-reporter.js)
function checkCronHealth() {
  const cronHealthPath = path.resolve(EDGE_REPO, 'data', 'cron-health.json');
  if (!fs.existsSync(cronHealthPath)) {
    addFinding(SEV.INFO, 'Cron Health', 'No cron health report found (data/cron-health.json) — Edge may not have run cron-health-reporter.js yet');
    return;
  }

  let report;
  try {
    report = JSON.parse(fs.readFileSync(cronHealthPath, 'utf-8'));
  } catch (err) {
    addFinding(SEV.WARNING, 'Cron Health', `Failed to parse cron health report: ${err.message}`);
    return;
  }

  const jobs = report.jobs || [];
  const summary = report.summary || {};

  // Check for circuit breakers (3+ consecutive failures) — CRITICAL
  const circuitOpenJobs = jobs.filter(j => j.circuitOpen);
  if (circuitOpenJobs.length > 0) {
    addFinding(SEV.CRITICAL, 'Cron Health',
      `${circuitOpenJobs.length} cron job(s) have circuit breakers OPEN (3+ consecutive failures)`,
      circuitOpenJobs.map(j => `${j.id}: ${j.consecutiveFailures} consecutive failures (schedule: ${j.schedule})`).join('\n'));
    return;
  }

  // Check for failed jobs — WARNING
  const failedJobs = jobs.filter(j => j.status === 'failed');
  if (failedJobs.length > 0) {
    addFinding(SEV.WARNING, 'Cron Health',
      `${failedJobs.length} cron job(s) failed on last run`,
      failedJobs.map(j => `${j.id}: status=${j.status}, consecutiveFailures=${j.consecutiveFailures} (schedule: ${j.schedule})`).join('\n'));
    return;
  }

  // Check for overdue jobs — WARNING
  const overdueJobs = jobs.filter(j => j.status === 'overdue');
  if (overdueJobs.length > 0) {
    addFinding(SEV.WARNING, 'Cron Health',
      `${overdueJobs.length} cron job(s) are overdue`,
      overdueJobs.map(j => `${j.id}: last run ${new Date(j.lastRunAt).toISOString()} (schedule: ${j.schedule})`).join('\n'));
    return;
  }

  // All healthy
  addFinding(SEV.OK, 'Cron Health',
    `All ${summary.total} cron jobs healthy (report generated ${report.generated || 'unknown'})`);
}

// ── Impact Descriptions ────────────────────────────────────────
const IMPACT_MAP = {
  Index: { p: 'P0', impact: 'Edge cannot search the KB — effectively blind' },
  Security: { p: 'P0', impact: 'Potential credential exposure in committed files' },
  Git: { p: 'P1', impact: 'Edge is running stale code or has unresolved conflicts' },
  Frontmatter: { p: 'P2', impact: 'Files may not surface in KB searches' },
  Orphans: { p: 'P2', impact: 'Files exist but are invisible to Edge\'s search' },
  Structure: { p: 'P2', impact: 'Non-standard dirs may confuse search and categorization' },
  Naming: { p: 'P3', impact: 'May break on Linux or cause path issues' },
  Scripts: { p: 'P3', impact: 'Version sprawl creates confusion about which script is current' },
  Memory: { p: 'P3', impact: 'Bloated memory slows context loading' },
  'Security-Deep': { p: 'P0', impact: 'Prompt injection, data exfiltration, or hidden malicious content detected' },
  'Tag Quality': { p: 'P2', impact: 'Poor tags degrade Edge\'s ability to find relevant KB files' },
  'Memory Quality': { p: 'P2', impact: 'Uncurated memory means Edge loses learnings and loads stale context' },
  'Search Coverage': { p: 'P1', impact: 'Indexed files that Edge can never find via search are wasted knowledge' },
  'Cron Health': { p: 'P1', impact: 'Edge cron jobs failing silently means missed reports and stale data' },
};

// ── Executive Summary Generator ────────────────────────────────
function generateExecutiveSummary(criticals, warnings, oks, stats, trendAnalysis) {
  const parts = [];

  // Lead with the most important issue
  if (criticals.length > 0) {
    for (const c of criticals) {
      if (c.category === 'Index') {
        parts.push('Edge\'s search index is corrupted — he can\'t search the KB until it\'s rebuilt.');
      } else if (c.category === 'Security') {
        parts.push(`Security alert: ${c.message}.`);
      } else {
        parts.push(`Critical issue in ${c.category}: ${c.message}.`);
      }
    }
  }

  // Git issues
  const gitWarnings = warnings.filter(f => f.category === 'Git');
  const behindMatch = gitWarnings.find(f => f.message.includes('behind'));
  const uncommittedMatch = gitWarnings.find(f => f.message.includes('uncommitted'));
  if (behindMatch && uncommittedMatch) {
    parts.push('Edge has unresolved merge conflicts and is behind on pulls — he\'s stuck on stale code.');
  } else if (behindMatch) {
    parts.push(`Edge is ${behindMatch.message.match(/\d+/)?.[0] || 'several'} commits behind — not running our latest fixes.`);
  } else if (uncommittedMatch) {
    parts.push('Edge has uncommitted local changes that need attention.');
  }

  // Growth context
  if (trendAnalysis) {
    if (trendAnalysis.kbFilesDelta > 20) {
      parts.push(`KB grew +${trendAnalysis.kbFilesDelta} files since yesterday — high activity.`);
    }
    if (trendAnalysis.regressions.length > 0) {
      parts.push(`Regressions detected: ${trendAnalysis.regressions.join('; ')}.`);
    }
  }

  // All clear
  if (criticals.length === 0 && warnings.length === 0) {
    parts.push(`All 14 checks passed. Edge is healthy — ${stats.kbFiles} KB files, ${stats.memFiles} memory files, everything indexed and clean.`);
  }

  return parts.join(' ');
}

// ── Action Items Generator ─────────────────────────────────────
function generateActionItems(criticals, warnings, fixCount) {
  const oopsHandles = [];
  const edgeShould = [];
  const alexDecides = [];

  for (const f of [...criticals, ...warnings]) {
    switch (f.category) {
      case 'Index':
        oopsHandles.push(`Rebuild ${f.message.includes('corrupted') ? 'corrupted' : 'stale'} search index`);
        break;
      case 'Frontmatter':
        oopsHandles.push(`Fix ${f.message.match(/\d+/)?.[0] || ''} files with missing/incomplete frontmatter`);
        break;
      case 'Orphans':
        oopsHandles.push(`Re-index ${f.message.match(/\d+/)?.[0] || ''} orphaned files so Edge can find them`);
        break;
      case 'Git':
        if (f.message.includes('behind')) {
          edgeShould.push('Run `git pull origin master` to sync latest (auto-pull cron should handle this going forward)');
        } else if (f.message.includes('uncommitted')) {
          edgeShould.push('Resolve merge conflicts in uncommitted files and commit');
        }
        break;
      case 'Security':
        if (f.severity === SEV.CRITICAL) {
          alexDecides.push(`URGENT: ${f.message} — review and rotate exposed credentials`);
        }
        break;
      case 'Security-Deep':
        if (f.severity === SEV.CRITICAL) {
          alexDecides.push(`SECURITY: ${f.message} — investigate immediately`);
        } else {
          edgeShould.push(`Review flagged security patterns: ${f.message}`);
        }
        break;
      case 'Structure':
        alexDecides.push(`${f.message.match(/\d+/)?.[0] || 'Some'} non-standard KB directories — reorganize or whitelist?`);
        break;
      case 'Naming':
        alexDecides.push(`${f.message.match(/\d+/)?.[0] || 'Some'} files with naming violations (spaces in filenames) — rename?`);
        break;
      case 'Scripts':
        alexDecides.push(`Script version sprawl detected — archive old versions?`);
        break;
      case 'Memory':
        edgeShould.push('Curate memory — archive old daily logs, distill into MEMORY.md');
        break;
      case 'Tag Quality':
        oopsHandles.push('Flag low-quality tags for repair on next kb-update run');
        edgeShould.push('Review tag quality — files with <5 tags need better tagging for searchability');
        break;
      case 'Memory Quality':
        edgeShould.push('Distill bloated daily logs into topic files and update CORE_MEMORY.md');
        break;
      case 'Search Coverage':
        oopsHandles.push('Re-index unsearchable files into topic clusters on next kb-update run');
        break;
    }
  }

  if (fixCount > 0) {
    oopsHandles.push(`Auto-fixed ${fixCount} issue(s) this run`);
  }

  return { oopsHandles, edgeShould, alexDecides };
}

// ── Recurring Issue Tracker ────────────────────────────────────
function detectRecurringIssues(trends) {
  if (trends.entries.length < 3) return [];
  const recurring = [];
  const recent = trends.entries.slice(-7);

  // Count how many days had criticals
  const criticalDays = recent.filter(e => e.criticals > 0).length;
  if (criticalDays >= 2) {
    recurring.push(`Index/critical issues have occurred ${criticalDays} times in the last ${recent.length} days — investigate root cause (likely a script corrupting TOPICS-INDEX.json)`);
  }

  // Grade instability
  const grades = recent.map(e => e.grade);
  const gradeChanges = grades.filter((g, i) => i > 0 && g !== grades[i - 1]).length;
  if (gradeChanges >= 3) {
    recurring.push(`Grade has been unstable (${grades.join(' -> ')}) — issues are being fixed but keep recurring`);
  }

  // Sustained warning count
  const avgWarnings = recent.reduce((s, e) => s + e.warnings, 0) / recent.length;
  if (avgWarnings > 3) {
    recurring.push(`Averaging ${avgWarnings.toFixed(1)} warnings/day over the last week — chronic issues not being resolved`);
  }

  // Rapid KB growth
  if (recent.length >= 5) {
    const weekGrowth = recent[recent.length - 1].kbFiles - recent[0].kbFiles;
    if (weekGrowth > 100) {
      recurring.push(`KB grew +${weekGrowth} files in ${recent.length} days (${(weekGrowth / recent.length).toFixed(0)}/day) — is Edge auto-generating too much content?`);
    }
  }

  return recurring;
}

// ── Weekly Review (Fridays) ────────────────────────────────────
function generateWeeklyReview(trends, stats) {
  const dayOfWeek = new Date().getDay(); // 0=Sun, 5=Fri
  if (dayOfWeek !== 5) return null;

  const weekEntries = trends.entries.slice(-5); // Mon-Fri
  if (weekEntries.length < 2) return null;

  const first = weekEntries[0];
  const last = weekEntries[weekEntries.length - 1];

  let review = `## Weekly Review (${first.date} — ${last.date})\n\n`;

  // Grade trajectory
  const grades = weekEntries.map(e => `${e.date.slice(5)}: ${e.grade}`);
  review += `**Grade trajectory:** ${grades.join(' | ')}\n\n`;

  // Week totals
  review += `**Week changes:**\n`;
  review += `- KB: ${first.kbFiles} -> ${last.kbFiles} (+${last.kbFiles - first.kbFiles} files, +${(last.kbSizeMB - first.kbSizeMB).toFixed(1)} MB)\n`;
  review += `- Memory: ${first.memFiles} -> ${last.memFiles} (+${last.memFiles - first.memFiles} files)\n`;
  review += `- Scripts: ${first.scriptFiles} -> ${last.scriptFiles} (+${last.scriptFiles - first.scriptFiles})\n\n`;

  // Best/worst day
  const bestDay = weekEntries.reduce((a, b) => (a.criticals + a.warnings) <= (b.criticals + b.warnings) ? a : b);
  const worstDay = weekEntries.reduce((a, b) => (a.criticals + a.warnings) >= (b.criticals + b.warnings) ? a : b);
  review += `**Best day:** ${bestDay.date} (Grade ${bestDay.grade})\n`;
  review += `**Worst day:** ${worstDay.date} (Grade ${worstDay.grade})\n\n`;

  // Script growth flag
  const scriptDelta = last.scriptFiles - first.scriptFiles;
  if (scriptDelta > 5) {
    review += `**Flag:** Scripts grew by +${scriptDelta} this week — review for sprawl or unused scripts.\n\n`;
  }

  // Stale file detection
  const staleFiles = [];
  try {
    const kbFiles = getAllFiles(KNOWLEDGE_DIR);
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    for (const f of kbFiles) {
      const stat = fs.statSync(f);
      if (stat.mtimeMs < thirtyDaysAgo) {
        staleFiles.push(path.relative(KNOWLEDGE_DIR, f).replace(/\\/g, '/'));
      }
    }
  } catch {}

  if (staleFiles.length > 0) {
    review += `**Stale KB files (not modified in 30+ days):** ${staleFiles.length} files\n`;
    review += staleFiles.slice(0, 10).map(f => `- ${f}`).join('\n') + '\n';
    if (staleFiles.length > 10) review += `- ... and ${staleFiles.length - 10} more\n`;
    review += '\n';
  }

  return review;
}

// ── Report Generator ───────────────────────────────────────────
function generateReport(stats, trendAnalysis, trends, fixCount) {
  const criticals = findings.filter(f => f.severity === SEV.CRITICAL);
  const warnings = findings.filter(f => f.severity === SEV.WARNING);
  const oks = findings.filter(f => f.severity === SEV.OK);
  const infos = findings.filter(f => f.severity === SEV.INFO);

  let grade;
  if (criticals.length > 0) grade = 'F — Critical issues found';
  else if (warnings.length > 3) grade = 'C — Multiple warnings';
  else if (warnings.length > 0) grade = 'B — Minor issues';
  else grade = 'A — All clear';

  // Executive Summary
  const summary = generateExecutiveSummary(criticals, warnings, oks, stats, trendAnalysis);

  let report = `# COO Nightly Audit — ${TODAY}\n\n`;
  report += `**Grade: ${grade}**\n`;
  report += `**Repo:** edgebot-brain\n`;
  report += `**Run at:** ${new Date().toISOString()}\n\n`;

  report += `## Status Update\n\n`;
  report += `${summary}\n\n`;

  report += `| Metric | Value |\n|---|---|\n`;
  report += `| KB Files | ${stats.kbFiles} (${stats.kbSizeMB} MB) |\n`;
  report += `| Memory Files | ${stats.memFiles} (${stats.memSizeMB} MB) |\n`;
  report += `| Scripts | ${stats.scriptFiles} |\n`;
  report += `| Criticals | ${criticals.length} |\n`;
  report += `| Warnings | ${warnings.length} |\n`;
  report += `| Passed | ${oks.length} |\n\n`;
  report += `---\n\n`;

  // Red Flags with Impact
  if (criticals.length > 0 || warnings.length > 0) {
    report += `## Red Flags\n\n`;
    const allIssues = [...criticals, ...warnings].sort((a, b) => {
      const pa = IMPACT_MAP[a.category]?.p || 'P9';
      const pb = IMPACT_MAP[b.category]?.p || 'P9';
      return pa.localeCompare(pb);
    });
    for (const f of allIssues) {
      const impact = IMPACT_MAP[f.category];
      report += `### [${impact?.p || '??'}] ${f.category}: ${f.message}\n`;
      report += `**Impact:** ${impact?.impact || 'Unknown'}\n`;
      if (f.details) report += `\`\`\`\n${f.details}\n\`\`\`\n`;
      report += '\n';
    }
  }

  // Action Items
  const actions = generateActionItems(criticals, warnings, fixCount || 0);
  if (actions.oopsHandles.length > 0 || actions.edgeShould.length > 0 || actions.alexDecides.length > 0) {
    report += `## Action Items\n\n`;
    if (actions.oopsHandles.length > 0) {
      report += `**Oops handles (automated):**\n`;
      for (const a of actions.oopsHandles) report += `- ${a}\n`;
      report += '\n';
    }
    if (actions.edgeShould.length > 0) {
      report += `**Edge should:**\n`;
      for (const a of actions.edgeShould) report += `- ${a}\n`;
      report += '\n';
    }
    if (actions.alexDecides.length > 0) {
      report += `**Alex decides:**\n`;
      for (const a of actions.alexDecides) report += `- ${a}\n`;
      report += '\n';
    }
  }

  // Recurring Issues
  if (trends) {
    const recurring = detectRecurringIssues(trends);
    if (recurring.length > 0) {
      report += `## Recurring Issues\n\n`;
      for (const r of recurring) report += `- ${r}\n`;
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

  return { report, grade, criticals, warnings, oks, infos, summary, actions };
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
function sendTelegramAlert(grade, reportData, stats, trendAnalysis, fixCount) {
  const CREDS_PATH = path.resolve(COO_ROOT, '.credentials', 'telegram.json');
  if (!fs.existsSync(CREDS_PATH)) {
    console.log('No Telegram credentials found — skipping alert.');
    return;
  }

  const { bot_token, chat_id } = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf-8'));
  if (!bot_token || !chat_id) return;

  let msg = `Oops Daily Audit -- ${TODAY}\nGrade: ${grade}\n\n`;

  // Status update (executive summary)
  if (reportData.summary) {
    msg += `STATUS: ${reportData.summary}\n\n`;
  }

  // Edge activity
  const activity = getEdgeActivity();
  if (activity.length > 0) {
    msg += activity.join('\n') + '\n\n';
  }

  // Stats
  msg += `KB: ${stats.kbFiles} files | Memory: ${stats.memFiles} files | Scripts: ${stats.scriptFiles}\n\n`;

  // Action items (the key new section)
  const actions = reportData.actions;
  if (actions) {
    if (actions.alexDecides.length > 0) {
      msg += `NEEDS YOUR DECISION:\n`;
      for (const a of actions.alexDecides) msg += `  - ${a}\n`;
      msg += '\n';
    }
    if (actions.edgeShould.length > 0) {
      msg += `EDGE SHOULD:\n`;
      for (const a of actions.edgeShould) msg += `  - ${a}\n`;
      msg += '\n';
    }
    if (actions.oopsHandles.length > 0) {
      msg += `I HANDLED:\n`;
      for (const a of actions.oopsHandles) msg += `  - ${a}\n`;
      msg += '\n';
    }
  }

  // Trends
  if (trendAnalysis) {
    if (trendAnalysis.regressions.length > 0) {
      msg += 'REGRESSIONS:\n' + trendAnalysis.regressions.map(r => `  - ${r}`).join('\n') + '\n\n';
    }
    msg += `Trend: KB ${trendAnalysis.kbFilesDelta >= 0 ? '+' : ''}${trendAnalysis.kbFilesDelta} files | Mem ${trendAnalysis.memFilesDelta >= 0 ? '+' : ''}${trendAnalysis.memFilesDelta} files\n\n`;
  }

  if (reportData.criticals.length === 0 && reportData.warnings.length === 0) {
    msg += 'All checks passed. No issues.\n\n';
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
  checkTagQuality();
  checkMemoryCuration();
  checkSearchCoverage();
  checkCronHealth();

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

  // Generate enhanced report
  const reportData = generateReport(stats, trendAnalysis, trends, fixCount);
  let report = reportData.report;

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

  // Weekly review on Fridays
  const weeklyReview = generateWeeklyReview(trends, stats);
  if (weeklyReview) {
    report += '\n' + weeklyReview;
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
  if (weeklyReview) console.log('  Weekly review included (Friday)');
  console.log(`\nReport saved: ${REPORT_PATH}`);

  // Send Telegram alert
  let grade;
  if (criticalFindings.length > 0) grade = 'F -- Critical issues found';
  else if (warningFindings.length > 3) grade = 'C -- Multiple warnings';
  else if (warningFindings.length > 0) grade = 'B -- Minor issues';
  else grade = 'A -- All clear';

  sendTelegramAlert(grade, reportData, stats, trendAnalysis, fixCount);

  if (criticalFindings.length === 0 && warningFindings.length === 0) {
    console.log('\nAll checks passed.');
  }

  if (criticalFindings.length > 0) {
    console.log('\n  CRITICAL issues detected — review report immediately!');
    process.exit(2);
  }
}

main();
