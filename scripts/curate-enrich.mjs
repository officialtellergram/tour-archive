/**
 * The desk's robot — dresses finds so the review deck can deal them.
 *
 * Cofounders paste bare listing links; a card needs a picture and a name
 * before it reaches the deck (THE definition lives in src/curate/data.js and
 * is imported here — there is no second copy). This script visits each
 * undressed find's listing in a REAL browser (eBay walls off anything else),
 * reads og:image / og:title / price, and writes back what the find lacks.
 *
 * It is a reader, not a crawler: one page per find, sequentially, with a
 * breather between, and it stops the whole round after two bot walls in a
 * row — a wall is information about the session, not the listing, so walls
 * never spend one of a find's three tries.
 *
 * It signs in as the ROBOT TEAMMATE ACCOUNT (ROBOT_EMAIL / ROBOT_PASSWORD in
 * .env) — bound by the same row rules as every cofounder, revocable from the
 * dashboard in one click. It never touches `status`, never touches
 * `show_anyway`, never deletes, never runs git.
 *
 * Exit codes (the scheduled task's health signal):
 *   0  swept — including "nothing was due" and a wall-stopped partial round
 *   1  could not sweep at all (not configured, sign-in failed, browser died)
 *   4  another sweep is already running (the wrapper logs it as a skip)
 *
 * Usage:
 *   node scripts/curate-enrich.mjs [--max N] [--dry] [--url <listing>]
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import '../server/config.mjs'; // side effect: loads .env into process.env
import { SUPABASE_URL, SUPABASE_ANON_KEY, FINDS_TABLE } from '../src/curate/config.js';
import {
  isDressed, dueForRobot, dressState, cleanScrapedTitle, validListingUrl, DRESS_TRIES,
} from '../src/curate/data.js';

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
const WALL_STOP = 2; // consecutive walls that end the round
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------- log ------------------------------- */

const LOG_PATH = process.env.DESK_SWEEP_LOG || '';
function log(line) {
  const stamped = `${new Date().toISOString()}  ${line}`;
  console.log(stamped);
  if (LOG_PATH) {
    try {
      appendFileSync(LOG_PATH, stamped + '\n');
    } catch {
      /* the log must never kill the sweep */
    }
  }
}

/* ------------------------- lock + cleanup -------------------------- */

const STATE_DIR = join(process.env.LOCALAPPDATA || process.env.TEMP || '.', 'TourArchive');
const LOCK_PATH = join(STATE_DIR, 'sweep.lock');
let lockOwned = false;
let child = null;
let profileDir = null;

function takeLock() {
  mkdirSync(STATE_DIR, { recursive: true });
  if (existsSync(LOCK_PATH)) {
    try {
      const { pid, started } = JSON.parse(readFileSync(LOCK_PATH, 'utf8'));
      const fresh = Date.now() - Date.parse(started) < 60 * 60000;
      let alive = false;
      try {
        process.kill(pid, 0);
        alive = true;
      } catch {
        /* pid gone */
      }
      if (alive && fresh) return false;
    } catch {
      /* unreadable lock = stale */
    }
  }
  writeFileSync(LOCK_PATH, JSON.stringify({ pid: process.pid, started: new Date().toISOString() }));
  lockOwned = true;
  return true;
}

function cleanup() {
  if (child) {
    try {
      child.kill();
    } catch {
      /* already gone */
    }
    // /T is the point — Edge re-execs, and killing only the launcher leaves an
    // orphan browser holding the debug port for the next run to attach to
    try {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      /* best effort */
    }
    child = null;
  }
  if (profileDir) {
    try {
      rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      /* Windows briefly holds locks after exit; a leaked temp dir is harmless */
    }
    profileDir = null;
  }
  if (lockOwned) {
    try {
      rmSync(LOCK_PATH, { force: true });
    } catch {
      /* stale-lock detection covers this */
    }
    lockOwned = false;
  }
}
process.on('exit', cleanup);
process.on('SIGINT', () => {
  cleanup();
  process.exit(1);
});
process.on('SIGTERM', () => {
  cleanup();
  process.exit(1);
});

