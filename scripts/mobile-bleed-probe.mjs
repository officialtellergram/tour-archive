/* Live mobile bleed probe — 390x844, animations RUNNING (the layout gate
   freezes them; this probe exists to see what the gate cannot). For each
   route: can the document pan horizontally, and who protrudes. On '/', also
   opens the drawer and verifies the body lock + containment. */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const BROWSER = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p));
const PORT = 9733;
const BASE = 'http://localhost:4173';
const ROUTES = ['/', '/collections', '/collections/tour-championship-2026', '/collections/basic-stock', '/archive', '/mission', '/sell', '/sizing'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const child = spawn(BROWSER, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${process.env.TEMP}\\bleed-probe`,
  '--window-size=390,844',
  BASE + ROUTES[0],
], { stdio: 'ignore' });

const BLEED = `(() => {
  const de = document.scrollingElement || document.documentElement;
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('svg, .grain')) continue;
    const r = el.getBoundingClientRect();
    if (r.right > innerWidth + 1 || r.left < -1) {
      const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/)[0] : '';
      out.push(el.tagName.toLowerCase() + cls + '[l=' + Math.round(r.left) + ',r=' + Math.round(r.right) + ']');
    }
  }
  return JSON.stringify({
    panX: de.scrollWidth - de.clientWidth,
    htmlOverflowX: getComputedStyle(document.documentElement).overflowX,
    bodyOverflowX: getComputedStyle(document.body).overflowX,
    mounted: !!document.querySelector('[data-outlet] *'),
    poking: out.slice(0, 10),
  });
})()`;

const DRAWER = `(async () => {
  document.querySelector('[data-drawer-open]').click();
  await new Promise((r) => setTimeout(r, 900));
  const body = getComputedStyle(document.body);
  const drawerBody = getComputedStyle(document.querySelector('.drawer-body'));
  window.scrollTo(0, 300);
  await new Promise((r) => setTimeout(r, 150));
  return JSON.stringify({
    lockPosition: body.position,
    scrollWhileLocked: window.scrollY,
    overscroll: drawerBody.overscrollBehaviorY || drawerBody.overscrollBehavior,
    drawerScrollable: document.querySelector('.drawer-body').scrollHeight,
  });
})()`;

try {
  let ws;
  for (let i = 0; i < 60 && !ws; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = targets.find((t) => t.type === 'page' && t.url.startsWith('http'));
      if (page) ws = page.webSocketDebuggerUrl;
    } catch {}
    await sleep(300);
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
  const send = (method, params) => new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    sock.send(JSON.stringify({ id: i, method, params }));
  });
  const evaluate = async (expression) => {
    const m = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    return m?.result?.result?.value;
  };

  for (const route of ROUTES) {
    await send('Page.navigate', { url: BASE + route });
    await sleep(2600); // let boot + drift run live
    const raw = await evaluate(BLEED);
    const d = raw ? JSON.parse(raw) : {};
    console.log(route, '→ panX:', d.panX, 'html/body overflowX:', d.htmlOverflowX + '/' + d.bodyOverflowX,
      d.poking?.length ? '\n   poking: ' + d.poking.join(' ') : '');
    if (route === '/') {
      const dr = await evaluate(DRAWER);
      console.log('   drawer:', dr);
    }
  }
  process.exit(0);
} catch (err) {
  console.error('probe failed:', err.message);
  process.exit(1);
} finally {
  child.kill();
}
