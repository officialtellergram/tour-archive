/**
 * Carousel pull — archives our own eBay listings' full photo sets.
 *
 * A listing's photographs die with the listing; the repo is the copy that
 * survives. This script visits each eBay-listed manifest entry the way a
 * browser would (via ebay-peek's images probe — eBay bot-walls plain fetches,
 * but its image CDN does not), downloads every carousel frame at full size to
 * public/stock/carousel/<slug>/, and records the ordered list in the entry's
 * `photos` field.
 *
 * Disjoint-writer contract: this script owns `photos` + `_photosPulled` and
 * the carousel/ folder; ingest owns everything else in the manifest. An
 * existing `photos` array is NEVER overwritten by a default run — that is
 * ingest's own one-way contract, applied to the new field. Hand edits (pruned
 * duplicate frames, reordered views) always win. To re-pull ONE piece after a
 * relist: `npm run photos -- --refresh <id>` — the only overwrite path, one
 * piece at a time, which is the only granularity at which a human can vouch
 * that overwriting is intended.
 *
 * Never run alongside ingest — both read-then-rewrite the manifest.
 *
 * Exit codes: 0 all pulled/up to date · 1 any listing failed (successes are
 * already persisted — the manifest is written after each listing).
 */

import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_BYTES, PEEK_UA } from './lib/stock-constants.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const STOCK = join(ROOT, 'public', 'stock');
const MANIFEST = join(STOCK, 'manifest.json');
const CAROUSEL = join(STOCK, 'carousel');
const PEEK = join(ROOT, 'scripts', 'ebay-peek.mjs');

