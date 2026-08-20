/**
 * Reveal gate — proves scroll-revealed content actually reveals.
 *
 * The layout gate freezes animations before measuring, which makes it
 * structurally blind to this bug class: reveal choreography that hides
 * content and then never fires its trigger. Proven live 20 Aug 2026 — at 27
 * pieces the mobile shop grid grew to ~18,000px, inView's fractional
 * `amount` became unsatisfiable on a 390x844 viewport, and every listing
 * held at opacity 0. The failure is GROWTH-triggered (fine at 14 items,
 * broken at 27), so this probe runs in the deploy workflow — every push AND
 * the daily rebuild — not just when code changes.
 *
 * Mechanics: serves dist/ in-process (SPA fallback), drives a headless
 * browser at 390x844 with animations LIVE, scrolls through each route the
 * way a thumb would, then asserts every reveal-owned node ([data-stagger]
 * children and [data-reveal] elements) reached opacity 1. Exit 1 on any
 * still-invisible node. Needs dist/ (run after a build).
 *
 * Browser: Windows Edge, or Chrome/Chromium on PATH (CI runners), or
 * $PROBE_BROWSER.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const PORT = 9741;
const ROUTES = ['/', '/archive'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const C = { red: '\x1b[31m', green: '\x1b[32m', dim: '\x1b[2m', off: '\x1b[0m' };

if (!existsSync(join(DIST, 'index.html'))) {
  console.log(`${C.red}✖ dist/index.html missing — build first (npm run build:pages)${C.off}`);
  process.exit(1);
}

/* ---------------- browser resolution (Windows Edge or CI Chrome) ---------------- */

const WIN_EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
function resolveBrowser() {
  if (process.env.PROBE_BROWSER) return process.env.PROBE_BROWSER;
  const edge = WIN_EDGE.find((p) => existsSync(p));
  if (edge) return edge;
  for (const name of ['google-chrome-stable', 'google-chrome', 'chromium-browser', 'chromium']) {
    const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', [name], { encoding: 'utf8' });
    if (which.status === 0 && which.stdout.trim()) return which.stdout.trim().split('\n')[0].trim();
  }
  return null;
}
const BROWSER = resolveBrowser();
if (!BROWSER) {
  console.log(`${C.red}✖ no browser found — install Edge/Chrome or set PROBE_BROWSER${C.off}`);
  process.exit(1);
}

/* ---------------- tiny static server for dist/ (SPA fallback) ---------------- */

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain',
};
const server = createServer((req, res) => {
  const clean = normalize(decodeURIComponent((req.url || '/').split('?')[0])).replace(/^([/\\])+/, '');
  let file = join(DIST, clean);
  try {
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  } catch {
    file = join(DIST, 'index.html');
  }
  if (!file.startsWith(DIST)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = readFileSync(file);
    res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
const serverPort = await new Promise((res) => server.listen(0, '127.0.0.1', () => res(server.address().port)));
const BASE = `http://127.0.0.1:${serverPort}`;

/* ---------------- browser lifecycle (per-platform kill discipline) ---------------- */

const child = spawn(BROWSER, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${join(process.env.TEMP || '/tmp', `reveal-probe-${process.pid}-${Date.now()}`)}`,
  '--window-size=390,844',
  BASE + ROUTES[0],
], { stdio: 'ignore' });

function die(code) {
  if (process.platform === 'win32') {
    /* child.kill() only hits the launcher on Windows — tree-kill, then sweep
       whatever still LISTENs on the port (Edge can re-exec past the tree). */
    try { spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ }
    try {
      const net = spawnSync('netstat', ['-ano'], { encoding: 'utf8' });
      const line = (net.stdout || '').split('\n').find((l) => l.includes(`:${PORT}`) && /LISTENING/i.test(l));
      const pid = line?.trim().split(/\s+/).pop();
      if (pid && Number(pid) > 4) spawnSync('taskkill', ['/PID', pid, '/T', '/F'], { stdio: 'ignore' });
    } catch { /* best effort */ }
  } else {
    try { child.kill('SIGKILL'); } catch { /* gone */ }
  }
  try { server.close(); } catch { /* closing */ }
  process.exit(code);
}

/* ---------------- CDP plumbing ---------------- */

try {
  const watchdog = setTimeout(() => {
    console.log(`${C.red}✖ watchdog fired — page never settled${C.off}`);
    die(1);
  }, 120_000);
  watchdog.unref?.();

  let ws;
  for (let i = 0; i < 80 && !ws; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = targets.find((t) => t.type === 'page' && t.url.includes('127.0.0.1'));
      if (page) ws = page.webSocketDebuggerUrl;
    } catch { /* booting */ }
    await sleep(250);
  }
  if (!ws) throw new Error('no page target');

  const sock = new WebSocket(ws);
  await new Promise((res, rej) => { sock.onopen = res; sock.onerror = rej; });
  let id = 0;
  const pending = new Map();
  sock.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  const evaluate = (expr) =>
    new Promise((res) => {
      const i = ++id;
      pending.set(i, (m) => res(m?.result?.result?.value));
      sock.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } }));
    });

  let failures = 0;

  for (const route of ROUTES) {
    await evaluate(`location.href = ${JSON.stringify(BASE + route)}`);
    // Wait for the SPA to mount something.
    let mounted = false;
    for (let i = 0; i < 40 && !mounted; i++) {
      const n = await evaluate(`document.querySelectorAll('[data-outlet] *').length`);
      if (Number(n) > 0) mounted = true;
      else await sleep(500);
    }
    if (!mounted) {
      console.log(`${C.red}✖ ${route}: app never mounted${C.off}`);
      failures++;
      continue;
    }
    await sleep(800);

    // Thumb-scroll the full document so every reveal trigger gets its chance.
    await evaluate(`(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const de = document.scrollingElement || document.documentElement;
      for (let y = 0; y <= de.scrollHeight; y += 700) {
        window.scrollTo(0, y);
        await sleep(90);
      }
      window.scrollTo(0, de.scrollHeight);
      return 'ok';
    })()`);
    await sleep(2500); // stagger tail on the largest grid

    const raw = await evaluate(`(() => {
      const owned = [
        ...document.querySelectorAll('[data-stagger] > *'),
        ...document.querySelectorAll('[data-reveal]'),
      ];
      const stuck = [];
      for (const el of owned) {
        const o = Number(getComputedStyle(el).opacity);
        if (o < 0.9) {
          const cls = typeof el.className === 'string' && el.className.trim()
            ? '.' + el.className.trim().split(/\\s+/)[0] : '';
          stuck.push(el.tagName.toLowerCase() + cls + '@' + o.toFixed(2));
        }
      }
      return JSON.stringify({ owned: owned.length, stuck: stuck.slice(0, 8), stuckCount: stuck.length });
    })()`);
    const r = JSON.parse(raw || '{}');
    if (r.stuckCount > 0) {
      console.log(`${C.red}✖ ${route}: ${r.stuckCount}/${r.owned} reveal-owned nodes never revealed — ${r.stuck.join(', ')}${C.off}`);
      failures++;
    } else {
      console.log(`${C.green}✔${C.off} ${route} ${C.dim}— ${r.owned} reveal-owned nodes all visible after scroll-through${C.off}`);
    }
  }

  if (failures) {
    console.log(`${C.red}✖ reveal gate failed — content stays invisible on a 390x844 viewport${C.off}`);
    die(1);
  }
  console.log(`${C.green}✔ reveal gate clean — everything scroll-revealed actually reveals${C.off}`);
  die(0);
} catch (e) {
  console.log(`${C.red}✖ probe error: ${e.message}${C.off}`);
  die(1);
}
