/**
 * One-off manual reader for OUR OWN eBay listings — the human-with-a-browser
 * equivalent, driven over CDP so the data can be transcribed accurately into
 * the stock manifest. Deliberately not a pipeline: the recurring sync stays
 * with the official API once credentials land.
 *
 * Usage: node scripts/ebay-peek.mjs <url> [item|seller|images|desc|diag]
 */
import { spawn, spawnSync } from 'node:child_process';
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

// Piped stdout is ASYNC on Windows, and process.exit races the flush — an
// entire listing's JSON silently vanished from a sweep this way. Blocking
// writes make console.log synchronous; the caller always gets the payload.
try { process.stdout._handle?.setBlocking?.(true); } catch { /* best effort */ }

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
  // unique per run: a shared profile lets a second spawn HAND OFF to a live
  // instance (the launcher exits, our pid is nobody, the tree-kill hits air)
  `--user-data-dir=${process.env.TEMP}\\ebay-peek\\${process.pid}-${Date.now()}`,
  '--window-size=1400,1000',
  URL_,
], { stdio: 'ignore' });

/* child.kill() on Windows terminates the LAUNCHER, not the browser tree —
   a zombie Edge then squats port 9720 and every later spawn joins it as a
   tab, poisoning multi-target reads (the desc OOPIF hunt especially). Kill
   the whole tree — and because Edge can re-exec PAST the launcher, sweep
   whatever is still LISTENING on the port, twice (observed live: a re-exec'd
   pid survived the first sweep). The port is the identity that cannot lie. */
function sweepPort() {
  try {
    const net = spawnSync('netstat', ['-ano'], { encoding: 'utf8' });
    const line = (net.stdout || '').split('\n').find((l) => l.includes(`:${PORT}`) && /LISTENING/i.test(l));
    const pid = line?.trim().split(/\s+/).pop();
    if (pid && Number(pid) > 4) spawnSync('taskkill', ['/PID', pid, '/T', '/F'], { stdio: 'ignore' });
  } catch { /* best effort */ }
}
const sleepSync = (ms) => {
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { /* noop */ }
};
function die(code) {
  try {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } catch { /* already gone */ }
  sweepPort();
  sleepSync(800);
  sweepPort();
  process.exit(code);
}

