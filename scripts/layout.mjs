/**
 * Layout check — the fourth leg of the iteration loop.
 *
 *   audit       → every link points at a real route
 *   smoke       → every route renders
 *   integration → marketplace listings map into the archive correctly
 *   layout      → every route renders without horizontal overflow, in a browser
 *
 * Drives headless Edge/Chrome over the DevTools Protocol and evaluates the
 * overflow probe in the live page. It used to read the result out of `<title>`
 * via `--dump-dom`, but that flag silently produces no output on this machine,
 * so the check now talks to the browser directly — which is both more robust
 * and more honest, since it measures the real layout rather than a string the
 * page wrote about itself.
 *
 * Requires `npm run dev`. Skips cleanly if no browser is installed.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];
const BROWSER = BROWSERS.find((p) => existsSync(p));
const BASE = process.env.BASE_URL || 'http://localhost:5180';

const ROUTES = [
  '/', '/collections', '/collections/duel-in-the-sun', '/collections/the-amateur-line',
  '/archive', '/archive?filter=available', '/item/ds-01', '/item/ws-04',
  '/journal', '/journal/reading-a-neck-label', '/method', '/sell', '/sizing', '/nope',
  '/curate', '/curate/review',
];
const WIDTHS = [1600, 1180, 520, 390];

const C = { red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', dim: '\x1b[2m', off: '\x1b[0m' };

if (!BROWSER) {
  console.log(`\n${C.yellow}⚠ no Edge/Chrome found — skipping layout check${C.off}\n`);
  process.exit(0);
}

/* ------------------------------------------------------------------ */
/* Overflow probe — evaluated inside the page                          */
/* ------------------------------------------------------------------ */

/**
 * Elements allowed to exceed the viewport because an ancestor clips them:
 * the marquee track (inside `overflow:hidden`) and SVG internals (bounded by
 * their own viewBox).
 */
const PROBE = `(() => {
  const vw = document.documentElement.clientWidth;
  const skip = /^(svg|g|rect|path|span|defs|clippath|pattern|lineargradient|stop|use)$/;
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const tag = el.tagName.toLowerCase();
    if (skip.test(tag)) continue;
    if (el.closest('.marquee, .grain, svg')) continue;
    const r = el.getBoundingClientRect();
    if (r.width > vw + 1 || r.right > vw + 1) {
      const cls = typeof el.className === 'string' && el.className.trim()
        ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.')
        : '';
      out.push(tag + cls + '[w=' + Math.round(r.width) + ',r=' + Math.round(r.right) + ']');
    }
  }
  return JSON.stringify({
    vw,
    ready: document.readyState,
    mounted: !!document.querySelector('[data-outlet] *'),
    offenders: out.slice(0, 12),
  });
})()`;

/**
 * The curate routes hide their real layout behind a name gate — an unseeded
 * probe would measure the gate card three times and call the deck "covered".
 * So for those routes the probe first plants a practice-mode state (with
 * deliberately long, unbroken strings to stress wrapping), reloads once, and
 * only measures after the desk/deck has actually rendered.
 */
/* Bump whenever the seed shape changes — probe profiles persist across runs,
   and a stale seed silently un-measures whatever the new fields render. */
const SEED_V = 2;

