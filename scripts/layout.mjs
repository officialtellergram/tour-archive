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
  '/collections/basic-stock',
  '/journal', '/journal/reading-a-neck-label', '/mission', '/sell', '/sizing', '/privacy', '/nope',
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
  // Freeze animations before measuring: the gate's subject is LAYOUT, and a
  // mid-drift hero plate at scale 1.06 "protrudes" past the viewport without
  // ever being visible outside its clipped container. Animations reset to
  // their base state; genuine overflow still measures as overflow.
  if (!document.querySelector('style[data-probe-freeze]')) {
    const s = document.createElement('style');
    s.setAttribute('data-probe-freeze', '');
    s.textContent = '* { animation: none !important; transition: none !important; }';
    document.head.appendChild(s);
  }
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
const SEED_V = 5;

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
      created_at: '2026-07-28T12:00:00',
      decided_at: null,
      dress_tries: 0,
      looked_at: null,
      show_anyway: false,
    },
    {
      id: 'probe-2',
      url: 'https://www.depop.com/products/probe-vintage-golf-pullover/',
      title: 'Sun-faded windshirt',
      note: '',
      price: 28,
      source: 'Depop',
      photo: '',
      collection: '',
      submitted_by: 'Probe',
      status: 'new',
      decided_by: '',
      created_at: '2026-08-02T12:00:00',
      decided_at: null,
      dress_tries: 0,
      looked_at: null,
      show_anyway: false,
    },
    {
      // shortlisted AND dressed — renders the desk's shortlist block, so it
      // carries a real photo and a name long enough to stress the row at 390px
      id: 'probe-3',
      url: 'https://www.ebay.com/itm/999999999903',
      title: 'Already shortlisted — a sun-faded Slazenger pullover, club crest intact, with an extraordinarily long name and nowhere to wrap it',
      note: 'Keeps the pile list showing a decided row.',
      price: 55,
      source: 'eBay',
      photo: 'stock/sun-faded-golf-pullover.jpg',
      collection: '',
      submitted_by: 'Probe',
      status: 'shortlist',
      decided_by: 'Probe',
      created_at: '2026-07-30T12:00:00',
      decided_at: '2026-08-02T12:00:00',
      dress_tries: 0,
      looked_at: null,
      show_anyway: false,
    },
    {
      // given-up: the "Still bare" chip + the longest reason line the UI makes
      id: 'probe-4',
      url: 'https://www.ebay.com/itm/999999999904',
      title: '',
      note: '',
      price: null,
      source: 'eBay',
      photo: '',
      collection: '',
      submitted_by: 'Probe',
      status: 'new',
      decided_by: '',
      created_at: '2026-07-20T12:00:00',
      decided_at: null,
      dress_tries: 3,
      looked_at: '2026-07-30T12:00:00',
      show_anyway: false,
    },
    {
      // sent-anyway with no photo: keeps the TEXT-ONLY deck card measured now
      // that the gate would otherwise keep bare cards out of the deck. Its
      // title carries the long/unbroken stress — this is the UNCLAMPED variant
      id: 'probe-5',
      url: 'https://www.depop.com/products/probe-shown-anyway/',
      title: 'Shown-anyway piece with an extraordinarily long unbroken Averyverylongunbrokenstringtitle name',
      note: 'Forced through by a person; the deck deals it bare.',
      price: 32,
      source: 'Depop',
      photo: '',
      collection: '',
      submitted_by: 'Probe',
      status: 'new',
      decided_by: '',
      created_at: '2026-08-01T12:00:00',
      decided_at: null,
      dress_tries: 1,
      looked_at: '2026-08-02T12:00:00',
      show_anyway: true,
    },
    {
      // shortlisted with NO photo: the photo-forward row's text-only fallback,
      // reachable in production (Show it anyway → swipe right) and otherwise
      // never measured at any width. Also priceless — three states at once.
      id: 'probe-6',
      url: 'https://www.depop.com/products/probe-bare-shortlist/',
      title: 'Shortlisted but never dressed',
      note: '',
      price: null,
      source: 'Depop',
      photo: '',
      collection: '',
      submitted_by: 'Probe',
      status: 'shortlist',
      decided_by: 'Probe',
      created_at: '2026-07-29T12:00:00',
      decided_at: '2026-08-02T12:00:00',
      dress_tries: 3,
      looked_at: '2026-07-31T12:00:00',
      show_anyway: true,
    },
  ],
});

function probeExpr(route) {
  if (route.startsWith('/item/stock-')) {
    // The only check that ever measures the composed PDP with a carousel
    // (smoke's store is never init()ed, so its /item/ cases render the 404).
    // The missing-item empty-state must never green-light this route: wait
    // for the thumb rail, and let probe exhaustion land it in `broken`.
    return `(() => {
      if (!document.querySelector('[data-pdp-thumbs] [data-idx]')) {
        return JSON.stringify({ ready: 'waiting-for-carousel', mounted: false });
      }
      return ${PROBE};
    })()`;
  }
  if (!route.startsWith('/curate')) return PROBE;
  const readySel = route === '/curate' ? '[data-drop-form]' : '[data-deck-stage] .deck-card';
  return `(() => {
    const KEY = 'ta-curate-practice-v1';
    // reseed stale profiles too (probe ports are deterministic, so profiles
    // survive across runs — a pre-passphrase seed would stall at the gate)
    let cur = null;
    try { cur = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch {}
    if (!cur || !cur.unlocked || cur.seedV !== ${SEED_V} ||
        localStorage.getItem('ta-curate-force-practice') !== '1') {
      // force practice mode so the probe measures the desk without real
      // credentials, even now that live keys ship in the bundle
      localStorage.setItem('ta-curate-force-practice', '1');
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

/*
 * The stock-PDP carousel route needs the inventory API (in dev the store reads
 * http://localhost:5181/api/inventory; without it the shop boots EMPTY and
 * /item/stock-* renders the 404). Derive the fixture from live inventory — the
 * first stock piece carrying a carousel — so no single piece is load-bearing.
 * Default dev origin only: a BASE-overridden run serves the built snapshot.
 * This preflight doubles as a tripwire that mapManifestItem still emits photos.
 */
if (BASE === 'http://localhost:5180') {
  try {
    const res = await fetch('http://localhost:5181/api/inventory', { signal: AbortSignal.timeout(5000) });
    const inv = await res.json();
    const withCarousel = (inv.items || []).filter(
      (i) => String(i.id).startsWith('stock-') && Array.isArray(i.photos) && i.photos.length >= 2
    );
    // prefer a specifics-bearing piece so the About-this-piece facts list is
    // measured once data exists; fall back so pre-sweep runs still pass
    const hit = withCarousel.find((i) => i.specifics && Object.keys(i.specifics).length) || withCarousel[0];
    if (!hit) throw new Error('no stock item carries a carousel — the thumb rail cannot be measured');
    ROUTES.push(`/item/${hit.id}`);
  } catch (err) {
    console.log(`\n${C.red}✖ the stock PDP route needs the inventory API — ${err.message}${C.off}`);
    console.log(`${C.dim}   run \`npm run server\` alongside \`npm run dev\` (note its 900s cache: restart or POST /api/sync after manifest edits)${C.off}\n`);
    process.exit(1);
  }
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
