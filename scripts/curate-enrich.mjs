/**
 * Procurement Desk photo backfill — the ebay-peek logic, wired to the pile.
 *
 * Cofounders paste bare listing links; this script gives those finds their
 * pictures. It drives a REAL browser (same reason ebay-peek does: eBay walls
 * off plain fetches, so the only honest reader is the thing a human uses),
 * visits each listing once, reads its og:image (and title/price when the
 * find lacks them), and writes the result back to the shared pile.
 *
 * This is enrichment, not scraping: one page per find, sequentially, with a
 * breather between — the robot equivalent of a teammate opening each link.
 *
 * Needs live mode: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env (the
 * service key stays local — it is never committed and never shipped).
 * Practice-mode piles live in each device's localStorage, which nothing on
 * this machine can reach — that is why the desk keeps its paste-a-photo field.
 *
 * Usage:
 *   node scripts/curate-enrich.mjs --url <listingUrl>   peek one listing, print
 *   node scripts/curate-enrich.mjs --dry                sweep the pile, print plan
 *   node scripts/curate-enrich.mjs [--max N]            sweep + write back (default 15)
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import '../server/config.mjs'; // side effect: loads .env into process.env

const BROWSER = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p));

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name, fallback) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const SINGLE_URL = value('--url', null);
const DRY = flag('--dry');
const MAX = Number(value('--max', 15));
const PORT = 9725;
const PAUSE_MS = 4000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const C = { red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', dim: '\x1b[2m', off: '\x1b[0m' };

/* ------------------------------------------------------------------ */
/* Listing probe — og:image first (works on eBay, Depop, Etsy, most    */
/* of the web); eBay-specific fallbacks for carousel + price.          */
/* ------------------------------------------------------------------ */

const LISTING_PROBE = `(() => {
  const meta = (sel) => document.querySelector(sel)?.content?.trim() || '';
  const text = (sel) => document.querySelector(sel)?.textContent?.trim() || '';
  let image = meta('meta[property="og:image"]');
  if (!/^https?:/.test(image)) {
    for (const img of document.querySelectorAll('.ux-image-carousel img, .ux-image-carousel-item img')) {
      const src = img.src || img.dataset?.src || '';
      if (/ebayimg\\.com/.test(src)) { image = src; break; }
    }
  }
  if (/ebayimg\\.com/.test(image)) image = image.replace(/s-l\\d+/, 's-l1600');
  const title = meta('meta[property="og:title"]') || text('h1.x-item-title__mainTitle') || text('h1');
  const price =
    meta('meta[property="product:price:amount"]') ||
    meta('meta[property="og:price:amount"]') ||
    (text('.x-price-primary').match(/[\\d,]+\\.?\\d*/) || [''])[0];
  const walled = /Pardon Our Interruption|Error Page|Access Denied|verify you are a human/i
    .test((document.title || '') + ' ' + (document.body?.textContent?.slice(0, 400) || ''));
  return JSON.stringify({
    ready: document.readyState === 'complete',
    walled,
    image: /^https?:/.test(image) ? image : '',
    title: title.replace(/\\s*\\|\\s*eBay\\s*$/i, '').slice(0, 140),
    price: price ? Number(String(price).replace(/,/g, '')) : null,
  });
})()`;

/* ------------------------------------------------------------------ */
/* One browser session, navigated listing to listing                   */
/* ------------------------------------------------------------------ */