const CURATE_SEED = JSON.stringify({
  name: 'Probe',
  seedV: SEED_V,
  unlocked: true, // past the passphrase gate — the probe measures the desk, not the door
  finds: [
    {
      id: 'probe-1',
      url: 'https://www.ebay.com/itm/999999999901?utm_source=layoutprobe',
      title: 'Extraordinarily long single-line title of a Slazenger lambswool sweater to stress the card layout at narrow widths',
      note: 'Averyverylongunbrokenstringthatwouldblowoutanycontainerwithoutoverflowwrapanywhereonthecardbody plus a normal tail.',
      price: 1234.56,
      source: 'eBay',
      photo: 'stock/slazenger-golden-horseshoe-wind-shirt.jpg',
      collection: '',
      submitted_by: 'Probe Teammate With A Long Name',
      status: 'new',
      decided_by: '',
      created_at: '2026-08-01T12:00:00',
      decided_at: null,
    },
    {
      id: 'probe-2',
      url: 'https://www.depop.com/products/probe-vintage-golf-pullover/',
      title: 'Sun-faded windshirt',
      note: '',
      price: 28,
      source: 'Depop',
      collection: '',
      submitted_by: 'Probe',
      status: 'new',
      decided_by: '',
      created_at: '2026-08-02T12:00:00',
      decided_at: null,
    },
    {
      id: 'probe-3',
      url: 'https://www.ebay.com/itm/999999999903',
      title: 'Already shortlisted piece',
      note: 'Keeps the pile list showing a decided row.',
      price: 55,
      source: 'eBay',
      collection: '',
      submitted_by: 'Probe',
      status: 'shortlist',
      decided_by: 'Probe',
      created_at: '2026-07-30T12:00:00',
      decided_at: '2026-08-02T12:00:00',
    },
  ],
});

function probeExpr(route) {
  if (!route.startsWith('/curate')) return PROBE;
  const readySel = route === '/curate' ? '[data-drop-form]' : '[data-deck-stage] .deck-card';
  return `(() => {
    const KEY = 'ta-curate-practice-v1';
    // reseed stale profiles too (probe ports are deterministic, so profiles
    // survive across runs — a pre-passphrase seed would stall at the gate)
    let cur = null;
    try { cur = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch {}
    if (!cur || !cur.unlocked || cur.seedV !== ${SEED_V}) {
      localStorage.setItem(KEY, ${JSON.stringify(CURATE_SEED)});
      location.reload();
      return JSON.stringify({ ready: 'seeding', mounted: false });
    }
    if (!document.querySelector('${readySel}')) {
      return JSON.stringify({ ready: 'waiting-for-desk', mounted: false });
    }
    return ${PROBE};
  })()`;
}

/* ------------------------------------------------------------------ */
/* Minimal CDP client                                                  */
/* ------------------------------------------------------------------ */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDevTools(port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await sleep(150);
  }
  throw new Error('browser DevTools endpoint never came up');
}

/**
 * Wait for the page target that is actually on our URL.
 *
 * Grabbing the first page target races the browser: immediately after launch
 * the list can contain `about:blank`, or a target mid-navigation whose
 * execution context is destroyed the moment we evaluate against it. Both
 * present as "page never mounted" on a random subset of routes each run.
 */
async function pageTarget(port, expectedUrl, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let last = [];
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await res.json();
      last = targets.map((t) => `${t.type}:${t.url}`);
      const page = targets.find(
        (t) =>
          t.type === 'page' &&
          t.webSocketDebuggerUrl &&
          t.url &&
          t.url !== 'about:blank' &&
          t.url.startsWith(expectedUrl.split('?')[0])
      );
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      /* devtools not ready */
    }
    await sleep(150);
  }
  throw new Error(`no page target on ${expectedUrl} (saw: ${last.join(', ') || 'none'})`);
}

/** One CDP session: connect, evaluate until the app has mounted, return result. */
function evaluateWhenReady(wsUrl, expression, { attempts = 25, gap = 400 } = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    let tries = 0;
    const pending = new Map();

    const call = (method, params = {}) =>
      new Promise((res) => {
        const msgId = ++id;
        pending.set(msgId, res);
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });

    const fail = (err) => {
      try { ws.close(); } catch { /* already closed */ }
      reject(err);
    };

    ws.addEventListener('error', () => fail(new Error('devtools socket error')));

    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    });

    ws.addEventListener('open', async () => {
      try {
        while (tries < attempts) {
          tries += 1;
          const msg = await call('Runtime.evaluate', {
            expression,
            returnByValue: true,
            awaitPromise: true,
          });
          const value = msg?.result?.result?.value;
          if (value) {
            const parsed = JSON.parse(value);
            // Wait for the SPA to actually mount before judging its layout.
            if (parsed.ready === 'complete' && parsed.mounted) {
              ws.close();
              return resolve(parsed);
            }
          }
          await sleep(gap);
        }
        fail(new Error('page never mounted'));
      } catch (err) {
        fail(err);
      }
    });
  });
}

