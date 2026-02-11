#!/usr/bin/env node
/**
 * weekly-review.js — Automated deep code review of Edge's codebase
 *
 * Runs every Friday at 1 PM. Does everything the manual weekly review
 * template does, but automatically. Sends results via Telegram.
 *
 * Usage: node scripts/weekly-review.js [--repo-path /path/to/edgebot-brain]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ── Config ─────────────────────────────────────────────────────
const REPO_PATH_ARG = process.argv.find((a, i) => process.argv[i - 1] === '--repo-path');
const EDGE_REPO = REPO_PATH_ARG || path.resolve(__dirname, '..', '..', 'edgebot-brain');
const COO_ROOT = path.resolve(__dirname, '..');
const REPORT_DIR = path.resolve(COO_ROOT, 'reports');
const TRENDS_PATH = path.resolve(REPORT_DIR, 'trends.json');
const KNOWLEDGE_DIR = path.resolve(EDGE_REPO, 'knowledge');
const MEMORY_DIR = path.resolve(EDGE_REPO, 'memory');
const SCRIPTS_DIR = path.resolve(EDGE_REPO, 'scripts');

const TODAY = new Date().toISOString().split('T')[0];
const REPORT_PATH = path.resolve(REPORT_DIR, `weekly-review-${TODAY}.md`);

// ── Utilities ──────────────────────────────────────────────────
function shellExec(cmd, cwd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', cwd, timeout: 60000 }).trim();
  } catch {
    return '';
  }
}

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
  } catch {}
  return files;
}

function parseFrontmatter(content) {
  if (!content.trimStart().startsWith('---')) return null;
  const end = content.indexOf('---', content.indexOf('---') + 3);
  if (end === -1) return null;
  const block = content.substring(content.indexOf('---') + 3, end).trim();
  const meta = {};
  for (const line of block.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.substring(0, idx).trim();
    let val = line.substring(idx + 1).trim();
    if (val.startsWith('[') && val.endsWith(']')) {
      val = val.slice(1, -1).split(',').map(v => v.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    } else {
      val = val.replace(/^["']|["']$/g, '');
    }
    meta[key] = val;
  }
  return meta;
}

function dirSize(dir) {
  let total = 0;
  for (const f of getAllFiles(dir, '')) {
    try { total += fs.statSync(f).size; } catch {}
  }
  // Also count non-.md files
  try {
    const allEntries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of allEntries) {
      if (entry.isFile()) {
        try { total += fs.statSync(path.join(dir, entry.name)).size; } catch {}
      }
    }
  } catch {}
  return total;
}

// ── Section 1: Audit Trends (last 7 days) ─────────────────────
function reviewAuditTrends() {
  const section = { title: '1. Audit Trends (Last 7 Days)', findings: [], grade: 'OK' };

  // Read trends.json
  let trends = { entries: [] };
  try {
    trends = JSON.parse(fs.readFileSync(TRENDS_PATH, 'utf-8'));
  } catch {
    section.findings.push('No trends.json found — daily audits may not be running');
    section.grade = 'WARNING';
    return section;
  }

  const last7 = trends.entries.slice(-7);
  if (last7.length === 0) {
    section.findings.push('No audit data in the last 7 days');
    section.grade = 'WARNING';
    return section;
  }

  // Summarize
  const grades = last7.map(e => e.grade);
  const avgCriticals = (last7.reduce((s, e) => s + e.criticals, 0) / last7.length).toFixed(1);
  const avgWarnings = (last7.reduce((s, e) => s + e.warnings, 0) / last7.length).toFixed(1);
  section.findings.push(`Audits this week: ${last7.length}`);
  section.findings.push(`Grades: ${grades.join(', ')}`);
  section.findings.push(`Avg criticals: ${avgCriticals} | Avg warnings: ${avgWarnings}`);

  // Check for recurring warnings
  const hasF = grades.includes('F');
  const allB = grades.every(g => g === 'B' || g === 'C' || g === 'F');
  if (hasF) {
    section.findings.push('CRITICAL: At least one F grade this week — review audit reports');
    section.grade = 'CRITICAL';
  } else if (allB) {
    section.findings.push('Warnings every day — recurring issues not being resolved');
    section.grade = 'WARNING';
  }

  // KB growth this week
  if (last7.length >= 2) {
    const first = last7[0];
    const last = last7[last7.length - 1];
    section.findings.push(`KB growth: ${first.kbFiles} -> ${last.kbFiles} files (+${last.kbFiles - first.kbFiles})`);
    section.findings.push(`Memory growth: ${first.memFiles} -> ${last.memFiles} files (+${last.memFiles - first.memFiles})`);
  }

  // Read individual audit reports for details
  const auditFiles = [];
  try {
    const reports = fs.readdirSync(REPORT_DIR).filter(f => f.startsWith('audit-') && f.endsWith('.md')).sort();
    const recent = reports.slice(-7);
    for (const r of recent) {
      const content = fs.readFileSync(path.resolve(REPORT_DIR, r), 'utf-8');
      const warningMatches = content.match(/### .+: .+/g) || [];
      if (warningMatches.length > 0) {
        auditFiles.push({ file: r, warnings: warningMatches.map(w => w.replace('### ', '')) });
      }
    }
  } catch {}

  // Find recurring warnings
  const warningCounts = {};
  for (const a of auditFiles) {
    for (const w of a.warnings) {
      const category = w.split(':')[0].trim();
      warningCounts[category] = (warningCounts[category] || 0) + 1;
    }
  }
  const recurring = Object.entries(warningCounts).filter(([, count]) => count >= 3);
  if (recurring.length > 0) {
    section.findings.push(`Recurring warnings: ${recurring.map(([cat, n]) => `${cat} (${n}x)`).join(', ')}`);
  }

  return section;
}

// ── Section 2: KB Quality ──────────────────────────────────────
function reviewKBQuality() {
  const section = { title: '2. KB Quality', findings: [], grade: 'OK' };

  // Run kb-update.js
  const kbUpdate = path.resolve(EDGE_REPO, 'scripts', 'kb-update.js');
  if (fs.existsSync(kbUpdate)) {
    const result = shellExec(`node "${kbUpdate}"`, EDGE_REPO);
    const filesMatch = result.match(/Files indexed:\s*(\d+)/);
    const keywordsMatch = result.match(/Keywords:\s*(\d+)/);
    if (filesMatch) section.findings.push(`Files indexed: ${filesMatch[1]}`);
    if (keywordsMatch) section.findings.push(`Keywords: ${keywordsMatch[1]}`);
  }

  // Check index files exist and their sizes
  const indexFiles = ['TOPICS-INDEX.json', 'KEYWORDS-INDEX.json', 'FILES-INDEX.json'];
  for (const idx of indexFiles) {
    const p = path.resolve(KNOWLEDGE_DIR, idx);
    if (fs.existsSync(p)) {
      const sizeKB = (fs.statSync(p).size / 1024).toFixed(0);
      section.findings.push(`${idx}: ${sizeKB} KB`);
    } else {
      section.findings.push(`MISSING: ${idx}`);
      section.grade = 'CRITICAL';
    }
  }

  // Sample 5 random KB files for frontmatter quality
  const kbFiles = getAllFiles(KNOWLEDGE_DIR);
  const samples = [];
  const shuffled = kbFiles.sort(() => Math.random() - 0.5).slice(0, 5);
  for (const f of shuffled) {
    const content = fs.readFileSync(f, 'utf-8');
    const meta = parseFrontmatter(content);
    const rel = path.relative(KNOWLEDGE_DIR, f).replace(/\\/g, '/');
    if (!meta) {
      samples.push(`${rel}: NO frontmatter`);
    } else {
      const missing = ['title', 'category', 'tags', 'summary'].filter(k => !meta[k]);
      if (missing.length > 0) {
        samples.push(`${rel}: missing ${missing.join(', ')}`);
      } else {
        samples.push(`${rel}: complete`);
      }
    }
  }
  section.findings.push(`Sample frontmatter check: ${samples.filter(s => s.endsWith('complete')).length}/5 complete`);
  for (const s of samples) {
    section.findings.push(`  ${s}`);
  }

  // Check topic cluster coverage
  const topicsPath = path.resolve(KNOWLEDGE_DIR, 'TOPICS-INDEX.json');
  if (fs.existsSync(topicsPath)) {
    try {
      const topics = JSON.parse(fs.readFileSync(topicsPath, 'utf-8'));
      const clusterCount = Object.keys(topics.topics || {}).length;
      const smallClusters = Object.entries(topics.topics || {}).filter(([, files]) => files.length < 3);
      section.findings.push(`Topic clusters: ${clusterCount}`);
      if (smallClusters.length > 0) {
        section.findings.push(`Thin clusters (<3 files): ${smallClusters.map(([name]) => name).join(', ')}`);
      }
    } catch {}
  }

  return section;
}

// ── Section 3: Memory Hygiene ──────────────────────────────────
function reviewMemoryHygiene() {
  const section = { title: '3. Memory Hygiene', findings: [], grade: 'OK' };

  const memFiles = getAllFiles(MEMORY_DIR);
  const totalSize = memFiles.reduce((sum, f) => { try { return sum + fs.statSync(f).size; } catch { return sum; } }, 0);
  const totalMB = (totalSize / 1024 / 1024).toFixed(1);

  section.findings.push(`Memory directory: ${memFiles.length} files, ${totalMB} MB`);

  // Daily logs analysis
  const dailyLogs = memFiles.filter(f => /\d{4}-\d{2}-\d{2}\.md$/.test(path.basename(f)));
  const oldLogs = dailyLogs.filter(f => {
    const match = path.basename(f).match(/(\d{4}-\d{2}-\d{2})/);
    if (!match) return false;
    const daysOld = (Date.now() - new Date(match[1]).getTime()) / (1000 * 60 * 60 * 24);
    return daysOld > 14;
  });

  section.findings.push(`Daily logs: ${dailyLogs.length} total, ${oldLogs.length} older than 14 days`);

  if (oldLogs.length > 20) {
    section.findings.push(`ACTION NEEDED: ${oldLogs.length} old logs should be distilled into MEMORY.md and archived`);
    section.grade = 'WARNING';
  }

  // Check MEMORY.md size
  const memoryMd = path.resolve(EDGE_REPO, 'MEMORY.md');
  if (fs.existsSync(memoryMd)) {
    const size = fs.statSync(memoryMd).size;
    const lines = fs.readFileSync(memoryMd, 'utf-8').split('\n').length;
    section.findings.push(`MEMORY.md: ${lines} lines, ${(size / 1024).toFixed(0)} KB`);
    if (lines > 500) {
      section.findings.push('MEMORY.md is getting long — consider pruning outdated entries');
      section.grade = 'WARNING';
    }
  } else {
    section.findings.push('MEMORY.md does not exist');
  }

  // Total memory footprint
  if (totalSize > 10 * 1024 * 1024) {
    section.findings.push(`Memory dir is ${totalMB} MB — getting bloated`);
    section.grade = 'WARNING';
  }

  return section;
}

// ── Section 4: Script Inventory ────────────────────────────────
function reviewScripts() {
  const section = { title: '4. Script Inventory', findings: [], grade: 'OK' };

  const jsFiles = getAllFiles(SCRIPTS_DIR, '.js').filter(f => !f.includes('_archive'));
  const shFiles = getAllFiles(SCRIPTS_DIR, '.sh').filter(f => !f.includes('_archive'));

  section.findings.push(`Active scripts: ${jsFiles.length} JS, ${shFiles.length} shell`);

  // List all scripts
  const scriptList = [];
  for (const f of [...jsFiles, ...shFiles]) {
    const name = path.basename(f);
    const content = fs.readFileSync(f, 'utf-8');
    // Try to extract description from first comment block
    const descMatch = content.match(/\*\s+(\S.+?)(?:\n|\*\/)/);
    const desc = descMatch ? descMatch[1].substring(0, 60) : '(no description)';
    scriptList.push(`${name}: ${desc}`);
  }
  section.findings.push(...scriptList.map(s => `  ${s}`));

  // Check for version sprawl
  const basenames = {};
  for (const f of jsFiles) {
    const name = path.basename(f, '.js');
    const base = name.replace(/[-_]v\d+$/, '').replace(/[-_](simple|final|additional|old|backup)$/, '');
    if (!basenames[base]) basenames[base] = [];
    basenames[base].push(name);
  }
  const sprawl = Object.entries(basenames).filter(([, v]) => v.length > 1);
  if (sprawl.length > 0) {
    section.findings.push(`Version sprawl: ${sprawl.map(([b, v]) => `${b} (${v.length} versions)`).join(', ')}`);
    section.grade = 'WARNING';
  }

  // Check _archive
  const archivePath = path.resolve(SCRIPTS_DIR, '_archive');
  if (fs.existsSync(archivePath)) {
    const archived = fs.readdirSync(archivePath).length;
    section.findings.push(`Archived scripts: ${archived}`);
  }

  return section;
}

// ── Section 5: Is Edge Getting Dumber? ─────────────────────────
function reviewEdgeHealth() {
  const section = { title: '5. Edge Intelligence Check', findings: [], grade: 'OK' };

  // Check directives.md exists and references correct systems
  const directives = path.resolve(EDGE_REPO, 'memory', 'directives.md');
  if (fs.existsSync(directives)) {
    const content = fs.readFileSync(directives, 'utf-8');
    const lines = content.split('\n').length;
    section.findings.push(`directives.md: ${lines} lines`);

    // Check key references
    const checks = [
      { name: 'TOPICS-INDEX.json referenced', test: content.includes('TOPICS-INDEX.json') },
      { name: 'KB-STANDARDS.md referenced', test: content.includes('KB-STANDARDS.md') },
      { name: 'kb-update.js referenced', test: content.includes('kb-update.js') },
      { name: 'KB-SEARCH.md referenced', test: content.includes('KB-SEARCH.md') },
      { name: 'Model routing defined', test: content.includes('Opus') && content.includes('Sonnet') },
      { name: 'No legacy SEARCH-INDEX.json as primary', test: !content.includes('Read `knowledge/SEARCH-INDEX.json`') },
    ];

    for (const c of checks) {
      section.findings.push(`  ${c.test ? 'PASS' : 'FAIL'}: ${c.name}`);
      if (!c.test) section.grade = 'WARNING';
    }
  } else {
    section.findings.push('directives.md NOT FOUND — Edge has no directives');
    section.grade = 'CRITICAL';
  }

  // Check AGENTS.md has git pull
  const agents = path.resolve(EDGE_REPO, 'AGENTS.md');
  if (fs.existsSync(agents)) {
    const content = fs.readFileSync(agents, 'utf-8');
    if (content.includes('git pull')) {
      section.findings.push('PASS: AGENTS.md includes git pull on startup');
    } else {
      section.findings.push('FAIL: AGENTS.md missing git pull — Edge won\'t sync fixes');
      section.grade = 'WARNING';
    }
  }

  // Check HEARTBEAT.md references
  const heartbeat = path.resolve(EDGE_REPO, 'HEARTBEAT.md');
  if (fs.existsSync(heartbeat)) {
    const content = fs.readFileSync(heartbeat, 'utf-8');
    const checks = [
      { name: 'Git pull in heartbeat', test: content.includes('git pull') },
      { name: 'Knowledge capture loop', test: content.includes('Knowledge Capture') },
      { name: 'KB-STANDARDS.md referenced', test: content.includes('KB-STANDARDS.md') },
      { name: 'kb-update.js referenced', test: content.includes('kb-update.js') },
    ];
    for (const c of checks) {
      section.findings.push(`  ${c.test ? 'PASS' : 'FAIL'}: ${c.name}`);
      if (!c.test) section.grade = 'WARNING';
    }
  }

  return section;
}

// ── Section 6: Security ────────────────────────────────────────
function reviewSecurity() {
  const section = { title: '6. Security', findings: [], grade: 'OK' };

  const secretPatterns = [
    { name: 'GitHub Token', pattern: /ghp_[a-zA-Z0-9]{36}/g },
    { name: 'API Key', pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"][a-zA-Z0-9]{20,}['"]/gi },
    { name: 'Password', pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]{8,}['"]/gi },
    { name: 'AWS Key', pattern: /AKIA[0-9A-Z]{16}/g },
    { name: 'Private Key', pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g },
    { name: 'OpenAI Key', pattern: /sk-[a-zA-Z0-9]{48}/g },
  ];

  const allFiles = [
    ...getAllFiles(KNOWLEDGE_DIR),
    ...getAllFiles(MEMORY_DIR),
    ...getAllFiles(SCRIPTS_DIR, '.js'),
  ];

  let hits = 0;
  for (const f of allFiles) {
    const content = fs.readFileSync(f, 'utf-8');
    for (const { name, pattern } of secretPatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(content)) {
        const rel = path.relative(EDGE_REPO, f).replace(/\\/g, '/');
        section.findings.push(`FOUND: ${name} in ${rel}`);
        hits++;
      }
    }
  }

  if (hits === 0) {
    section.findings.push('No secrets detected in committed files');
  } else {
    section.grade = 'CRITICAL';
  }

  // Check .gitignore
  const gitignore = path.resolve(EDGE_REPO, '.gitignore');
  if (fs.existsSync(gitignore)) {
    const content = fs.readFileSync(gitignore, 'utf-8');
    if (content.includes('.credentials') || content.includes('credentials')) {
      section.findings.push('PASS: .credentials in .gitignore');
    } else {
      section.findings.push('WARNING: .credentials not in .gitignore');
      if (section.grade === 'OK') section.grade = 'WARNING';
    }
  }

  return section;
}

// ── Section 7: Recommendations ─────────────────────────────────
function generateRecommendations(sections) {
  const recs = [];
  const criticals = sections.filter(s => s.grade === 'CRITICAL');
  const warnings = sections.filter(s => s.grade === 'WARNING');

  for (const s of criticals) {
    recs.push(`[CRITICAL] ${s.title}: ${s.findings.find(f => f.includes('CRITICAL') || f.includes('FAIL') || f.includes('MISSING') || f.includes('FOUND')) || 'Review section'}`);
  }
  for (const s of warnings) {
    recs.push(`[FIX] ${s.title}: ${s.findings.find(f => f.includes('ACTION') || f.includes('FAIL') || f.includes('sprawl') || f.includes('bloated') || f.includes('long') || f.includes('Recurring')) || 'Review section'}`);
  }

  if (recs.length === 0) {
    recs.push('No issues found — Edge is running healthy');
  }

  return recs.slice(0, 5);
}

// ── Report Generator ───────────────────────────────────────────
function generateReport(sections, recommendations) {
  let report = `# Oops Weekly Review — ${TODAY}\n\n`;

  // Overall grade
  const hasC = sections.some(s => s.grade === 'CRITICAL');
  const warnCount = sections.filter(s => s.grade === 'WARNING').length;
  const overall = hasC ? 'F — Critical issues' : warnCount > 2 ? 'C — Multiple concerns' : warnCount > 0 ? 'B — Minor issues' : 'A — All clear';
  report += `**Overall Grade: ${overall}**\n\n`;

  for (const s of sections) {
    const icon = s.grade === 'CRITICAL' ? '!!!' : s.grade === 'WARNING' ? '!' : 'OK';
    report += `## ${s.title} [${icon}]\n\n`;
    for (const f of s.findings) {
      report += `${f.startsWith('  ') ? f : '- ' + f}\n`;
    }
    report += '\n';
  }

  report += `## 7. Recommendations\n\n`;
  for (let i = 0; i < recommendations.length; i++) {
    report += `${i + 1}. ${recommendations[i]}\n`;
  }

  report += `\n---\n\n*Generated by Oops weekly-review.js — ${new Date().toISOString()}*\n`;
  return report;
}

// ── Telegram ───────────────────────────────────────────────────
function sendTelegram(report, overall, recommendations) {
  const CREDS_PATH = path.resolve(COO_ROOT, '.credentials', 'telegram.json');
  if (!fs.existsSync(CREDS_PATH)) return;

  const { bot_token, chat_id } = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf-8'));
  if (!bot_token || !chat_id) return;

  let msg = `Oops Weekly Review -- ${TODAY}\nGrade: ${overall}\n\n`;
  msg += `Top Actions:\n`;
  for (const r of recommendations.slice(0, 3)) {
    msg += `  ${r}\n`;
  }
  msg += `\nFull report: clawdbot-coo/reports/weekly-review-${TODAY}.md`;

  try {
    execSync(
      `curl -s -X POST "https://api.telegram.org/bot${bot_token}/sendMessage" ` +
      `--data-urlencode "chat_id=${chat_id}" ` +
      `--data-urlencode "text=${msg.replace(/"/g, '\\"')}"`,
      { encoding: 'utf-8', timeout: 15000 }
    );
    console.log('Telegram alert sent.');
  } catch (err) {
    console.error('Failed to send Telegram:', err.message);
  }
}

// ── Main ───────────────────────────────────────────────────────
function main() {
  console.log(`=== Oops Weekly Review — ${TODAY} ===\n`);
  console.log(`Edge repo: ${EDGE_REPO}`);

  if (!fs.existsSync(EDGE_REPO)) {
    console.error(`ERROR: Edge repo not found at ${EDGE_REPO}`);
    process.exit(1);
  }

  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }

  // Pull latest
  console.log('\nPulling latest from GitHub...');
  console.log(shellExec('git pull origin master --no-rebase', EDGE_REPO) || '(up to date)');

  // Run all review sections
  console.log('\nRunning weekly review...');
  const sections = [
    reviewAuditTrends(),
    reviewKBQuality(),
    reviewMemoryHygiene(),
    reviewScripts(),
    reviewEdgeHealth(),
    reviewSecurity(),
  ];

  for (const s of sections) {
    console.log(`  ${s.grade === 'OK' ? 'OK' : s.grade}: ${s.title}`);
  }

  const recommendations = generateRecommendations(sections);
  const report = generateReport(sections, recommendations);

  fs.writeFileSync(REPORT_PATH, report, 'utf-8');
  console.log(`\nReport saved: ${REPORT_PATH}`);

  // Overall grade for Telegram
  const hasC = sections.some(s => s.grade === 'CRITICAL');
  const warnCount = sections.filter(s => s.grade === 'WARNING').length;
  const overall = hasC ? 'F -- Critical issues' : warnCount > 2 ? 'C -- Multiple concerns' : warnCount > 0 ? 'B -- Minor issues' : 'A -- All clear';

  sendTelegram(report, overall, recommendations);
}

main();
