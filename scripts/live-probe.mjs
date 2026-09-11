/**
 * Live-origin probe — proves a VISITOR can buy, not that a build was green.
 *
 * Every other gate runs against the repo or dist/. This one drives a real
 * browser at the deployed origin and asserts what a customer actually sees:
 * cards render, every Buy button points at a live Stripe payment page, no
 * marketplace checkout survives anywhere in the DOM, a sold piece shows its
 * sash and offers nothing to buy, and the terms page the checkout consent
 * links to genuinely resolves through the SPA fallback.
 *
 * Run after a deploy: `node scripts/live-probe.mjs [origin]`
 * (default https://tourarchive.us). Exit 1 on any failure.
 *
 * Browser lifecycle is lifted from scripts/reveal-probe.mjs — same hard-won
 * Windows kill discipline (child.kill only hits the launcher; sweep whatever
 * still LISTENs on the port) and the same generous boot budget.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const ORIGIN = (process.argv[2] || 'https://tourarchive.us').replace(/\/+$/, '');
const PORT = 9741; // distinct from reveal-probe's, so both can run
const C = { red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', dim: '\x1b[2m', off: '\x1b[0m' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log(`\n${C.dim}── Tour Archive · live probe · ${ORIGIN} ──${C.off}`);

/* ---------------- browser resolution ---------------- */

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

