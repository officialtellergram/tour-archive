/* Reveal probe — 390x844, animations LIVE. Loads '/', scrolls into the shop
   grid, and reports card opacities: proves whether listings ever reveal. */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const BROWSER = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p));
const PORT = 9741;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const child = spawn(BROWSER, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${process.env.TEMP}/reveal-probe/${process.pid}-${Date.now()}`,
  '--window-size=390,844',
  'http://localhost:4173/',
], { stdio: 'ignore' });

function die(code) {
  try { spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {}
  try {
    const net = spawnSync('netstat', ['-ano'], { encoding: 'utf8' });
    const line = (net.stdout || '').split('\n').find((l) => l.includes(`:${PORT}`) && /LISTENING/i.test(l));
    const pid = line?.trim().split(/\s+/).pop();
    if (pid && Number(pid) > 4) spawnSync('taskkill', ['/PID', pid, '/T', '/F'], { stdio: 'ignore' });
  } catch {}
  process.exit(code);
}

try {
  const watchdog = setTimeout(() => { console.log('{"error":"watchdog"}'); die(1); }, 60_000);
  watchdog.unref?.();

  let ws;
  for (let i = 0; i < 60 && !ws; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = targets.find((t) => t.type === 'page' && t.url.includes('localhost'));
      if (page) ws = page.webSocketDebuggerUrl;
    } catch {}
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

  // Wait for the app to mount and the shop grid to exist.
  for (let i = 0; i < 40; i++) {
    const n = await evaluate(`document.querySelectorAll('.grid-products > *').length`);
    if (Number(n) > 0) break;
    await sleep(500);
  }

  const report = async (label) => {
    const r = await evaluate(`(() => {
      const grid = document.querySelector('.grid-products');
      if (!grid) return JSON.stringify({ error: 'no grid' });
      const kids = [...grid.children];
      const ops = kids.map((k) => Number(getComputedStyle(k).opacity));
      return JSON.stringify({
        cards: kids.length,
        visible: ops.filter((o) => o > 0.9).length,
        first: ops[0], mid: ops[Math.floor(ops.length / 2)], last: ops[ops.length - 1],
        gridTall: Math.round(grid.getBoundingClientRect().height),
      });
    })()`);
    console.log(label + ' ' + r);
  };

  // Scroll to the grid, then deep into it, sampling as a real thumb would.
  await evaluate(`document.querySelector('.grid-products').scrollIntoView({ block: 'start' }); 'ok'`);
  await sleep(2500);
  await report('at-grid-top:');
  await evaluate(`window.scrollBy(0, 4000); 'ok'`);
  await sleep(2000);
  await report('mid-grid:');
  await evaluate(`window.scrollBy(0, 8000); 'ok'`);
  await sleep(2000);
  await report('deep-grid:');
  die(0);
} catch (e) {
  console.log(JSON.stringify({ error: e.message }));
  die(1);
}
