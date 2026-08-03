/**
 * One-off manual reader for OUR OWN eBay listings — the human-with-a-browser
 * equivalent, driven over CDP so the data can be transcribed accurately into
 * the stock manifest. Deliberately not a pipeline: the recurring sync stays
 * with the official API once credentials land.
 *
 * Usage: node scripts/ebay-peek.mjs <url> [item|seller]
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const BROWSER = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p));

const URL_ = process.argv[2];
const MODE = process.argv[3] || 'item';
const PORT = 9720;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ITEM_PROBE = `(() => {
  const t = (sel) => document.querySelector(sel)?.textContent?.trim() || '';
  const specifics = {};
  document.querySelectorAll('.ux-labels-values').forEach((row) => {
    const k = row.querySelector('.ux-labels-values__labels')?.textContent?.trim();
    const v = row.querySelector('.ux-labels-values__values')?.textContent?.trim();
    if (k && v) specifics[k.replace(/:$/, '')] = v;
  });
  return JSON.stringify({
    title: t('h1.x-item-title__mainTitle') || t('h1'),
    price: t('.x-price-primary'),
    condition: t('.x-item-condition-text .ux-textspans') || specifics['Condition'] || '',
    ended: /ended|sold|no longer available/i.test(document.body.textContent.slice(0, 3000)),
    specifics,
  });
})()`;

const SELLER_PROBE = `(() => {
  const items = [];
  document.querySelectorAll('li.s-item, li.s-card').forEach((li) => {
    const title = li.querySelector('.s-item__title, .s-card__title')?.textContent?.trim();
    const price = li.querySelector('.s-item__price, .s-card__price')?.textContent?.trim();
    const link = li.querySelector('a[href*="/itm/"]')?.href?.split('?')[0];
    if (title && link && !/Shop on eBay/i.test(title)) items.push({ title, price, link });
  });
  return JSON.stringify({ count: items.length, items: items.slice(0, 20) });
})()`;

const child = spawn(BROWSER, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  // headless mode advertises itself in the UA and eBay error-pages it;
  // present the equivalent headed UA instead
  '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${process.env.TEMP}\\ebay-peek`,
  '--window-size=1400,1000',
  URL_,
], { stdio: 'ignore' });

try {
  let ws;
  for (let i = 0; i < 80 && !ws; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = targets.find((t) => t.type === 'page' && t.url.includes('ebay.com'));
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
  const evaluate = (expression) =>
    new Promise((res) => {
      const i = ++id;
      pending.set(i, (m) => res(m?.result?.result?.value));
      sock.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
    });

  const DIAG_PROBE = `JSON.stringify({ title: document.title,
    url: location.href.slice(0,120),
    h1: document.querySelector('h1')?.textContent?.trim()?.slice(0,140),
    count: 1,
    body: document.body?.textContent?.replace(/\\s+/g,' ').trim().slice(0,260) })`;

  // let the page settle past any bot interstitial
  for (let i = 0; i < 20; i++) {
    await sleep(1000);
    const raw = await evaluate(
      MODE === 'seller' ? SELLER_PROBE : MODE === 'diag' ? DIAG_PROBE : ITEM_PROBE
    );
    const data = raw ? JSON.parse(raw) : null;
    if (data && (data.title || data.count)) {
      console.log(JSON.stringify(data, null, 2));
      process.exit(0);
    }
  }
  console.log('{"error": "page never yielded listing data — bot wall or layout change"}');
  process.exit(1);
} finally {
  child.kill();
}