async function withBrowser(fn) {
  if (!BROWSER) throw new Error('no Edge found');
  const child = spawn(
    BROWSER,
    [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
      // headless advertises itself in the UA and eBay error-pages it
      '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${process.env.TEMP}\\curate-enrich`,
      '--window-size=1400,1000',
      'about:blank',
    ],
    { stdio: 'ignore' }
  );
  try {
    let ws;
    for (let i = 0; i < 80 && !ws; i++) {
      try {
        const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
        const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
        if (page) ws = page.webSocketDebuggerUrl;
      } catch {
        /* booting */
      }
      await sleep(250);
    }
    if (!ws) throw new Error('devtools never came up');

    const sock = new WebSocket(ws);
    await new Promise((res, rej) => {
      sock.onopen = res;
      sock.onerror = rej;
    });
    let id = 0;
    const pending = new Map();
    sock.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) {
        pending.get(m.id)(m);
        pending.delete(m.id);
      }
    };
    const evaluate = (expression) =>
      new Promise((res) => {
        const i = ++id;
        pending.set(i, (m) => res(m?.result?.result?.value));
        sock.send(
          JSON.stringify({
            id: i,
            method: 'Runtime.evaluate',
            params: { expression, returnByValue: true },
          })
        );
      });

    const peek = async (url) => {
      await evaluate(`location.href = ${JSON.stringify(url)}`);
      let best = null;
      for (let i = 0; i < 20; i++) {
        await sleep(1000);
        let data = null;
        try {
          data = JSON.parse((await evaluate(LISTING_PROBE)) || 'null');
        } catch {
          /* navigation mid-flight */
        }
        if (data?.walled) return { error: 'bot wall' };
        if (data?.image) {
          best = data;
          // the image arrives before the price node renders — linger briefly
          // for the fuller read, but never lose the picture we already have
          if (data.price || i >= 4) return best;
        }
        if (!best && data?.ready && i > 6) break; // settled without an og:image
      }
      return best || { error: 'no image found on the page' };
    };

    return await fn(peek);
  } finally {
    child.kill();
  }
}

/* ------------------------------------------------------------------ */
/* Modes                                                               */
/* ------------------------------------------------------------------ */

if (SINGLE_URL) {
  const result = await withBrowser((peek) => peek(SINGLE_URL));
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.error ? 1 : 0);
}

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.log(`${C.yellow}⚠ live mode is not configured — nothing to sweep.${C.off}

The pile only becomes reachable when the shared database exists (practice-mode
piles live in each cofounder's device). Set SUPABASE_URL and
SUPABASE_SERVICE_ROLE_KEY in .env once the Supabase project is created
(ACTIONS.md § 0), then re-run. To test the peek itself right now:

  node scripts/curate-enrich.mjs --url https://www.ebay.com/itm/407115514561
`);
  process.exit(0);
}

const { createClient } = await import('@supabase/supabase-js');
const supa = createClient(SUPABASE_URL, SERVICE_KEY);

const { data: finds, error } = await supa
  .from('curation_finds')
  .select('*')
  .is('photo_url', null)
  .neq('status', 'pass')
  .order('created_at', { ascending: false })
  .limit(MAX);
if (error) {
  console.error(`${C.red}✖ could not read the pile — ${error.message}${C.off}`);
  process.exit(1);
}

const candidates = (finds || []).filter((f) => /^https?:\/\//i.test(f.url));
console.log(`${C.dim}── Procurement Desk · photo backfill ──${C.off}`);
console.log(`${C.dim}   ${candidates.length} find(s) missing a photo (max ${MAX})${C.off}\n`);
if (!candidates.length) process.exit(0);

if (DRY) {
  candidates.forEach((f) =>
    console.log(`   would peek: ${f.title || '(untitled)'} — ${f.url.slice(0, 80)}`)
  );
  process.exit(0);
}

let enriched = 0;
await withBrowser(async (peek) => {
  for (const find of candidates) {
    const label = (find.title || find.url).slice(0, 60);
    const result = await peek(find.url);
    if (result.error) {
      console.log(`${C.yellow}   ⚠ ${label} — ${result.error}${C.off}`);
    } else {
      const patch = { photo_url: result.image };
      if (!find.title && result.title) patch.title = result.title;
      if (find.price_seen == null && result.price) patch.price_seen = result.price;
      const { error: writeErr } = await supa.from('curation_finds').update(patch).eq('id', find.id);
      if (writeErr) console.log(`${C.red}   ✖ ${label} — ${writeErr.message}${C.off}`);
      else {
        enriched += 1;
        console.log(`${C.green}   ✔ ${label}${patch.title ? ' (+title)' : ''}${patch.price_seen ? ' (+price)' : ''}${C.off}`);
      }
    }
    await sleep(PAUSE_MS); // a breather between listings — reader, not crawler
  }
});

console.log(`\n${C.green}✔ ${enriched}/${candidates.length} find(s) got their picture${C.off}\n`);
