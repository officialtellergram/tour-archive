/**
 * Listing pull — archives the cofounder's eBay description copy.
 *
 * The words on a listing die with the listing, same as its photographs. This
 * sweep visits each eBay-listed manifest entry through ebay-peek's desc mode
 * (the description renders in an out-of-process iframe; the probe attaches to
 * the frame's own debugger target) and records the seller's copy as
 * plain-text paragraphs.
 *
 * Disjoint-writer contract: this script owns `description` + `_descPulled`
 * AND `specifics` + `_specsPulled` — nothing else. ingest owns entry-minting;
 * carousel-pull owns photos; sku and story are human-owned. Writes are
 * cowardly PER FIELD: a visit can record the description and refuse the
 * specifics, or vice versa. A default run fills entries missing either
 * field. `--refresh <id>` re-pulls one piece; `--refresh-all` re-pulls every
 * eBay entry (both fields are robot-owned wholesale — the cofounder edits
 * listings often; a failed harvest never blanks what exists).
 *
 * Never run alongside ingest or carousel-pull — all three rewrite the
 * manifest, one at a time.
 *
 * Exit codes: 0 all pulled/up to date · 1 any listing failed (successes are
 * already persisted; a re-run retries the failures for free).
 */

import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUYBOX_KEY_RX, CONTAMINATION_RX, SPEC_KEY_MAX, SPEC_VALUE_MAX } from './lib/stock-constants.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MANIFEST = join(ROOT, 'public', 'stock', 'manifest.json');
const PEEK = join(ROOT, 'scripts', 'ebay-peek.mjs');

const DELAY_MS = 5000; // politeness between listings; also lets Edge release port 9720
const C = { red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', dim: '\x1b[2m', off: '\x1b[0m' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Cowardly-write refusals: junk is worse than absent (cleanScrapedTitle
   precedent). Wall pages harvested via innerText read as plausible paragraphs
   — refuse them by phrase, and refuse any harvest not served by the
   description host itself. */
const WALL_RX =
  /pardon our interruption|error page|access denied|verify you are a human|robot check|just a moment|family safety|ask to use this site|request to an adult/i;

/* Specifics acceptance — same cowardly principle as descriptions: junk is
   worse than absent. Returns a human reason to refuse, or null to accept. */
function specificsProblem(specs) {
  if (!specs || typeof specs !== 'object' || Array.isArray(specs)) return 'not a plain object';
  const rows = Object.entries(specs);
  if (rows.length < 3) return `only ${rows.length} row(s) — About this item never renders that thin`;
  for (const [k, v] of rows) {
    if (!k.trim() || typeof v !== 'string' || !v.trim()) return 'empty key or value';
    if (k.includes('<') || v.includes('<')) return `'<' in "${k}" — plain text only`;
    if (BUYBOX_KEY_RX.test(k.trim())) return `buybox leak — "${k}" is not an item specific`;
    if (CONTAMINATION_RX.test(v)) return `"${k}" carries eBay chrome the junk-strip missed`;
    if (k.length > SPEC_KEY_MAX || v.length > SPEC_VALUE_MAX) return `"${k.slice(0, 40)}" is implausibly long`;
    if (WALL_RX.test(v)) return `wall phrase in "${k}"`;
  }
  return null;
}

const hasDesc = (e) => Array.isArray(e.description) && e.description.length > 0;
const hasSpecs = (e) =>
  e.specifics && typeof e.specifics === 'object' && !Array.isArray(e.specifics) &&
  Object.keys(e.specifics).length > 0;

/* ---------------- CLI ---------------- */

let refreshId = null;
let refreshAll = false;
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
    } else if (a === '--refresh-all') {
      refreshAll = true;
    } else {
      console.log(`${C.red}✖ unknown argument "${a}" — usage: npm run descriptions [-- --refresh <id> | --refresh-all]${C.off}`);
      process.exit(1);
    }
  }
  if (refreshId && refreshAll) {
    console.log(`${C.red}✖ --refresh and --refresh-all are different intents — pick one${C.off}`);
    process.exit(1);
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
  // ebay-peek self-bounds at 60s; this outer timeout is a never-fires backstop
  // (a fired timeout kills the peek but NOT its Edge grandchild).
  const res = spawnSync(process.execPath, [PEEK, url, 'desc'], { encoding: 'utf8', timeout: 120_000 });
  try {
    const data = JSON.parse(res.stdout);
    return data.error ? { error: data.error } : data;
  } catch {
    const tail = (res.stderr || '').trim().split('\n').pop() || `exit ${res.status}`;
    return { error: `probe produced no JSON — ${tail}` };
  }
}

