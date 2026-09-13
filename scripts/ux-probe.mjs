/**
 * UX laws probe — the measurable half of the 20-law review.
 *
 * The house keeps a UX-law checklist (docs/UX-LAWS.md). Most of those laws
 * are judgement calls a person has to make in front of the page, but six of
 * them reduce to numbers a browser can read, and numbers are what stop a
 * review from becoming a matter of taste:
 *
 *   Fitts's law            every tap target at least 44x44 CSS px
 *   Minimize target dist.  the primary action reachable, not stranded
 *   Hick's law             how many choices a screen actually offers
 *   Miller's law           how many items sit in any one group
 *   Doherty threshold      click to visible response under 400 ms
 *   Von Restorff effect    exactly one emphasised action per screen
 *
 * Runs at phone width by default, because that is where a thumb, a small
 * screen and a slow connection make every one of these bite hardest.
 *
 *   node scripts/ux-probe.mjs                  # against dist/ (build first)
 *   node scripts/ux-probe.mjs https://tourarchive.us
 *   node scripts/ux-probe.mjs --width 1280
 *
 * Reports, never fails a build: these are design pressures to weigh, not
 * invariants. The gates in audit/smoke/integration are where correctness
 * lives; this is where craft gets measured.
 */

import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const PORT = 9761;
const C = { red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', dim: '\x1b[2m', bold: '\x1b[1m', off: '\x1b[0m' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const args = process.argv.slice(2);
const ORIGIN_ARG = args.find((a) => /^https?:\/\//.test(a));
const WIDTH = Number((args.find((a) => a.startsWith('--width')) || '').split('=')[1] || args[args.indexOf('--width') + 1] || 390);
const HEIGHT = WIDTH >= 1000 ? 900 : 844;

const TAP_MIN = 44; // WCAG 2.5.5 AAA / Apple HIG
const DOHERTY_MS = 400;
const MILLER_MAX = 9; // 7 +/- 2, taken at the generous end

const ROUTES = ['/', '/archive', '/collections'];

/* ---------------- serve dist/ when no origin is given ---------------- */

let BASE = ORIGIN_ARG;
let server = null;
if (!BASE) {
  if (!existsSync(DIST)) {
    console.log(`${C.red}✖ dist/ missing — run npm run build:pages, or pass an origin${C.off}`);
    process.exit(1);
  }
  const MIME = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
    '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  };
  server = createServer((req, res) => {
    const clean = normalize(decodeURIComponent((req.url || '/').split('?')[0])).replace(/^([/\\])+/, '');
    let file = join(DIST, clean);
    try { if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html'); }
    catch { file = join(DIST, 'index.html'); }
    try {
      res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream' });
      res.end(readFileSync(file));
    } catch { res.writeHead(404).end(); }
  });
  const port = await new Promise((r) => server.listen(0, '127.0.0.1', () => r(server.address().port)));
  BASE = `http://127.0.0.1:${port}`;
}

/* ---------------- browser ---------------- */

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find(existsSync) || process.env.PROBE_BROWSER;
if (!EDGE) {
  console.log(`${C.red}✖ no browser found — set PROBE_BROWSER${C.off}`);
  process.exit(1);
}

const child = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--disable-dev-shm-usage',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${join(process.env.TEMP || '/tmp', `ux-probe-${process.pid}`)}`,
  `--window-size=${WIDTH},${HEIGHT}`, 'about:blank',
], { stdio: 'ignore' });

function cleanup(code) {
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGKILL');
  } catch { /* gone */ }
  try { server?.close(); } catch { /* closing */ }
  process.exit(code);
}

let ws = null;
for (let i = 0; i < 120 && !ws; i++) {
  try {
    const t = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    ws = t.find((x) => x.type === 'page')?.webSocketDebuggerUrl;
  } catch { /* booting */ }
  if (!ws) await sleep(250);
}
if (!ws) { console.log(`${C.red}✖ browser yielded no tab${C.off}`); cleanup(1); }

const sock = new WebSocket(ws);
await new Promise((res, rej) => { sock.onopen = res; sock.onerror = rej; });
let id = 0;
const pending = new Map();
sock.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const evaluate = (expression) =>
  new Promise((res) => {
    const i = ++id;
    pending.set(i, (m) => res(m?.result?.result?.value));
    sock.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }));
  });

async function go(route) {
  await evaluate(`location.href = ${JSON.stringify(`${BASE}${route}?ux=${Date.now()}`)}`);
  for (let i = 0; i < 80; i++) {
    if (Number(await evaluate(`document.querySelectorAll('[data-outlet] *').length`)) > 0) break;
    await sleep(250);
  }
  await sleep(1800); // let stock land and reveals settle
}