/* -------------------- listing probe (in-page) ---------------------- */

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
  const ogTitle = meta('meta[property="og:title"]');
  const price =
    meta('meta[property="product:price:amount"]') ||
    meta('meta[property="og:price:amount"]') ||
    (text('.x-price-primary').match(/[\\d,]+\\.?\\d*/) || [''])[0];
  const walled = /Pardon Our Interruption|Error Page|Access Denied|verify you are a human/i
    .test((document.title || '') + ' ' + (document.body?.textContent?.slice(0, 400) || ''));
  return JSON.stringify({
    href: location.href,
    ready: document.readyState === 'complete',
    walled,
    image: /^https?:/.test(image) ? image : '',
    ogTitle: ogTitle.slice(0, 200),
    price: price ? Number(String(price).replace(/,/g, '')) : null,
  });
})()`;

/* ------------------ one browser, many listings --------------------- */

async function withBrowser(fn) {
  if (!BROWSER) throw new Error('no Edge found');
  profileDir = join(process.env.TEMP || '.', 'curate-enrich', `${process.pid}-${Date.now()}`);
  mkdirSync(profileDir, { recursive: true });
  child = spawn(
    BROWSER,
    [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
      // headless advertises itself in the UA and eBay error-pages it
      '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profileDir}`,
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

    // The probe reads whatever DOM exists — including the PREVIOUS page's,
    // in the instant before navigation commits. Track the last page's href
    // and discard reads that still come from it.
    let lastHref = 'about:blank';
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
        if (!data || data.href === lastHref) continue; // still the old page
        if (data.walled) {
          lastHref = data.href;
          return { error: 'wall' };
        }
        if (data.image) {
          best = data;
          if (data.price || i >= 4) break;
        }
        if (!best && data.ready && i > 6) break;
      }
      if (best) lastHref = best.href;
      return best || { error: 'no image' };
    };

    return await fn(peek);
  } finally {
    cleanup();
  }
}

/* ------------------------------ modes ------------------------------ */

if (SINGLE_URL) {
  const result = await withBrowser((peek) => peek(SINGLE_URL));
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.error ? 1 : 0);
}

const ROBOT_EMAIL = process.env.ROBOT_EMAIL || '';
const ROBOT_PASSWORD = process.env.ROBOT_PASSWORD || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  log('could not sweep — live mode is not configured (src/curate/config.js)');
  process.exit(1);
}
if (!ROBOT_EMAIL || !ROBOT_PASSWORD) {
  log('could not sweep — the robot has no account yet.');
  console.log(`
Create it once (ACTIONS.md § 0): Supabase → Authentication → Users → Add user
→ robot@tourarchive.us + a long generated password + Auto Confirm User ✓,
then put ROBOT_EMAIL and ROBOT_PASSWORD in .env. The robot is a teammate
account, not a master key — same row rules as everyone, revocable in one click.
`);
  process.exit(1);
}

if (!DRY && !takeLock()) {
  log('another sweep is already running — leaving it to finish');
  process.exit(4);
}

// watchdog: belt to the scheduler's braces — the only guard against a peek
// hanging inside the WebSocket rather than the poll loop
const watchdog = setTimeout(() => {
  log('watchdog — the sweep ran long and was stopped');
  cleanup();
  process.exit(1);
}, 20 * 60000);
watchdog.unref?.();

const { createClient } = await import('@supabase/supabase-js');
const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
{
  const { error } = await supa.auth.signInWithPassword({
    email: ROBOT_EMAIL,
    password: ROBOT_PASSWORD,
  });
  if (error) {
    log(`could not sweep — the robot could not sign in (${error.message})`);
    process.exit(1);
  }
}

/* Fair queue: never-considered first (oldest drop first within), then least
   recently considered. Read pages until the browser budget is full. */
const rowToFind = (r) => ({
  url: r.url,
  photo: r.photo_url || '',
  title: r.title || '',
  dress_tries: r.dress_tries ?? 0,
  looked_at: r.looked_at ?? null,
  show_anyway: r.show_anyway === true,
  status: r.status,
  created_at: r.created_at,
});