async function waitPortFree() {
  // A stale headless Edge squatting 9720 silently poisons the next spawn.
  // Politeness first; then force: the 9720 listener can only ever be our own
  // probe's browser (Edge re-execs past its launcher, so pid tree-kills can
  // miss — the port is the one identity that cannot lie).
  for (let i = 0; i < 6; i++) {
    try {
      await fetch('http://127.0.0.1:9720/json/version', { signal: AbortSignal.timeout(800) });
      await sleep(1000); // still answering: previous Edge not gone yet
    } catch {
      return; // refused = free
    }
  }
  try {
    const net = spawnSync('netstat', ['-ano'], { encoding: 'utf8' });
    const line = (net.stdout || '').split('\n').find((l) => l.includes(':9720') && /LISTENING/i.test(l));
    const pid = line?.trim().split(/\s+/).pop();
    if (pid && Number(pid) > 4) {
      console.log(`${C.yellow}   ⚠ clearing a stale probe browser (pid ${pid}) off port 9720${C.off}`);
      spawnSync('taskkill', ['/PID', pid, '/T', '/F'], { stdio: 'ignore' });
      await sleep(1500);
    }
  } catch { /* best effort */ }
}

/* ---------------- flow ---------------- */

console.log(`\n${C.dim}── Tour Archive · listing pull ──${C.off}\n`);

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
} else if (refreshAll) {
  targets = items.filter((e) => ebayListingUrl(e));
} else {
  targets = items.filter((e) => {
    if (!ebayListingUrl(e)) return false;
    if (hasDesc(e) && hasSpecs(e)) {
      skipped++;
      return false;
    }
    return true;
  });
}

let pulled = 0;
let failed = 0;

for (const entry of targets) {
  if (pulled + failed > 0) await sleep(DELAY_MS);
  await waitPortFree(); // ALWAYS — a stale 9720 Edge poisons the FIRST probe of a sweep too

  const url = ebayListingUrl(entry);
  const refreshing = Boolean(refreshId || refreshAll);
  const needDesc = refreshing || !hasDesc(entry);
  const needSpecs = refreshing || !hasSpecs(entry);

  const res = probe(url);
  if (res.error) {
    console.log(`${C.red}   ✖ ${entry.id}: ${res.error}${C.off}`);
    failed++;
    continue;
  }

  // Page identity — the probe must echo the /itm/<id> of the page it actually
  // read. A mismatch means a poisoned read (stale browser serving another
  // listing): refuse the WHOLE harvest, both fields, nothing written.
  const reqId = (url.match(/\/itm\/(\d+)/) || [])[1] || '';
  if (!reqId || !res.pageItemId || res.pageItemId !== reqId) {
    console.log(`${C.red}   ✖ ${entry.id}: probe answered for item ${res.pageItemId || 'unknown'}, asked for ${reqId || url} — poisoned read, nothing written${C.off}`);
    failed++;
    continue;
  }

  const today = new Date().toISOString().slice(0, 10);
  const wrote = [];
  let entryFailed = false;

  if (needDesc) {
    const d = res.desc || {};
    const paras = Array.isArray(d.paras) ? d.paras : [];
    const joined = paras.join(' ');
    // Cowardly: a wall, a block, or a thin harvest writes NOTHING — existing
    // descriptions are archive record and are never blanked by a failure.
    if (!d.hostOk || d.blocked) {
      console.log(`${C.red}   ✖ ${entry.id}: description frame was not the description host (blocked or redirected)${C.off}`);
      entryFailed = true;
    } else if (!paras.length || joined.length < 40 || WALL_RX.test(joined)) {
      console.log(`${C.red}   ✖ ${entry.id}: description harvest too thin or wall-shaped — not written${C.off}`);
      entryFailed = true;
    } else {
      entry.description = paras;
      entry._descPulled = today;
      wrote.push(`${paras.length} paragraph(s)`);
    }
  }

  if (needSpecs) {
    const problem = specificsProblem(res.specifics);
    if (problem) {
      console.log(`${C.red}   ✖ ${entry.id}: specifics refused — ${problem}${C.off}`);
      entryFailed = true;
    } else {
      entry.specifics = res.specifics;
      entry._specsPulled = today;
      wrote.push(`${Object.keys(res.specifics).length} specific(s)`);
    }
  }

  // a good targeted field persists even when its sibling refused
  if (wrote.length) writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  if (entryFailed) failed++;
  else {
    console.log(`   ${C.green}✔${C.off} ${entry.id} ${C.dim}— ${wrote.join(' · ')}${C.off}`);
    pulled++;
  }
}

console.log(`\n   ${pulled} listing(s) pulled · ${skipped} already recorded · ${failed} failure(s)\n`);
if (failed) {
  console.log(`${C.red}✖ some listings did not pull — successes are saved; re-run to retry${C.off}\n`);
  process.exit(1);
}
console.log(`${C.green}✔ listing copy archived${C.off}\n`);
