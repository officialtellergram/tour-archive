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

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildInventory } from '../server/inventory.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = join(ROOT, 'dist', 'api');
const OUT_FILE = join(OUT_DIR, 'inventory.json');
const MAP_FILE = join(OUT_DIR, 'checkout-map.json');

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
  // Unconditional again now the eBay hold is gone: post-pivot, an empty shop
  // means something broke, never something intended.
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

console.log(`\n${C.green}✔ wrote dist/api/inventory.json${C.off}`);

/* The checkout map: what the Worker needs to make a Checkout Session for a
   cart (worker/stripe-hook/src/index.js /checkout) — each live, direct piece's
   Stripe product, its Payment Link (closed the moment it sells, so the Worker
   can refuse a stale cart) and its price, plus the flat shipping rate. Product
   and link ids are not secrets; the key that uses them lives on the Worker. */
try {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'public', 'stock', 'manifest.json'), 'utf8'));
  const map = { generatedAt: new Date().toISOString(), shippingRate: '', items: {} };
  for (const e of manifest.items || []) {
    if (e.sold || e.retired || e._missing || e.channel !== 'stripe') continue;
    if (e._stripe?.mode !== 'live' || !e._stripe?.product) continue;
    map.items[e.id] = {
      name: e.name,
      price: Number(e.price),
      product: e._stripe.product,
      link: e._stripe.link || '',
      ...(typeof e.sale === 'boolean' ? { sale: e.sale } : {}),
    };
    if (!map.shippingRate && e._stripe.shippingRate) map.shippingRate = e._stripe.shippingRate;
  }
  writeFileSync(MAP_FILE, JSON.stringify(map), 'utf8');
  console.log(`${C.green}✔ wrote dist/api/checkout-map.json${C.off} ${C.dim}(${Object.keys(map.items).length} pieces)${C.off}\n`);
} catch (err) {
  console.log(`\n${C.red}✖ could not write the checkout map: ${err.message}${C.off}\n`);
  process.exit(1);
}
