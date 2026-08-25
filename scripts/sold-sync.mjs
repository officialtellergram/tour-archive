/**
 * Sold sync — the daily reconciliation between the manifest and eBay.
 *
 * Two signals, both required (verified live 24–25 Aug 2026):
 *   1. The listing is ABSENT from the seller index (m.html). Necessary but
 *      not sufficient: a listing the seller ends and relists also vanishes.
 *   2. The listing page itself says it SOLD — the ended-banner reads
 *      "This listing sold on <date>" and the JSON-LD offer is OutOfStock.
 *      An ended-unsold page reads "ended by the seller"; a live page reads
 *      InStock with Buy/Cart buttons. The naive body-text `ended` heuristic
 *      is FALSE on sold pages, which is why this probe exists.
 *
 * Writes `sold: true` only when both agree. Everything else is REPORTED for
 * a human: ended-by-seller (relist? re-link the entry), index lag (page still
 * live), new listings not yet minted, probe failures. `sold` is otherwise a
 * hand-owned field; this script only ever flips it false → true.
 *
 * Modes:  --dry   report only, never write
 *         (none)  write the manifest locally — no git, per the house rule
 *                 that scheduled tasks never commit (desk-sweep.ps1 header)
 *         --push  GUARDED commit+push: only when the tree is otherwise clean,
 *                 after pull --rebase --autostash, manifest.json alone. A
 *                 rejected push aborts loudly and leaves the commit local.
 *
 * Exit: 0 clean (even with reports) · 1 the seller sweep or a write failed.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MANIFEST = join(ROOT, 'public', 'stock', 'manifest.json');
const PEEK = join(ROOT, 'scripts', 'ebay-peek.mjs');
const SELLER_INDEX = 'https://www.ebay.com/sch/tourarchive/m.html';
const DELAY_MS = 5000; // politeness + lets the previous Edge release port 9720

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const PUSH = args.includes('--push');
const C = { red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', dim: '\x1b[2m', off: '\x1b[0m' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const logFile = process.env.SOLD_SYNC_LOG;
function say(line) {
  console.log(line);
  if (logFile) {
    try { appendFileSync(logFile, `${new Date().toISOString()}  ${line.replace(/\x1b\[\d+m/g, '')}\n`); } catch { /* best effort */ }
  }
}

function peek(url, mode) {
  const res = spawnSync(process.execPath, [PEEK, url, mode], { encoding: 'utf8', timeout: 120_000 });
  try { return JSON.parse(res.stdout || 'null'); } catch { return null; }
}

const itmId = (u) => (String(u || '').match(/\/itm\/(\d+)/) || [])[1] || null;

/* ---------------- 1. the seller index ---------------- */

say(`${C.dim}── Tour Archive · sold sync${DRY ? ' (dry run)' : ''} ──${C.off}`);
const index = peek(SELLER_INDEX, 'seller');
if (!index || !Array.isArray(index.items) || !index.items.length) {
  say(`${C.red}✖ seller index did not serve — nothing written${C.off}`);
  process.exit(1);
}
const live = new Set(index.items.map((i) => itmId(i.link)).filter(Boolean));
say(`${C.dim}   ${live.size} listings on the seller index${C.off}`);

/* ---------------- 2. diff against the manifest ---------------- */

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const entries = manifest.items.filter((e) => itmId(e.listingUrl) && !e.sold && !e._missing);
const known = new Set(manifest.items.map((e) => itmId(e.listingUrl)).filter(Boolean));
const offIndex = entries.filter((e) => !live.has(itmId(e.listingUrl)));
const unminted = index.items.filter((i) => !known.has(itmId(i.link)));

/* ---------------- 3. confirm each off-index listing on its own page ---------------- */

const sold = [];
const ended = [];
const lag = [];
const failed = [];

for (let i = 0; i < offIndex.length; i++) {
  const e = offIndex[i];
  if (i > 0) await sleep(DELAY_MS);
  const p = peek(e.listingUrl, 'sold');
  if (!p || p.error || p.pageItemId !== itmId(e.listingUrl)) {
    failed.push(e);
    say(`   ${C.yellow}?${C.off} ${e.id} ${C.dim}— page did not settle (or identity mismatch); nothing written${C.off}`);
    continue;
  }
  const status = String(p.statusText || '');
  const soldOn = /^This listing sold on/i.test(status);
  const outOfStock = (p.ldAvailability || []).some((a) => /OutOfStock|SoldOut/.test(a));
  if (soldOn && outOfStock) {
    sold.push({ e, when: status.replace(/^This listing sold on\s*/i, '').replace(/\.$/, '') });
    say(`   ${C.green}✔${C.off} ${e.id} ${C.dim}— SOLD (${status})${C.off}`);
  } else if (/ended/i.test(status) || (outOfStock && !p.binButton)) {
    ended.push({ e, status });
    say(`   ${C.yellow}⚠${C.off} ${e.id} ${C.dim}— ENDED, not sold: "${status}" — relisted? re-link or retire by hand${C.off}`);
  } else {
    lag.push(e);
    say(`   ${C.dim}· ${e.id} — page still live (index lag); left as is${C.off}`);
  }
}

for (const i of unminted) {
  say(`   ${C.yellow}+${C.off} unminted listing ${itmId(i.link)} ${C.dim}— ${i.price}  ${i.title.replace(/Opens in a new window or tab/, '').trim()}${C.off}`);
}

/* ---------------- 4. write ---------------- */

if (sold.length && !DRY) {
  for (const { e } of sold) {
    const target = manifest.items.find((x) => x.id === e.id);
    target.sold = true;
  }
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  say(`${C.green}✔ wrote sold:true for ${sold.length} piece(s)${C.off}`);
}

say(
  `${C.dim}   ${sold.length} sold · ${ended.length} ended-unsold · ${lag.length} index-lag · ${failed.length} unprobed · ${unminted.length} unminted${C.off}`
);

/* ---------------- 5. guarded push (opt-in) ---------------- */

if (PUSH && sold.length && !DRY) {
  const git = (...a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' });
  const dirty = (git('status', '--porcelain').stdout || '')
    .split('\n')
    .filter((l) => l.trim() && !l.includes('public/stock/manifest.json'));
  if (dirty.length) {
    say(`${C.yellow}⚠ push skipped — working tree has other changes (${dirty.length} path(s)); sold flags are written locally${C.off}`);
  } else {
    const pull = git('pull', '--rebase', '--autostash', '--quiet');
    if (pull.status !== 0) {
      say(`${C.red}✖ push aborted — pull --rebase failed: ${(pull.stderr || '').trim().slice(0, 200)}${C.off}`);
      process.exit(1);
    }
    git('add', 'public/stock/manifest.json');
    const names = sold.map(({ e }) => e.id.replace(/^stock-/, '')).join(', ');
    const commit = git('commit', '-q', '-m', `Sold sync: ${names}\n\nConfirmed on the listing pages ("This listing sold on …") and absent from the seller index.`);
    if (commit.status !== 0) {
      say(`${C.red}✖ commit failed: ${(commit.stderr || '').trim().slice(0, 200)}${C.off}`);
      process.exit(1);
    }
    const push = git('push', '--quiet');
    if (push.status !== 0) {
      say(`${C.red}✖ push rejected — commit left local for the next run: ${(push.stderr || '').trim().slice(0, 200)}${C.off}`);
      process.exit(1);
    }
    say(`${C.green}✔ pushed — the deploy will carry the sold flags live${C.off}`);
  }
}

process.exit(0);
