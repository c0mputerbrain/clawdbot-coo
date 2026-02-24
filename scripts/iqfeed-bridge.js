#!/usr/bin/env node
/**
 * IQFeed HTTP Bridge
 *
 * Runs on Alex's Windows PC. Exposes IQFeed as a simple HTTP API
 * so Edge (remote server) can pull bar data on demand.
 *
 * Endpoints:
 *   GET /health              → { ok: true, iqfeed: true/false }
 *   GET /bars?symbol=AAPL&start=20260209&end=20260210  → JSON array of 5-min bars
 *       Optional: &interval=300 (default 300 = 5min)
 *       start/end = YYYYMMDD (fetches 9:30 AM → 8:00 PM ET each day)
 *
 * Usage:
 *   node iqfeed-bridge.js
 *   Then in another terminal: npx localtunnel --port 8765
 *   Send the public URL to Edge.
 */

const http = require('http');
const net = require('net');

const PORT = 8765;
const IQFEED_HOST = '127.0.0.1';
const IQFEED_PORT = 9100;

let requestCounter = 0;
const startTime = Date.now();
let lastError = null;
let errorCount = 0;

function iqfeedQuery(command, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const sock = new net.Socket();
    sock.setTimeout(timeout);
    let data = '';

    sock.connect(IQFEED_PORT, IQFEED_HOST, () => {
      sock.write('S,SET PROTOCOL,6.2\r\n');
      setTimeout(() => sock.write(command + '\r\n'), 200);
    });

    sock.on('data', chunk => {
      data += chunk.toString('latin1');
      if (data.includes('!ENDMSG!') || data.includes('NO_DATA')) {
        sock.destroy();
        resolve(data);
      }
    });

    sock.on('timeout', () => { sock.destroy(); resolve(data); });
    sock.on('error', err => { sock.destroy(); reject(err); });
  });
}

async function iqfeedQueryWithRetry(command, maxRetries = 2, timeout = 15000) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await iqfeedQuery(command, timeout);
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // 1s, 2s
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

function parseBars(raw, reqId) {
  const bars = [];
  for (const line of raw.split('\n')) {
    const l = line.trim();
    if (!l || l.includes('!ENDMSG!') || l.includes('NO_DATA') || l.startsWith('S,')) continue;

    const parts = l.split(',');
    let p = parts;
    if (p[0] === reqId) p = p.slice(1);
    // Skip "LH" message type marker if present
    if (p[0] === 'LH') p = p.slice(1);

    try {
      const ts = p[0].trim();        // "YYYY-MM-DD HH:mm:ss"
      const high = parseFloat(p[1]);
      const low = parseFloat(p[2]);
      const open = parseFloat(p[3]);
      const close = parseFloat(p[4]);
      const periodVol = parseInt(p[6]) || 0;

      if (isNaN(open) || isNaN(close)) continue;

      // IQFeed returns ET timestamps — store as-is with Z suffix
      // (Edge knows these are ET and handles conversion)
      const isoTs = ts.replace(' ', 'T') + 'Z';

      bars.push({ time: isoTs, open, high, low, close, volume: periodVol });
    } catch (e) {
      continue;
    }
  }
  return bars;
}

async function handleBars(params) {
  const symbol = params.get('symbol');
  const start = params.get('start');   // YYYYMMDD
  const end = params.get('end');       // YYYYMMDD
  const interval = params.get('interval') || '300';

  if (!symbol || !start || !end) {
    return { error: 'Need symbol, start, end params', status: 400 };
  }

  // Validate inputs
  if (!/^[A-Z]{1,10}$/.test(symbol)) {
    return { error: 'Invalid symbol — must be 1-10 uppercase letters', status: 400 };
  }
  if (!/^\d{8}$/.test(start) || !/^\d{8}$/.test(end)) {
    return { error: 'Invalid date format — use YYYYMMDD', status: 400 };
  }
  const validIntervals = ['60', '120', '180', '300', '600', '900', '1800', '3600'];
  if (!validIntervals.includes(interval)) {
    return { error: `Invalid interval — use one of: ${validIntervals.join(', ')}`, status: 400 };
  }

  const reqId = `R${++requestCounter}`;
  const begin = `${start} 040000`;  // 4 AM for pre-market
  const endTime = `${end} 200000`;  // 8 PM for post-market

  const cmd = `HIT,${symbol},${interval},${begin},${endTime},,,,1,${reqId}`;

  try {
    const raw = await iqfeedQueryWithRetry(cmd);
    const bars = parseBars(raw, reqId);
    return { data: bars, count: bars.length, symbol, start, end };
  } catch (err) {
    return { error: err.message, status: 500 };
  }
}

async function handleHealth() {
  try {
    const sock = new net.Socket();
    await new Promise((resolve, reject) => {
      sock.setTimeout(3000);
      sock.connect(IQFEED_PORT, IQFEED_HOST, () => { sock.destroy(); resolve(); });
      sock.on('error', reject);
      sock.on('timeout', () => { sock.destroy(); reject(new Error('timeout')); });
    });
    return { ok: true, iqfeed: true };
  } catch {
    return { ok: true, iqfeed: false, message: 'IQConnect not reachable on port 9100' };
  }
}

async function handleStatus() {
  const health = await handleHealth();
  return {
    uptime: Math.floor((Date.now() - startTime) / 1000),
    requests: requestCounter,
    errors: errorCount,
    lastError,
    iqfeed: health.iqfeed
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    let result;
    if (url.pathname === '/health') {
      result = await handleHealth();
    } else if (url.pathname === '/bars') {
      result = await handleBars(url.searchParams);
    } else if (url.pathname === '/status') {
      result = await handleStatus();
    } else {
      result = { error: 'Not found. Use /health or /bars', status: 404 };
    }

    const status = result.status || 200;
    delete result.status;
    res.writeHead(status);
    res.end(JSON.stringify(result));
  } catch (err) {
    errorCount++;
    lastError = { message: err.message, time: new Date().toISOString() };
    res.writeHead(500);
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, () => {
  console.log(`\n🔌 IQFeed Bridge running on http://localhost:${PORT}`);
  console.log(`\nEndpoints:`);
  console.log(`  GET /health`);
  console.log(`  GET /bars?symbol=AAPL&start=20260209&end=20260210`);
  console.log(`\nNext step: open another terminal and run:`);
  console.log(`  npx localtunnel --port ${PORT}`);
  console.log(`\nThen send the public URL to Edge.\n`);
});
