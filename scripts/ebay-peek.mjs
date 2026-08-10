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
import { PEEK_UA } from './lib/stock-constants.mjs';

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
  `--user-agent=${PEEK_UA}`,
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${process.env.TEMP}\\ebay-peek`,
  '--window-size=1400,1000',
  URL_,
], { stdio: 'ignore' });

try {
  // A dead CDP socket would otherwise hang this probe forever, and a caller's
  // spawnSync timeout kills the probe but NOT its Edge grandchild — which then
  // squats port 9720 with the listing still open and poisons the next spawn.
  // Bound our own life; kill our own browser.
  const watchdog = setTimeout(() => {
    child.kill();
    console.log('{"error": "probe watchdog fired — page never settled"}');
    process.exit(1);
  }, 60_000);
  watchdog.unref?.();

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

  const IMAGES_PROBE = `(() => {
    // Dedupe by eBay image id, not URL: og:image repeats frame 1 at a different
    // size/extension (s-l400.jpg vs s-l1600.webp), which both wastes a slot and
    // would archive the hero at 400px. Map preserves listing order.
    const byId = new Map();
    const add = (u) => {
      const m = (u || '').match(/ebayimg\\.com\\/images\\/g\\/([^/]+)\\//);
      if (m && !byId.has(m[1])) byId.set(m[1], u.replace(/s-l\\d+/, 's-l1600'));
    };
    // og:image FIRST — it is the listing's chosen primary photo, so it claims
    // frame 01. (add() normalises it up to s-l1600, so the old archive-the-
    // hero-at-400px bug cannot recur; the id-dedupe keeps its carousel copy
    // out.) The DOM carousel's order is NOT reliably the listing's order —
    // trusting it once shipped a wrinkled second angle as a card face.
    add(document.querySelector('meta[property="og:image"]')?.content);
    // carousel frames next; unloaded frames carry data-src
    document.querySelectorAll('.ux-image-carousel img, .ux-image-carousel-item img')
      .forEach((img) => add(img.src || img.dataset?.src || ''));
    // thumbnail-grid backstop: same ids at s-l140/s-l500, normalised up
    document.querySelectorAll('.ux-image-grid img')
      .forEach((img) => add(img.src || img.dataset?.src || ''));
    return JSON.stringify({ count: byId.size, images: [...byId.values()].slice(0, 8) });
  })()`;

  const DIAG_PROBE = `JSON.stringify({ title: document.title,
    url: location.href.slice(0,120),
    h1: document.querySelector('h1')?.textContent?.trim()?.slice(0,140),
    count: 1,
    body: document.body?.textContent?.replace(/\\s+/g,' ').trim().slice(0,260) })`;

  // let the page settle past any bot interstitial
  for (let i = 0; i < 20; i++) {
    await sleep(1000);
    const raw = await evaluate(
      MODE === 'seller' ? SELLER_PROBE
      : MODE === 'diag' ? DIAG_PROBE
      : MODE === 'images' ? IMAGES_PROBE
      : ITEM_PROBE
    );
    const data = raw ? JSON.parse(raw) : null;
    if (data && (data.title || data.count)) {
      console.log(JSON.stringify(data, null, 2));
      child.kill(); // process.exit() skips finally — kill here or the browser
      process.exit(0); // outlives us and poisons the next spawn on port 9720
    }
  }
  console.log('{"error": "page never yielded listing data — bot wall or layout change"}');
  child.kill();
  process.exit(1);
} finally {
  child.kill(); // backstop for the thrown-error paths (no page target, socket error)
}
