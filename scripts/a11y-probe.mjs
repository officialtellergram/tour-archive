/**
 * Accessibility probe — axe-core, run inside the real page.
 *
 * The UX probe measures the laws a browser can put a number on. This one
 * asks the other question: can someone who is not a sighted mouse user get
 * through the shop at all? axe-core (Deque's WCAG engine) is injected into
 * the built site and run against the routes a customer actually visits —
 * home, the archive, a live piece, collections, terms, privacy, sell.
 *
 *   node scripts/a11y-probe.mjs                  # against dist/ (build first)
 *   node scripts/a11y-probe.mjs https://tourarchive.us
 *   node scripts/a11y-probe.mjs --width 390      # phone width (default 1280)
 *
 * Rules: WCAG 2.0 A + AA and WCAG 2.1 AA (the tags 'wcag2a', 'wcag2aa',
 * 'wcag21aa'). Violations are printed grouped by impact with the failing
 * selector and Deque's help URL, so a fix is one click away.
 *
 * Exit code 1 on any 'serious' or 'critical' violation; 'moderate' and
 * 'minor' warn. Needs a browser, so it lives next to `npm run ux` rather
 * than inside `npm run check`.
 *
 * Browser lifecycle is the same as scripts/ux-probe.mjs: headless Edge over
 * CDP, one WebSocket, Runtime.evaluate. Windows kill discipline is lifted
 * from live-probe.mjs (child.kill only hits the launcher).
 */