/* ---------------- the measurements ---------------- */

const MEASURE = `(() => {
  // A closed drawer is clip-path'd, not display:none — its links still report
  // a box and would be counted as choices the screen offers and targets the
  // thumb must hit, neither of which is true while it is shut. aria-hidden is
  // the honest signal, and it is already correct in the markup.
  const vis = (el) => {
    if (el.closest('[aria-hidden="true"], [hidden], [inert]')) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.01;
  };
  const label = (el) => {
    const t = (el.getAttribute('aria-label') || el.textContent || '').replace(/\\s+/g, ' ').trim();
    return t.slice(0, 42) || '<' + el.tagName.toLowerCase() + '>';
  };
  const interactive = [...document.querySelectorAll('a[href], button, input, select, [role="button"]')].filter(vis);

  /*
   * Fitts: a target smaller than a fingertip is a target you miss — but the
   * BOX is not the target. A hit-area overlay (::after, negative inset) grows
   * the region that responds to a press without moving a pixel of type, and
   * measuring getBoundingClientRect alone reports those controls as failing
   * when a thumb lands on them perfectly well.
   *
   * So test what actually happens: aim a 44x44 press centred on the element
   * and ask the document what it would hit at each corner. If every corner
   * resolves back to this control, the target is big enough however it was
   * built.
   */
  const R = ${TAP_MIN} / 2;
  const covers = (el, r) => {
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const pts = [[cx - R + 1, cy - R + 1], [cx + R - 1, cy - R + 1], [cx - R + 1, cy + R - 1], [cx + R - 1, cy + R - 1]];
    return pts.every(([x, y]) => {
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false;
      const hit = document.elementFromPoint(x, y);
      return !!hit && (hit === el || el.contains(hit) || hit.contains(el));
    });
  };
  const small = interactive
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ el, r }) => (r.width < ${TAP_MIN} || r.height < ${TAP_MIN}) && !covers(el, r))
    .map(({ el, r }) => ({ label: label(el), w: Math.round(r.width), h: Math.round(r.height), tag: el.tagName.toLowerCase() }));

  // Hick: choices offered at once, split by what is on screen at rest vs total.
  const inView = interactive.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.top < innerHeight && r.bottom > 0;
  });

  // Von Restorff: one thing should look like THE thing to do.
  const emphasised = interactive.filter((el) => el.classList.contains('btn--solid'));
  const emphasisedInView = emphasised.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.top < innerHeight && r.bottom > 0;
  });

  // Miller: how many items any one group asks you to hold at once.
  const groups = [...document.querySelectorAll('nav ul, .grid-products, .grid-collections, .detail-list, .accordion, .hero-meta, footer ul')]
    .filter(vis)
    .map((g) => ({
      sel: g.className || g.tagName.toLowerCase(),
      n: [...g.children].filter(vis).length,
    }))
    .filter((g) => g.n > 0);

  // Proximity: the gap INSIDE a card versus the gap BETWEEN cards. Related
  // things should sit closer together than unrelated ones.
  let proximity = null;
  const cards = [...document.querySelectorAll('.grid-products > *')].filter(vis);
  if (cards.length >= 2) {
    const a = cards[0].getBoundingClientRect();
    const b = cards[1].getBoundingClientRect();
    const between = b.top > a.bottom ? b.top - a.bottom : Math.abs(b.left - a.right);
    const inner = getComputedStyle(cards[0]).gap || getComputedStyle(cards[0]).rowGap || '';
    proximity = { between: Math.round(between), inner };
  }

  return JSON.stringify({
    interactive: interactive.length,
    inView: inView.length,
    small,
    emphasised: emphasised.length,
    emphasisedInView: emphasisedInView.length,
    emphasisedLabels: emphasised.slice(0, 4).map(label),
    groups,
    proximity,
    docHeight: Math.round(document.body.scrollHeight),
  });
})()`;

/* Doherty: click something and time the first paint change after it. */
const DOHERTY = (selector) => `(async () => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return JSON.stringify({ skipped: true });
  const before = document.body.innerHTML.length;
  const t0 = performance.now();
  el.click();
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => requestAnimationFrame(r));
    if (document.body.innerHTML.length !== before) break;
  }
  return JSON.stringify({ ms: Math.round(performance.now() - t0) });
})()`;

console.log(`\n${C.dim}── Tour Archive · UX laws probe · ${WIDTH}x${HEIGHT} · ${ORIGIN_ARG || 'dist/'} ──${C.off}`);

