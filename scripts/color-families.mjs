/**
 * Colour families for the archive's Color filter — part of `npm run
 * build:pages`, before the snapshot.
 *
 * Reads every manifest entry's hero photograph and writes the family it
 * belongs to (scripts/lib/color-family.mjs) into
 * public/stock/color-families.json, keyed by the manifest `file`. The
 * mapper (server/inventory.mjs) stamps each item with it as `colorFamily`,
 * so the dev server, the snapshot and the prerender all agree.
 *
 * The JSON is committed: a photograph already read is never read again,
 * so a build only touches what the last drop added (a few seconds for five
 * pieces, about a minute for the whole catalogue). Entries whose file has
 * left the disk are dropped. A manifest entry with its own `colorFamily`
 * is left to the mapper — the hand always beats the camera.
 *
 *   npm run colors          read what is new
 *   node scripts/color-families.mjs --all     re-read everything (after a threshold change)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { colorFamilyOf } from './lib/color-family.mjs';
import { COLOR_FAMILIES } from '../src/data/colors.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const STOCK = join(ROOT, 'public', 'stock');
const MANIFEST = join(STOCK, 'manifest.json');
const OUT = join(STOCK, 'color-families.json');
const ALL = process.argv.includes('--all');
const C = { red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', dim: '\x1b[2m', off: '\x1b[0m' };

console.log(`\n${C.dim}── Tour Archive · colour families ──${C.off}`);

if (!existsSync(MANIFEST)) {
  console.log(`${C.yellow}⚠ no manifest at public/stock/manifest.json — nothing to read${C.off}\n`);
  process.exit(0);
}
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const files = [...new Set((manifest.items || []).map((e) => e.file).filter((f) => typeof f === 'string' && f))];

let cache = {};
if (existsSync(OUT) && !ALL) {
  try { cache = JSON.parse(readFileSync(OUT, 'utf8')); } catch { cache = {}; }
}
const known = new Set(COLOR_FAMILIES.map((f) => f.id));

let read = 0, kept = 0, failed = 0;
const next = {};
for (const file of files) {
  const src = join(STOCK, file);
  if (!existsSync(src)) continue; // the audit reports missing photographs; this step just skips them
  if (cache[file] && known.has(cache[file].family)) { next[file] = cache[file]; kept++; continue; }
  try {
    const r = await colorFamilyOf(src);
    if (!known.has(r.family)) throw new Error(`unknown family "${r.family}"`);
    next[file] = { family: r.family, swatch: r.swatch, share: r.share };
    read++;
    console.log(`${C.dim}   ${r.family.padEnd(7)} ${String(Math.round(r.share * 100)).padStart(3)}%  ${file}${C.off}`);
  } catch (err) {
    failed++;
    console.log(`${C.yellow}   ⚠ ${file}: ${err.message}${C.off}`);
  }
}

const sorted = Object.fromEntries(Object.keys(next).sort().map((k) => [k, next[k]]));
writeFileSync(OUT, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
console.log(`${C.dim}   ${read} read · ${kept} kept · ${failed} failed · ${Object.keys(sorted).length} on file${C.off}`);
console.log(`\n${C.green}✔ wrote public/stock/color-families.json${C.off}\n`);