import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const AXE = join(ROOT, 'node_modules', 'axe-core', 'axe.min.js');
const PORT = 9771; // distinct from ux-probe (9761) and live-probe (9741)
const C = { red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', dim: '\x1b[2m', bold: '\x1b[1m', off: '\x1b[0m' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const args = process.argv.slice(2);
const ORIGIN_ARG = args.find((a) => /^https?:\/\//.test(a));
const WIDTH = Number((args.find((a) => a.startsWith('--width')) || '').split('=')[1] || args[args.indexOf('--width') + 1] || 1280);
const HEIGHT = WIDTH >= 1000 ? 900 : 844;

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa'];
const FAIL_ON = new Set(['serious', 'critical']);
const ORDER = ['critical', 'serious', 'moderate', 'minor'];

if (!existsSync(AXE)) {
  console.log(`${C.red}✖ axe-core missing — run npm install${C.off}`);
  process.exitCode = 1;
} else {
  await main();
}

async function main() {
  /* ---------------- routes ---------------- */

  // The product route needs a real id. The snapshot the site itself reads is
  // the source of truth: first piece that is neither sold nor upcoming.
  let itemRoute = null;
  try {
    const inv = JSON.parse(readFileSync(join(DIST, 'api', 'inventory.json'), 'utf8'));
    const live = (inv.items || []).find((i) => !i.sold && !i.upcoming) || inv.items?.[0];
    if (live) itemRoute = `/item/${live.id}`;
  } catch { /* no snapshot — the route is simply skipped, and said so below */ }
  if (!itemRoute && ORIGIN_ARG) {
    try {
      const inv = await (await fetch(`${ORIGIN_ARG.replace(/\/+$/, '')}/api/inventory.json`)).json();
      const live = (inv.items || []).find((i) => !i.sold && !i.upcoming) || inv.items?.[0];
      if (live) itemRoute = `/item/${live.id}`;
    } catch { /* same */ }
  }

  const ROUTES = ['/', '/archive', itemRoute, '/collections', '/terms', '/privacy', '/sell'].filter(Boolean);
  if (!itemRoute) console.log(`${C.yellow}⚠ no inventory snapshot found — product page skipped${C.off}`);

  /* ---------------- serve dist/ when no origin is given ---------------- */

  let BASE = ORIGIN_ARG?.replace(/\/+$/, '');
  let server = null;
  if (!BASE) {
    if (!existsSync(DIST)) {
      console.log(`${C.red}✖ dist/ missing — run npm run build:pages, or pass an origin${C.off}`);
      process.exitCode = 1;
      return;
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
    server?.close();
    process.exitCode = 1;
    return;
  }

  const child = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', '--disable-dev-shm-usage',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${join(process.env.TEMP || '/tmp', `a11y-probe-${process.pid}`)}`,
    `--window-size=${WIDTH},${HEIGHT}`, 'about:blank',
  ], { stdio: 'ignore' });

  let sock = null;
  const cleanup = (code) => {
    try { sock?.close(); } catch { /* closing */ }
    try {
      if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      else child.kill('SIGKILL');
    } catch { /* gone */ }
    try { server?.close(); } catch { /* closing */ }
    process.exitCode = code;
  };

  let ws = null;
  for (let i = 0; i < 120 && !ws; i++) {
    try {
      const t = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      ws = t.find((x) => x.type === 'page')?.webSocketDebuggerUrl;
    } catch { /* booting */ }
    if (!ws) await sleep(250);
  }
  if (!ws) { console.log(`${C.red}✖ browser yielded no tab${C.off}`); cleanup(1); return; }

  sock = new WebSocket(ws);
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
    await evaluate(`location.href = ${JSON.stringify(`${BASE}${route}?a11y=${Date.now()}`)}`);
    for (let i = 0; i < 80; i++) {
      if (Number(await evaluate(`document.querySelectorAll('[data-outlet] *').length`)) > 0) break;
      await sleep(250);
    }
    await sleep(1800); // let stock land and reveals settle
  }

  /* ---------------- axe ---------------- */

  // Navigation reloads the document, so axe is re-injected per route. The
  // source is ~half a megabyte; Runtime.evaluate takes it without complaint.
  const axeSource = readFileSync(AXE, 'utf8');
  const RUN = `(async () => {
    try {
      const r = await axe.run(document, { runOnly: { type: 'tag', values: ${JSON.stringify(TAGS)} } });
      return JSON.stringify({
        violations: r.violations.map((v) => ({
          id: v.id, impact: v.impact, help: v.help, helpUrl: v.helpUrl,
          nodes: v.nodes.map((n) => ({
            target: n.target.join(' '),
            summary: n.failureSummary,
            // color-contrast carries its measurements here: fg/bg, the ratio
            // it found and the ratio it wanted. Printed so a design decision
            // can be made on numbers rather than on a rule id.
            data: (n.any.find((c) => c.data && c.data.contrastRatio != null) || {}).data || null,
          })),
        })),
        passes: r.passes.length,
        incomplete: r.incomplete.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length })),
      });
    } catch (e) { return JSON.stringify({ error: String(e && e.message || e) }); }
  })()`;

  console.log(`\n${C.dim}── Tour Archive · accessibility probe · axe-core ${TAGS.join(' ')} · ${WIDTH}x${HEIGHT} · ${ORIGIN_ARG || 'dist/'} ──${C.off}`);

  const totals = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  let broken = 0;

  for (const route of ROUTES) {
    await go(route);
    await evaluate(axeSource);
    const raw = await evaluate(RUN);
    let r;
    try { r = JSON.parse(raw); } catch { r = null; }
    if (!r || r.error) {
      broken += 1;
      console.log(`\n${C.bold}${route}${C.off}\n${C.red}   ✖ axe did not run: ${r?.error || 'no result'}${C.off}`);
      continue;
    }

    const byImpact = ORDER.map((k) => [k, r.violations.filter((v) => v.impact === k)]).filter(([, vs]) => vs.length);
    const n = r.violations.length;
    const nodes = r.violations.reduce((a, v) => a + v.nodes.length, 0);
    console.log(`\n${C.bold}${route}${C.off} ${C.dim}— ${r.passes} rules passed, ${n} violated (${nodes} node${nodes === 1 ? '' : 's'}), ${r.incomplete.length} needing a human${C.off}`);

    if (!n) console.log(`${C.green}   ✔ no violations${C.off}`);
    for (const [impact, vs] of byImpact) {
      totals[impact] += vs.length;
      const c = FAIL_ON.has(impact) ? C.red : C.yellow;
      const mark = FAIL_ON.has(impact) ? '✖' : '⚠';
      for (const v of vs) {
        console.log(`${c}   ${mark} ${impact}${C.off}  ${v.help} ${C.dim}(${v.id})${C.off}`);
        console.log(`${C.dim}       ${v.helpUrl}${C.off}`);
        for (const node of v.nodes.slice(0, 6)) {
          const d = node.data;
          const measured = d && d.contrastRatio != null
            ? `  ${d.fgColor} on ${d.bgColor} = ${Number(d.contrastRatio).toFixed(2)}:1, wants ${d.expectedContrastRatio}${d.fontSize ? `, ${d.fontSize}` : ''}`
            : '';
          console.log(`${C.dim}       → ${node.target}${measured}${C.off}`);
        }
        if (v.nodes.length > 6) console.log(`${C.dim}       … and ${v.nodes.length - 6} more${C.off}`);
      }
    }
    if (r.incomplete.length) {
      console.log(`${C.dim}   · needs review: ${r.incomplete.map((i) => `${i.id}×${i.n}`).join(', ')}${C.off}`);
    }
  }

  /* ---------------- summary ---------------- */

  const blocking = totals.critical + totals.serious;
  const soft = totals.moderate + totals.minor;
  console.log(`\n${C.dim}── summary ──${C.off}`);
  console.log(`${C.dim}   ${ROUTES.length} route(s) · critical ${totals.critical} · serious ${totals.serious} · moderate ${totals.moderate} · minor ${totals.minor}${C.off}`);
  if (broken) console.log(`${C.red}✖ axe failed to run on ${broken} route(s)${C.off}`);
  if (blocking) console.log(`${C.red}✖ ${blocking} serious/critical violation(s) — fix before shipping${C.off}\n`);
  else if (soft) console.log(`${C.yellow}⚠ ${soft} moderate/minor violation(s) — worth a look, not a block${C.off}\n`);
  else console.log(`${C.green}✔ clean on every route${C.off}\n`);

  cleanup(blocking || broken ? 1 : 0);
}