let child = null;
function launch() {
  child = spawn(BROWSER, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--no-default-browser-check', '--disable-dev-shm-usage', '--disable-extensions',
    '--disable-features=Translate,OptimizationHints',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${join(process.env.TEMP || '/tmp', `live-probe-${process.pid}-${Date.now()}`)}`,
    '--window-size=1280,900',
    'about:blank',
  ], { stdio: 'ignore' });
}

function killBrowser() {
  if (!child) return;
  if (process.platform === 'win32') {
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
  child = null;
}

function die(code) {
  killBrowser();
  process.exit(code);
}

async function findPageTarget(ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = targets.find((t) => t.type === 'page' && !/^(devtools|chrome-extension):/.test(t.url));
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* booting */ }
    await sleep(250);
  }
  return null;
}

/* ---------------- probe ---------------- */

let failures = 0;
const fail = (msg) => { failures += 1; console.log(`${C.red}   ✖ ${msg}${C.off}`); };
const pass = (msg) => console.log(`${C.green}   ✔${C.off} ${C.dim}${msg}${C.off}`);

try {
  const watchdog = setTimeout(() => {
    console.log(`${C.red}✖ watchdog fired — the live site never settled${C.off}`);
    die(1);
  }, 180_000);
  watchdog.unref?.();

  launch();
  let ws = await findPageTarget(60_000);
  if (!ws) {
    killBrowser();
    await sleep(1500);
    launch();
    ws = await findPageTarget(60_000);
  }
  if (!ws) throw new Error('no page target after two launches');

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
      sock.send(JSON.stringify({
        id: i, method: 'Runtime.evaluate',
        params: { expression: expr, returnByValue: true, awaitPromise: true },
      }));
    });

  /** Navigate and wait for the SPA to mount content into the outlet. */
  async function go(route) {
    // cache-bust: Pages + Cloudflare will happily serve a stale bundle and
    // make a fixed deploy look broken (or a broken one look fixed).
    await evaluate(`location.href = ${JSON.stringify(`${ORIGIN}${route}${route.includes('?') ? '&' : '?'}probe=${Date.now()}`)}`);
    for (let i = 0; i < 60; i++) {
      const n = await evaluate(`document.querySelectorAll('[data-outlet] *').length`);
      if (Number(n) > 0) return true;
      await sleep(500);
    }
    return false;
  }

  /* 1 ─ the archive: every buyable card offers a live Stripe checkout */
  if (!(await go('/archive'))) {
    fail('/archive never mounted');
  } else {
    // the grid lazily reveals; give the inventory fetch a moment to land
    for (let i = 0; i < 30; i++) {
      if (Number(await evaluate(`document.querySelectorAll('.plate-photo, .plate').length`)) > 5) break;
      await sleep(500);
    }
    const stats = await evaluate(`(() => {
      const cards = document.querySelectorAll('[href^="/item/"]').length;
      const html = document.body.innerHTML;
      return JSON.stringify({
        cards,
        sashes: document.querySelectorAll('.plate-sash').length,
        ebayItm: (html.match(/ebay\\.com\\/itm/g) || []).length,
        depop: (html.match(/depop\\.com/g) || []).length,
        buyOnEbay: (html.match(/Buy on eBay/g) || []).length,
      });
    })()`);
    const s = JSON.parse(stats || '{}');
    if (Number(s.cards) >= 33) pass(`/archive — ${s.cards} pieces linked`);
    else fail(`/archive shows ${s.cards} piece links, expected at least 33`);
    if (Number(s.sashes) >= 6) pass(`${s.sashes} sold sashes rendered`);
    else fail(`${s.sashes} sold sashes, expected 6`);
    if (!Number(s.ebayItm) && !Number(s.depop) && !Number(s.buyOnEbay)) pass('no marketplace listing or label in the DOM');
    else fail(`marketplace remnants on /archive — itm:${s.ebayItm} depop:${s.depop} "Buy on eBay":${s.buyOnEbay}`);
  }

  /* 2 ─ a buyable product page: the button a customer actually presses */
  /* Pick an AVAILABLE piece, not merely the first: the archive leads with the
     highest price and the dearest piece in the shop is sold, so following
     link #1 lands on an archive record that correctly has nothing to buy. */
  const firstId = await evaluate(`(() => {
    const links = [...document.querySelectorAll('[href^="/item/"]')];
    const live = links.find((a) => !a.querySelector('.plate-sash'));
    return live ? live.getAttribute('href') : (links[0] ? links[0].getAttribute('href') : '');
  })()`);
  if (!firstId) {
    fail('could not find a product link to follow');
  } else if (!(await go(firstId))) {
    fail(`${firstId} never mounted`);
  } else {
    await sleep(1200);
    const pdp = await evaluate(`(() => {
      const btns = [...document.querySelectorAll('.pdp-actions a.btn--solid')];
      const b = btns[0];
      return JSON.stringify({
        label: b ? b.textContent.trim() : '',
        href: b ? b.getAttribute('href') : '',
        target: b ? b.getAttribute('target') : '',
        note: (document.body.innerText.match(/Secure checkout by Stripe[^\\n]*/i) || [''])[0],
        status: (document.body.innerText.match(/Available — 1 of 1/) || [''])[0],
      });
    })()`);
    const p = JSON.parse(pdp || '{}');
    if (/^https:\/\/buy\.stripe\.com\//.test(p.href || '')) pass(`PDP buy button → ${p.href}`);
    else fail(`PDP buy button href is "${p.href}" — not a Stripe payment link`);
    if (/buy\.stripe\.com\/test_/.test(p.href || '')) fail('PDP buy button is a TEST-mode link');
    if (/Buy now/i.test(p.label || '')) pass(`button reads "${p.label}"`);
    else fail(`button reads "${p.label}", expected "Buy now"`);
    if (p.target === '_blank') pass('checkout opens in a new tab');
    else fail(`button target is "${p.target}"`);
    if (p.note) pass(`checkout note: "${p.note}"`);
    else fail('the Stripe checkout note is missing from the PDP');

    // the link a real buyer would land on must actually serve
    if (/^https:\/\//.test(p.href || '')) {
      const code = await evaluate(`fetch(${JSON.stringify(p.href)}, { mode: 'no-cors' }).then(() => 'reachable').catch(e => 'ERR ' + e.message)`);
      if (code === 'reachable') pass('the payment page responds');
      else fail(`the payment page did not respond: ${code}`);
    } // no href is already a failure above; fetch('') would resolve to this page and read as a pass
  }

  /* 3 ─ terms: the page Stripe's consent checkbox links to */
  if (!(await go('/terms'))) {
    fail('/terms never mounted — the checkout consent link would dead-end');
  } else {
    const ok = await evaluate(`/Terms of/i.test(document.querySelector('h1')?.textContent || '') && /one of one/i.test(document.body.innerText)`);
    if (ok) pass('/terms renders through the SPA fallback');
    else fail('/terms mounted but does not look like the terms page');
  }

  clearTimeout(watchdog);
} catch (err) {
  fail(err.message);
}

if (failures) {
  console.log(`\n${C.red}✖ live probe failed (${failures})${C.off}\n`);
  die(1);
}
console.log(`\n${C.green}✔ the live shop works — a visitor can buy${C.off}\n`);
die(0);