const findings = [];
const note = (law, level, msg) => findings.push({ law, level, msg });

for (const route of ROUTES) {
  await go(route);
  const raw = await evaluate(MEASURE);
  let m;
  try { m = JSON.parse(raw); } catch { console.log(`${C.red}   ${route}: measurement failed${C.off}`); continue; }

  console.log(`\n${C.bold}${route}${C.off} ${C.dim}— ${m.interactive} interactive, ${m.inView} in first view, page ${m.docHeight}px${C.off}`);

  // Fitts
  if (m.small.length) {
    const worst = m.small.slice(0, 6).map((s) => `${s.label} (${s.w}x${s.h})`).join(', ');
    note("Fitts's law", 'warn', `${route}: ${m.small.length} target(s) under ${TAP_MIN}px — ${worst}`);
    console.log(`${C.yellow}   ⚠ Fitts${C.off} ${C.dim}${m.small.length} target(s) under ${TAP_MIN}px${C.off}`);
    for (const s of m.small.slice(0, 8)) console.log(`${C.dim}       ${s.w}x${s.h}  ${s.label}${C.off}`);
  } else {
    console.log(`${C.green}   ✔ Fitts${C.off} ${C.dim}every target at least ${TAP_MIN}px${C.off}`);
  }

  // Hick
  const hickLevel = m.inView > 12 ? 'warn' : 'ok';
  if (hickLevel === 'warn') note("Hick's law", 'warn', `${route}: ${m.inView} choices visible without scrolling`);
  console.log(`${hickLevel === 'ok' ? C.green + '   ✔ Hick' : C.yellow + '   ⚠ Hick'}${C.off} ${C.dim}${m.inView} choices in the first view${C.off}`);

  // Von Restorff
  if (m.emphasisedInView === 0 && m.inView > 0) {
    note('Von Restorff', 'warn', `${route}: nothing is emphasised in the first view — no obvious primary action`);
    console.log(`${C.yellow}   ⚠ Von Restorff${C.off} ${C.dim}no emphasised action in view${C.off}`);
  } else if (m.emphasisedInView > 2) {
    note('Von Restorff', 'warn', `${route}: ${m.emphasisedInView} emphasised actions compete in the first view (${m.emphasisedLabels.join(', ')})`);
    console.log(`${C.yellow}   ⚠ Von Restorff${C.off} ${C.dim}${m.emphasisedInView} emphasised actions compete${C.off}`);
  } else {
    console.log(`${C.green}   ✔ Von Restorff${C.off} ${C.dim}${m.emphasisedInView} emphasised action in view${C.off}`);
  }

  // Miller
  const big = m.groups.filter((g) => g.n > MILLER_MAX);
  if (big.length) {
    for (const g of big) note("Miller's law", 'note', `${route}: "${g.sel}" holds ${g.n} items`);
    console.log(`${C.dim}   · Miller  ${big.map((g) => `${g.sel}=${g.n}`).join(', ')}${C.off}`);
  } else {
    console.log(`${C.green}   ✔ Miller${C.off} ${C.dim}no group over ${MILLER_MAX}${C.off}`);
  }

  // Proximity
  if (m.proximity) {
    console.log(`${C.dim}   · Proximity  ${m.proximity.between}px between cards, ${m.proximity.inner || 'n/a'} inside${C.off}`);
  }
}

/* Doherty — measured on the archive, where the filters live. */
await go('/archive');
for (const sel of ['[data-filter]', '.filter-chip', 'nav a[href="/collections"]']) {
  const r = JSON.parse((await evaluate(DOHERTY(sel))) || '{}');
  if (r.skipped) continue;
  const level = r.ms <= DOHERTY_MS ? 'ok' : 'warn';
  if (level === 'warn') note('Doherty threshold', 'warn', `/archive: "${sel}" took ${r.ms}ms to show a change`);
  console.log(`${level === 'ok' ? C.green + '   ✔ Doherty' : C.yellow + '   ⚠ Doherty'}${C.off} ${C.dim}${sel} → ${r.ms}ms${C.off}`);
  break;
}

/* ---------------- summary ---------------- */

console.log(`\n${C.dim}── findings ──${C.off}`);
if (!findings.length) {
  console.log(`${C.green}✔ nothing measurable to flag${C.off}\n`);
} else {
  for (const f of findings) {
    const c = f.level === 'warn' ? C.yellow : C.dim;
    console.log(`${c}   ${f.law}: ${f.msg}${C.off}`);
  }
  console.log(`\n${C.dim}${findings.length} finding(s) — see docs/UX-LAWS.md for the judgement half${C.off}\n`);
}

cleanup(0);
