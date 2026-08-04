/**
 * Click-navigation probe — the test the 404 bug proved we were missing.
 *
 * Every earlier check loaded URLs directly; none ever CLICKED a link, so a
 * click handler that double-prefixed the deploy base passed the whole suite
 * and broke in production. This drives a real browser over CDP, clicks the
 * header wordmark and nav links, and asserts both the resulting URL and that
 * the outlet actually rendered content (not the 404 view).
 *
 * Usage: node scripts/click-probe.mjs <baseUrl>
 *   e.g. node scripts/click-probe.mjs http://localhost:4180/tour-archive/
 *        node scripts/click-probe.mjs https://tourarchive.us/
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const BROWSER = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p));

const START = process.argv[2] || 'http://localhost:4180/tour-archive/';
const PORT = 9640;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const C = { red: '\x1b[31m', green: '\x1b[32m', dim: '\x1b[2m', off: '\x1b[0m' };

/** Click a selector, wait for the SPA to settle, report where we ended up. */
const clickAndReport = (selector) => `(async () => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return JSON.stringify({ error: 'selector not found: ' + ${JSON.stringify(selector)} });
  el.click();
  await new Promise((r) => setTimeout(r, 900));
  const outlet = document.querySelector('[data-outlet]');
  return JSON.stringify({
    path: location.pathname,
    title: document.title,
    is404: /Out of bounds/.test(outlet?.textContent || ''),
    hasContent: (outlet?.textContent || '').trim().length > 200,
  });
})()`;

const child = spawn(BROWSER, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${process.env.TEMP}\\click-probe`,
  '--window-size=1500,1000',
  START,
], { stdio: 'ignore' });

let failures = 0;

try {
  let ws;
  for (let i = 0; i < 80 && !ws; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = targets.find((t) => t.type === 'page' && t.url.startsWith(START.split('/').slice(0, 3).join('/')));
      if (page) ws = page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(200);
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
  const evaluate = (expression) =>
    new Promise((res) => {
      const i = ++id;
      pending.set(i, (m) => res(JSON.parse(m?.result?.result?.value || '{}')));
      sock.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }));
    });

  // wait for boot
  for (let i = 0; i < 30; i++) {
    const r = await evaluate(`JSON.stringify({ ok: !!document.querySelector('[data-outlet] *') })`);
    if (r.ok) break;
    await sleep(500);
  }

  console.log(`${C.dim}── click-nav probe · ${START}${C.off}`);

  // The journey a real visitor takes: nav links out, wordmark home.
  const journey = [
    ['a[href$="/archive"]', '/archive', 'The Archive'],
    ['.wordmark', '/', 'landing'],
    ['a[href$="/collections"]', '/collections', 'Collections'],
    ['a[href$="/journal"]', '/journal', 'Journal'],
    ['.wordmark', '/', 'landing again'],
    ['a[href$="/method"]', '/method', 'Our Method'],
    ['a[href$="/curate"]', '/curate', 'Procurement Desk'],
  ];

  for (const [selector, expectedAppPath, label] of journey) {
    const r = await evaluate(clickAndReport(selector));
    const pathOk =
      r.path &&
      (r.path.endsWith(expectedAppPath) || (expectedAppPath === '/' && /\/(tour-archive\/?)?$/.test(r.path)));
    const doubled = /tour-archive\/tour-archive/.test(r.path || '');
    const ok = !r.error && pathOk && !doubled && !r.is404 && r.hasContent;
    if (!ok) failures += 1;
    console.log(
      `${ok ? C.green + '   ✔' : C.red + '   ✖'} ${label.padEnd(16)} → ${r.path || r.error}` +
        `${r.is404 ? ' [404 VIEW]' : ''}${doubled ? ' [DOUBLED BASE]' : ''}${C.off}`
    );
  }
} catch (err) {
  console.log(`${C.red}✖ probe failed: ${err.message}${C.off}`);
  failures += 1;
} finally {
  child.kill();
}

if (failures) {
  console.log(`\n${C.red}✖ ${failures} click-navigation failure(s)${C.off}\n`);
  process.exit(1);
}
console.log(`\n${C.green}✔ click navigation clean — no doubled base, no 404s${C.off}\n`);
