#!/usr/bin/env node
/**
 * Cloudflare Tunnel Launcher
 *
 * Starts a Cloudflare quick tunnel for the IQFeed bridge,
 * captures the public URL, updates the repo, and pushes to GitHub
 * so Edge always has the latest URL.
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CLOUDFLARED = 'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe';
const BRIDGE_PORT = 8765;
const REPO_DIR = 'C:\\Users\\alexp\\edgebot-brain';
const BRIDGE_MD = path.join(REPO_DIR, 'tasks', 'iqfeed-bridge.md');

function log(msg) {
  console.log(`[tunnel] ${new Date().toLocaleTimeString()} — ${msg}`);
}

function updateRepo(newUrl) {
  try {
    const md = fs.readFileSync(BRIDGE_MD, 'utf8');
    const updated = md.replace(
      /https:\/\/[a-z0-9-]+\.trycloudflare\.com/g,
      newUrl
    );

    if (updated === md) {
      log('URL in repo already matches, skipping push');
      return;
    }

    fs.writeFileSync(BRIDGE_MD, updated, 'utf8');
    log('Updated tasks/iqfeed-bridge.md with new URL');

    // Workaround for case-sensitivity issue with video files
    execSync('git update-index --assume-unchanged memory/trade-ideas/videos-edu.json memory/trade-ideas/videos-guide.json memory/trade-ideas/videos-help.json', { cwd: REPO_DIR, stdio: 'ignore' });

    execSync('git add tasks/iqfeed-bridge.md', { cwd: REPO_DIR });
    execSync('git commit -m "Update IQFeed tunnel URL (auto)"', { cwd: REPO_DIR });
    execSync('git pull --rebase origin master', { cwd: REPO_DIR });
    execSync('git push', { cwd: REPO_DIR });

    // Undo assume-unchanged
    execSync('git update-index --no-assume-unchanged memory/trade-ideas/videos-edu.json memory/trade-ideas/videos-guide.json memory/trade-ideas/videos-help.json', { cwd: REPO_DIR, stdio: 'ignore' });

    log('Pushed new URL to GitHub — Edge will see it on next git pull');
  } catch (err) {
    log(`Failed to update repo: ${err.message}`);
  }
}

function sendTelegramAlert(message) {
  try {
    const credsPath = path.join(__dirname, '..', '.credentials', 'telegram.json');
    if (!fs.existsSync(credsPath)) return;
    const { bot_token, chat_id } = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
    if (!bot_token || !chat_id) return;
    execSync(
      `curl -s -X POST "https://api.telegram.org/bot${bot_token}/sendMessage" ` +
      `--data-urlencode "chat_id=${chat_id}" ` +
      `--data-urlencode "text=${message.replace(/"/g, '\\"')}"`,
      { timeout: 10000 }
    );
    log('Telegram alert sent');
  } catch (err) {
    log(`Telegram alert failed: ${err.message}`);
  }
}

function startTunnel() {
  log(`Starting Cloudflare tunnel for localhost:${BRIDGE_PORT}...`);

  const proc = spawn(CLOUDFLARED, ['tunnel', '--url', `http://localhost:${BRIDGE_PORT}`], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let captured = false;

  function handleOutput(data) {
    const text = data.toString();
    process.stderr.write(text);

    if (!captured) {
      const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match) {
        captured = true;
        const url = match[0];
        log(`Tunnel URL: ${url}`);
        // Give it a moment to fully establish before updating repo
        setTimeout(() => updateRepo(url), 5000);

        // Start health check loop (60s grace period, then every 30s)
        setTimeout(() => {
          const healthInterval = setInterval(async () => {
            try {
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 5000);
              const resp = await fetch(`${url}/health`, { signal: controller.signal });
              clearTimeout(timeout);
              if (!resp.ok) throw new Error(`Health check returned ${resp.status}`);
            } catch (err) {
              log(`Health check FAILED: ${err.message}`);
              sendTelegramAlert(`IQFeed tunnel health check failed: ${err.message}\nTunnel URL: ${url}`);
            }
          }, 30000);

          proc.on('exit', () => clearInterval(healthInterval));
        }, 60000);
      }
    }
  }

  proc.stdout.on('data', handleOutput);
  proc.stderr.on('data', handleOutput);

  proc.on('exit', (code) => {
    log(`Tunnel exited with code ${code}. Restarting in 10 seconds...`);
    sendTelegramAlert(`IQFeed tunnel died (exit code ${code}). Restarting in 10s...`);
    setTimeout(startTunnel, 10000);
  });
}

startTunnel();
