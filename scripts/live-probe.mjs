/**
 * One-off: drive headless Edge over CDP against the LIVE site in real time
 * (no virtual-time budget, which fast-forwards the store's abort timer and
 * fakes a fetch failure), and report which inventory source the page used.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const BROWSER = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p));

const URL_UNDER_TEST = process.argv[2] || 'https://officialtellergram.github.io/tour-archive/item/ds-02';
const PORT = 9532;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PROBE = `(() => {
  const btn = [...document.querySelectorAll('.pdp-actions .btn')].map(b => b.textContent.trim().replace(/\\s+/g,' '));
  const tag = document.querySelector('.plate-tag')?.textContent.trim();
  const mounted = !!document.querySelector('[data-outlet] *');
  return JSON.stringify({ ready: document.readyState, mounted, tag, btn });
})()`;

const child = spawn(BROWSER, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${process.env.TEMP}\\live-cdp`,
  '--window-size=1500,1000',
  URL_UNDER_TEST,
], { stdio: 'ignore' });

try {
  // wait for devtools
  let ws;
  for (let i = 0; i < 80; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = targets.find((t) => t.type === 'page' && t.url.startsWith('https://officialtellergram'));
      if (page) { ws = page.webSocketDebuggerUrl; break; }
    } catch {}
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
  const call = (method, params) => new Promise((res) => {
    const i = ++id; pending.set(i, res);
    sock.send(JSON.stringify({ id: i, method, params }));
  });

  // give the real network up to 15s of REAL time
  for (let i = 0; i < 30; i++) {
    const r = await call('Runtime.evaluate', { expression: PROBE, returnByValue: true });
    const v = JSON.parse(r?.result?.result?.value || '{}');
    if (v.mounted && v.btn?.length) {
      console.log('mounted:', v.mounted, '| tag:', v.tag, '| buttons:', v.btn.join(' / '));
      process.exit(0);
    }
    await sleep(500);
  }
  console.log('page never produced buttons');
  process.exit(1);
} finally {
  child.kill();
}