/* ------------------------------------------------------------------ */
/* Probe one route at one width                                        */
/* ------------------------------------------------------------------ */

let portCursor = 9400;

async function probe(route, width) {
  const port = portCursor++;
  const child = spawn(
    BROWSER,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--hide-scrollbars',
      '--no-first-run',
      '--disable-extensions',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${process.env.TEMP || '/tmp'}\\ta-cdp-${port}`,
      `--window-size=${width},1000`,
      `${BASE}${route}`,
    ],
    { stdio: 'ignore' }
  );

  try {
    await waitForDevTools(port);
    const wsUrl = await pageTarget(port, `${BASE}${route}`);
    return await evaluateWhenReady(wsUrl, probeExpr(route));
  } finally {
    child.kill();
  }
}

/** One retry — a probe failure is far more often a race than a real defect. */
async function probeWithRetry(route, width) {
  try {
    return await probe(route, width);
  } catch (first) {
    await sleep(500);
    try {
      return await probe(route, width);
    } catch (second) {
      throw new Error(`${second.message} (first attempt: ${first.message})`);
    }
  }
}

/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Preflight                                                           */
/* ------------------------------------------------------------------ */

/*
 * Without this, a dev server that isn't running reports as "42 layout issues" —
 * which reads exactly like a catastrophic CSS regression and is really just a
 * missing process. An infrastructure failure and a real defect should never
 * look the same in a report.
 */
try {
  const res = await fetch(BASE, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`returned ${res.status}`);
} catch (err) {
  console.log(`\n${C.red}✖ cannot reach the site at ${BASE} — ${err.message}${C.off}`);
  console.log(`${C.dim}   the layout check needs the dev server: run \`npm run dev\` first${C.off}\n`);
  process.exit(1);
}

const failures = [];   // real overflow
const broken = [];     // probes that never ran
let checked = 0;

console.log(`\n${C.dim}── Tour Archive · layout check ──${C.off}`);

for (const width of WIDTHS) {
  for (const route of ROUTES) {
    try {
      const result = await probeWithRetry(route, width);
      checked += 1;
      if (result.offenders.length) {
        failures.push(`${route} @${width} (vw=${result.vw}): ${result.offenders.join(', ')}`);
      }
    } catch (err) {
      broken.push(`${route} @${width}: ${err.message}`);
    }
  }
  console.log(`${C.dim}   ${width}px — ${ROUTES.length} routes${C.off}`);
}

const total = WIDTHS.length * ROUTES.length;
console.log(`${C.dim}   ${checked}/${total} route/width combinations probed${C.off}`);

// A probe that never ran tells us nothing about the layout — report it as an
// unmeasured route, not as an overflow.
if (broken.length) {
  const label = broken.length === total ? 'every probe failed' : `${broken.length} probe(s) failed`;
  console.log(`\n${C.yellow}⚠ ${label} — these routes were NOT measured${C.off}`);
  broken.slice(0, 8).forEach((b) => console.log(`   ${b}`));
  if (broken.length > 8) console.log(`   … and ${broken.length - 8} more`);
  if (broken.length === total) {
    console.log(`${C.dim}   all of them failing usually means the dev server went away mid-run${C.off}`);
  }
}

if (failures.length) {
  console.log(`\n${C.red}✖ ${failures.length} layout issue(s)${C.off}`);
  failures.forEach((f) => console.log(`   ${f}`));
}

if (failures.length || broken.length) {
  console.log('');
  process.exit(1);
}
console.log(`\n${C.green}✔ no horizontal overflow at any tested width${C.off}\n`);
