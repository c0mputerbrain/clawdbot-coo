# Weekly AI Review Prompt Template

**Copy-paste this into Claude Code once per week for a deep health check on Edge.**

Replace `[DATE]` with the current date before pasting.

---

## The Prompt

```
I need a weekly deep review of Edge's codebase (edgebot-brain). Today is [DATE].

Please analyze the following and give me a structured report:

### 1. Code Health
- Read the latest audit reports in clawdbot-coo/reports/ (last 7 days)
- Are there recurring warnings? Any trends getting worse?
- Check reports/trends.json for metric trajectories

### 2. KB Quality
- Run: node scripts/kb-update.js (in edgebot-brain)
- How many files are indexed? How many keywords?
- Are there orphan files not in the index?
- Sample 5 random KB files — do they have complete, accurate frontmatter?
- Is the topic cluster coverage good? Any obvious gaps?

### 3. Memory Hygiene
- How big is the memory/ directory?
- Are there daily logs older than 14 days that should be distilled?
- Is MEMORY.md up to date and concise?
- Any redundant or contradictory entries?

### 4. Script Inventory
- List all scripts in scripts/ with a 1-line description each
- Any scripts that look unused or redundant?
- Any scripts missing error handling?
- Is scripts/_archive/ being used properly?

### 5. Is Edge Getting Dumber?
- Compare Edge's current directives.md to what it should be
- Are there any instructions that conflict with each other?
- Is the model routing (Opus/Sonnet/Auto) still correct?
- Is the KB-SEARCH workflow referenced correctly everywhere?
- Check HEARTBEAT.md — is the knowledge capture loop intact?

### 6. Security Scan
- Any credentials, tokens, or API keys in committed files?
- Is .credentials/ properly gitignored?
- Any files with overly broad permissions?

### 7. Recommendations
- Top 3 things to fix this week (ranked by impact)
- Anything I should tell Edge to do differently?
- Any new KB categories or topic clusters needed?

Format the report as a markdown document I can save.
Give me honest assessments — I want to know if things are degrading.
```

---

## When to Run

- **Every Monday morning** before market open
- **After major Edge changes** (new skills, new KB categories, directive updates)
- **When something feels off** (Edge giving bad answers, slow responses, etc.)

## What to Do With Results

1. Fix any critical issues immediately
2. Create GitHub issues for medium-priority items
3. Update Edge's directives if needed
4. Archive the review in `clawdbot-coo/reports/weekly-review-[DATE].md`
