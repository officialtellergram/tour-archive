/**
 * Build-time inventory snapshot.
 *
 * GitHub Pages serves static files only — no functions, no server. Rather than
 * drop back to the curated catalogue and lose the marketplace experience, we run
 * the exact same `buildInventory` at build time and write the result to
 * `dist/api/inventory.json`. The site then fetches that file instead of an API.
 *
 * This is a genuinely good fit rather than a workaround: the data is read-only,
 * it already tolerates being up to 15 minutes stale, and every visitor was being
 * served the same cached payload anyway. A static file is that cache, at the
 * edge, for free.
 *
 * Freshness comes from rebuilding — the GitHub Actions workflow runs on a
 * schedule, so stock refreshes without anyone touching it. When you want live
 * per-request data later, set VITE_API_BASE to a hosted API and the site
 * switches over with no code change.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildInventory } from '../server/inventory.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = join(ROOT, 'dist', 'api');
const OUT_FILE = join(OUT_DIR, 'inventory.json');

const C = { red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', dim: '\x1b[2m', off: '\x1b[0m' };

console.log(`\n${C.dim}── Tour Archive · inventory snapshot ──${C.off}`);

let payload;
try {
  payload = await buildInventory();
} catch (err) {
  // A snapshot failure must not silently ship an empty shop.
  console.log(`\n${C.red}✖ could not build inventory: ${err.message}${C.off}\n`);
  process.exit(1);
}

if (!payload.items?.length) {
  console.log(`\n${C.red}✖ inventory is empty — refusing to write the snapshot${C.off}\n`);
  process.exit(1);
}

payload.snapshot = {
  builtAt: new Date().toISOString(),
  note: 'Static build-time snapshot. Rebuild to refresh.',
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, JSON.stringify(payload), 'utf8');

const kb = (Buffer.byteLength(JSON.stringify(payload)) / 1024).toFixed(0);
console.log(`${C.dim}   ${payload.items.length} items · ${payload.counts.syndicated} syndicated · ${kb} KB${C.off}`);
for (const s of payload.sources) {
  const line = s.ok
    ? `${s.channel}: ${s.count}${s.mock ? ' (fixtures)' : ''}`
    : `${s.channel}: ${s.error}`;
  console.log(`${C.dim}   ${line}${C.off}`);
}

if (payload.sources.some((s) => s.mock)) {
  console.log(`\n${C.yellow}⚠ snapshot contains demo fixtures (MOCK_CHANNELS=1), not live stock${C.off}`);
}

console.log(`\n${C.green}✔ wrote dist/api/inventory.json${C.off}\n`);