try {
  // A dead CDP socket would otherwise hang this probe forever, and a caller's
  // spawnSync timeout kills the probe but NOT its Edge grandchild — which then
  // squats port 9720 with the listing still open and poisons the next spawn.
  // Bound our own life; kill our own browser.
  const watchdog = setTimeout(() => {
    console.log('{"error": "probe watchdog fired — page never settled"}');
    die(1);
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

  if (MODE === 'desc') {
    /*
     * The description lives in an out-of-process iframe (host itm.ebaydesc.com)
     * — the top document cannot read it, this machine's family filter blocks
     * top-level navigation to the host (subframes are exempt), and the OOPIF
     * appears on /json/list as its OWN target. So: settle the listing page,
     * scroll the lazy iframe into existence, then attach to the frame's own
     * debugger socket and read the rendered text from inside.
     */
    const itemId = (URL_.match(/\/itm\/(\d+)/) || [])[1] || '';

    // Serialized real function — the About-this-item module renders in the TOP
    // document, not the ebaydesc OOPIF, so Phase 1 harvests it in the same
    // visit. Current layout: the .ux-labels-values classes sit on the dt/dd
    // elements inside the container's dls — the old row-wrapper selector (see
    // ITEM_PROBE) now matches only the buybox, which must stay excluded.
    function listingProbeFn() {
      const ifr = document.querySelector('#desc_ifr');
      if (ifr) ifr.scrollIntoView({ block: 'center' }); // loading="lazy" — force the OOPIF to exist
      const t = (sel) => document.querySelector(sel)?.textContent?.trim() || '';
      const clean = (s) =>
        String(s == null ? '' : s).replace(/[​-‍⁠﻿￼]/g, ' ').replace(/\s+/g, ' ').trim();

      const about = document.querySelector('.x-about-this-item, [data-testid="x-about-this-item"]');
      const specifics = {};
      if (about) {
        const conditionLabel = (vEl) => {
          // dd anatomy (12/12 identical): visible truncated span + 'Read more'
          // button + HIDDEN full-text duplicate (.hide) + 'See all condition
          // definitions' link. Prefer the hidden FULL copy; strip chrome by
          // phrase; keep the pre-colon label only.
          const full = vEl.querySelector('.ux-expandable-textual-display-block-inline.hide');
          const trunc = vEl.querySelector('[data-testid="text"]');
          let raw = clean((full || trunc || vEl).textContent)
            .replace(/read more\s*about the condition.*$/i, '')
            .replace(/see all condition definitions.*$/i, '');
          const colon = raw.indexOf(':');
          if (colon > 0) raw = raw.slice(0, colon);
          return raw.replace(/[\s.…]+$/, '').trim();
        };
        const seen = new Set();
        const take = (kEl, vEl) => {
          const key = clean(kEl.textContent).replace(/:\s*$/, '');
          if (!key || seen.has(key.toLowerCase())) return;
          const val = /^condition$/i.test(key)
            ? conditionLabel(vEl)
            : clean(vEl.textContent)
                .replace(/see all condition definitions.*$/i, '')
                .replace(/read more(?: about the condition)?.*$/i, '')
                .trim();
          if (!val) return;
          seen.add(key.toLowerCase());
          specifics[key] = val; // eBay DOM order preserved
        };
        // Shape A (all 12 today): classes on dt/dd — walk every dl, dt → next DD sibling
        about.querySelectorAll('dl dt.ux-labels-values__labels').forEach((dt) => {
          let dd = dt.nextElementSibling;
          while (dd && dd.tagName !== 'DD') dd = dd.nextElementSibling;
          if (dd) take(dt, dd);
        });
        // Shape B (legacy backstop, container-scoped ONLY — at document level
        // this selector is the buybox, the old ITEM_PROBE bug)
        about.querySelectorAll('.ux-labels-values').forEach((row) => {
          const k = row.querySelector('.ux-labels-values__labels');
          const v = row.querySelector('.ux-labels-values__values');
          if (k && v) take(k, v);
        });
      }

      return JSON.stringify({
        ok: !!ifr,
        // page identity from location.href — the only echo a poisoned 9720
        // read cannot fake; the caller compares it against the URL it asked for
        pageItemId: (location.href.match(/\/itm\/(\d+)/) || [])[1] || '',
        title: t('h1.x-item-title__mainTitle') || t('h1'),
        price: t('.x-price-primary'),
        ended: /ended|sold|no longer available/i.test(document.body.textContent.slice(0, 3000)),
        specifics,
      });
    }
    const LISTING_DESC_PROBE = `(${listingProbeFn})()`;
    const SUMMON = `document.querySelector('#desc_ifr')?.scrollIntoView({block:'center'}); scrollBy(0,-600);`;

    let listing = null;
    for (let i = 0; i < 20; i++) {
      await sleep(1000);
      const raw = await evaluate(LISTING_DESC_PROBE);
      const data = raw ? JSON.parse(raw) : null;
      // fast-accept only when the specifics harvest looks real; past 12s take
      // what the page gives (thin-specifics listings must still resolve)
      if (data?.ok && (Object.keys(data.specifics || {}).length >= 3 || i >= 12)) { listing = data; break; }
      // a settled page with no iframe is an answer ("no description"), not a retry
      if (i >= 12 && data?.title) { listing = data; break; }
      // scroll-summon fallback: proven recipe for the rare no-render flake
      if ((i === 6 || i === 12) && data?.title && !Object.keys(data.specifics || {}).length) {
        await evaluate(SUMMON);
      }
    }
    if (!listing) {
      console.log('{"error": "listing page never settled — bot wall or layout change"}');
      die(1);
    }
    // Identity: the page must be the listing we asked for. A stale browser
    // once served a DIFFERENT listing's data with zero error signal.
    if (itemId && listing.pageItemId && listing.pageItemId !== itemId) {
      console.log(JSON.stringify({ error: `page identity mismatch — wanted ${itemId}, got ${listing.pageItemId}` }));
      die(1);
    }
    if (!listing.ok) {
      // load-bearing for per-field cowardice: a listing with no description
      // module can still yield good specifics
      console.log(JSON.stringify(
        { itemId, pageItemId: listing.pageItemId,
          listing: { title: listing.title, price: listing.price, ended: listing.ended },
          specifics: listing.specifics || {},
          desc: { hostOk: false, blocked: false, textLength: 0, paras: [] } },
        null, 2
      ));
      die(0);
    }

    let descWs = null;
    for (let i = 0; i < 40 && !descWs; i++) {
      try {
        const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
        const fr = targets.find(
          (t) => t.type === 'iframe' && t.url.includes('ebaydesc') && (!itemId || t.url.includes(itemId))
        );
        if (fr) descWs = fr.webSocketDebuggerUrl;
      } catch { /* frame still forming */ }
      await sleep(300);
    }
    if (!descWs) {
      console.log('{"error": "description frame target never appeared"}');
      die(1);
    }

    const dsock = new WebSocket(descWs);
    await new Promise((res, rej) => { dsock.onopen = res; dsock.onerror = rej; });
    let did = 0;
    const dpending = new Map();
    dsock.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && dpending.has(m.id)) { dpending.get(m.id)(m); dpending.delete(m.id); }
    };
    const devaluate = (expression) =>
      new Promise((res) => {
        const i = ++did;
        dpending.set(i, (m) => res(m?.result?.result?.value));
        dsock.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
      });

    // Serialized real function — no template-escaping bugs. hostname, NOT href:
    // a family-filter redirect carries the ebaydesc URL encoded in its own href.
    function descProbeFn() {
      const hostOk = /(^|\.)ebaydesc\.com$/i.test(location.hostname);
      const blocked =
        /sdx\.microsoft\.com$/i.test(location.hostname) || /family safety/i.test(document.title || '');
      const body = document.body;
      const text = body ? (body.innerText !== undefined ? body.innerText : body.textContent) : '';
      const paras = String(text)
        .split(/\n\s*\n+/)
        .map((p) => p.replace(/[​-‍﻿￼]/g, '').replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      return JSON.stringify({
        ok: true,
        hostOk,
        blocked,
        url: location.href.slice(0, 300),
        readyState: document.readyState,
        textLength: String(text).length,
        paraCount: paras.length,
        paras,
      });
    }
    const DESC_PROBE = `(${descProbeFn})()`;

    for (let i = 0; i < 15; i++) {
      await sleep(800);
      const raw = await devaluate(DESC_PROBE);
      const d = raw ? JSON.parse(raw) : null;
      // explicit acceptance: textLength 0 on a complete document is an ANSWER
      if (d && d.ok && d.readyState === 'complete') {
        console.log(JSON.stringify(
          { itemId, pageItemId: listing.pageItemId,
            listing: { title: listing.title, price: listing.price, ended: listing.ended },
            specifics: listing.specifics || {},
            desc: d },
          null, 2
        ));
        die(0);
      }
    }
    console.log('{"error": "description frame never completed"}');
    die(1);
  }

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
      die(0);
    }
  }
  console.log('{"error": "page never yielded listing data — bot wall or layout change"}');
  die(1);
} finally {
  // backstop for the thrown-error paths (no page target, socket error)
  try { spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {}
}