const queue = [];
const alreadyDressed = [];
const now = new Date();
for (let page = 0; page < 10 && queue.length < MAX; page++) {
  const { data, error } = await supa
    .from(FINDS_TABLE)
    .select('*')
    .neq('status', 'pass')
    .lt('dress_tries', DRESS_TRIES)
    .order('looked_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true })
    .range(page * 100, page * 100 + 99);
  if (error) {
    log(`could not sweep — could not read the pile (${error.message})`);
    process.exit(1);
  }
  for (const row of data || []) {
    const find = rowToFind(row);
    if (isDressed(find)) {
      if (row.looked_at == null) alreadyDressed.push(row.id);
      continue;
    }
    if (dueForRobot(find, now) && queue.length < MAX) queue.push(row);
  }
  if (!data || data.length < 100) break;
}

log(`start — ${queue.length} to look up (budget ${MAX})`);

if (DRY) {
  for (const row of queue) {
    const find = rowToFind(row);
    log(`  would look up: ${(row.title || row.url).slice(0, 70)} — ${dressState(find)} · tried ${find.dress_tries} of ${DRESS_TRIES}`);
  }
  log(`dry run — nothing written, no browser launched`);
  process.exit(0);
}

// dressed rows the robot has never stamped sink to the back of the queue
if (alreadyDressed.length) {
  await supa
    .from(FINDS_TABLE)
    .update({ looked_at: now.toISOString() })
    .in('id', alreadyDressed.slice(0, 200));
}

if (!queue.length) {
  log('done — nothing was due');
  process.exit(0);
}

let dressed = 0;
let gaveUp = 0;
let noPicture = 0;
let teammateFirst = 0;
let wallStreak = 0;
let wallStopped = false;

await withBrowser(async (peek) => {
  for (const row of queue) {
    const label = (row.title || row.url).slice(0, 60);
    const peeked = await peek(row.url);
    const stamp = new Date().toISOString();

    if (peeked.error === 'wall') {
      wallStreak += 1;
      await supa.from(FINDS_TABLE).update({ looked_at: stamp }).eq('id', row.id).neq('status', 'pass');
      log(`  door closed   ${label} — the site wouldn’t let us look`);
      if (wallStreak >= WALL_STOP) {
        wallStopped = true;
        log('  stopping this round — walls lift; the next round will try again');
        break;
      }
    } else if (peeked.error) {
      wallStreak = 0;
      const tries = (row.dress_tries ?? 0) + 1;
      await supa
        .from(FINDS_TABLE)
        .update({ dress_tries: tries, looked_at: stamp })
        .eq('id', row.id)
        .neq('status', 'pass');
      if (tries >= DRESS_TRIES) {
        gaveUp += 1;
        log(`  gave up       ${label} — no picture on this page, tried ${tries} of ${DRESS_TRIES}`);
      } else {
        noPicture += 1;
        log(`  no picture    ${label} — tried ${tries} of ${DRESS_TRIES}`);
      }
    } else {
      wallStreak = 0;
      const patch = { looked_at: stamp, dress_tries: (row.dress_tries ?? 0) + 1 };
      const got = [];
      if (!String(row.photo_url ?? '').trim() && validListingUrl(peeked.image)) {
        patch.photo_url = peeked.image;
        got.push('+picture');
      }
      // the title write is COWARDLY: only from og:title, only on a pass that
      // yielded a picture, and only through the junk filter — one bad title
      // would deal an unusable card the desk can never fix
      if (!String(row.title ?? '').trim() && peeked.image) {
        const t = cleanScrapedTitle(peeked.ogTitle, row.source || '');
        if (t) {
          patch.title = t;
          got.push('+title');
        }
      }
      if (row.price_seen == null && peeked.price > 0 && peeked.price < 100000) {
        patch.price_seen = peeked.price;
        got.push(`+$${peeked.price}`);
      }
      const { data: written } = await supa
        .from(FINDS_TABLE)
        .update(patch)
        .eq('id', row.id)
        .neq('status', 'pass') // a find a human just discarded stays discarded
        .select('id');
      if ((written || []).length === 0) {
        teammateFirst += 1;
        log(`  teammate first  ${label} — decided while we were looking`);
      } else if (got.length) {
        dressed += 1;
        log(`  dressed       ${label}  ${got.join(' ')}`);
      } else {
        noPicture += 1;
        log(`  nothing new   ${label}`);
      }
    }
    await sleep(PAUSE_MS); // a breather between listings — reader, not crawler
  }
});

log(
  `done — ${dressed} dressed · ${noPicture} still waiting · ${gaveUp} gave up · ${teammateFirst} teammate first${
    wallStopped ? ' · stopped at a wall' : ''
  }`
);
process.exit(0);