const DELAY_MS = 5000; // politeness between listings; also lets the previous browser release port 9720
const EXT_BY_TYPE = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const C = { red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', dim: '\x1b[2m', off: '\x1b[0m' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- CLI ---------------- */

let refreshId = null;
{
  const args = process.argv.slice(2);
  while (args.length) {
    const a = args.shift();
    if (a === '--refresh') {
      refreshId = args.shift();
      if (!refreshId) {
        console.log(`${C.red}✖ --refresh needs an entry id (with or without the stock- prefix)${C.off}`);
        process.exit(1);
      }
    } else {
      console.log(`${C.red}✖ unknown argument "${a}" — usage: npm run photos [-- --refresh <id>]${C.off}`);
      process.exit(1);
    }
  }
}

/* ---------------- helpers ---------------- */

function ebayListingUrl(entry) {
  const candidates = [
    entry.channel === 'ebay' ? entry.listingUrl : null,
    ...(Array.isArray(entry.listings)
      ? entry.listings.filter((l) => l?.channel === 'ebay').map((l) => l.url)
      : []),
  ];
  return candidates.find((u) => typeof u === 'string' && /^https:\/\/(www\.)?ebay\./.test(u)) || null;
}

function probe(url) {
  // ebay-peek self-bounds at 60s (its watchdog); this outer timeout is a
  // never-fires backstop — if it DID fire it would kill the peek but not its
  // Edge grandchild, so it must stay comfortably above the probe's own bound.
  const res = spawnSync(process.execPath, [PEEK, url, 'images'], {
    encoding: 'utf8',
    timeout: 120_000,
  });
  try {
    const data = JSON.parse(res.stdout);
    return data.error ? { error: data.error } : data;
  } catch {
    const tail = (res.stderr || '').trim().split('\n').pop() || `exit ${res.status}`;
    return { error: `probe produced no JSON — ${tail}` };
  }
}

async function download(url) {
  const res = await fetch(url, { headers: { 'user-agent': PEEK_UA } });
  if (!res.ok) throw new Error(`${res.status} on ${url}`);
  const type = (res.headers.get('content-type') || '').split(';')[0].trim();
  const ext = EXT_BY_TYPE[type];
  if (!ext) throw new Error(`not an image (${type || 'no content-type'}) — ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) throw new Error(`zero bytes — ${url}`);
  return { buf, ext };
}

/* ---------------- flow ---------------- */

console.log(`\n${C.dim}── Tour Archive · carousel pull ──${C.off}\n`);

let manifest;
try {
  manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
} catch (err) {
  console.log(`${C.red}✖ manifest unreadable — ${err.message}${C.off}`);
  process.exit(1);
}

const items = manifest.items || [];
let targets;
let skipped = 0;

if (refreshId) {
  const id = refreshId.startsWith('stock-') ? refreshId : `stock-${refreshId}`;
  const entry = items.find((e) => e.id === id);
  if (!entry) {
    console.log(`${C.red}✖ no manifest entry "${id}"${C.off}`);
    process.exit(1);
  }
  if (!ebayListingUrl(entry)) {
    console.log(`${C.red}✖ ${id} has no eBay listing URL — nothing to pull from${C.off}`);
    process.exit(1);
  }
  targets = [entry];
} else {
  // Default run: every eBay-listed entry that has no photos yet. Never
  // overwrites — an entry with a photos array is someone's edited record.
  targets = items.filter((e) => {
    if (!ebayListingUrl(e)) return false;
    if (Array.isArray(e.photos) && e.photos.length) {
      skipped++;
      return false;
    }
    return true;
  });
}

let pulled = 0;
let imageCount = 0;
let failed = 0;

for (const entry of targets) {
  if (pulled + failed > 0) await sleep(DELAY_MS);

  const slug = entry.id.replace(/^stock-/, '');
  const url = ebayListingUrl(entry);
  const res = probe(url);

  if (res.error || !Array.isArray(res.images) || res.images.length <= 1) {
    // One frame is an og-only harvest — the carousel never rendered. Writing
    // it would park the entry outside every future default sweep, so a thin
    // harvest is a FAILURE: nothing written, the entry stays in the target
    // set, and the next `npm run photos` retries it for free.
    const reason = res.error || `only ${res.images?.length ?? 0} frame(s) came back — carousel likely never rendered`;
    console.log(`${C.red}   ✖ ${entry.id}: ${reason}${C.off}`);
    failed++;
    continue;
  }

  // Download ALL frames into memory first — all-or-nothing per listing. Any
  // frame failing fails the whole listing; no gappy sequences, no partial dirs.
  let frames;
  try {
    frames = [];
    for (const imageUrl of res.images) frames.push(await download(imageUrl));
  } catch (err) {
    console.log(`${C.red}   ✖ ${entry.id}: ${err.message}${C.off}`);
    failed++;
    continue;
  }

  const dir = join(CAROUSEL, slug);
  rmSync(dir, { recursive: true, force: true }); // a refresh drops stale higher-numbered frames
  mkdirSync(dir, { recursive: true });

  entry.photos = frames.map(({ buf, ext }, n) => {
    const name = `${String(n + 1).padStart(2, '0')}.${ext}`;
    writeFileSync(join(dir, name), buf);
    if (buf.length > MAX_BYTES)
      console.log(`${C.yellow}   ⚠ carousel/${slug}/${name} is ${(buf.length / 1048576).toFixed(1)} MB — it ships with the site${C.off}`);
    return `carousel/${slug}/${name}`; // literal forward slashes — these are URL paths
  });
  entry._photosPulled = new Date().toISOString().slice(0, 10);

  // Persist after each success so a crash mid-run keeps completed pulls.
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  console.log(`   ${C.green}✔${C.off} ${entry.id} ${C.dim}— ${frames.length} frames${C.off}`);
  pulled++;
  imageCount += frames.length;
}

console.log(
  `\n   ${pulled} listing(s) pulled · ${imageCount} image(s) · ${skipped} already archived · ${failed} failure(s)\n`
);
if (failed) {
  console.log(`${C.red}✖ some listings did not pull — successes are saved; re-run to retry${C.off}\n`);
  process.exit(1);
}
console.log(`${C.green}✔ carousel archive up to date${C.off}\n`);
