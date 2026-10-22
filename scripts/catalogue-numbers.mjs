/**
 * Give every piece a catalogue number, and write it to its Stripe product.
 *
 *   node scripts/catalogue-numbers.mjs             report: what would be numbered
 *   node scripts/catalogue-numbers.mjs --write     number the pieces (manifest)
 *   node scripts/catalogue-numbers.mjs --stripe    also set metadata sku on each
 *                                                  piece's Stripe product (needs
 *                                                  Products write on the key)
 *
 * Pieces already numbered keep their number. New pieces are numbered by the
 * drain as they arrive, so this is the one-time backfill plus a repair tool
 * (it also re-sends the sku to Stripe wherever the product's metadata is
 * missing or different). Order: ingestion date, then name, so numbers read
 * in the order pieces came in. Never runs git.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nextSku } from './lib/catalogue.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MANIFEST = join(ROOT, 'public', 'stock', 'manifest.json');
const WRITE = process.argv.includes('--write') || process.argv.includes('--stripe');
const STRIPE = process.argv.includes('--stripe');
const C = process.stdout.isTTY ? { red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', dim: '\x1b[2m', off: '\x1b[0m' } : { red: '', yellow: '', green: '', dim: '', off: '' };

const envFile = join(ROOT, '.env');
const env = {
  ...(existsSync(envFile) ? Object.fromEntries(readFileSync(envFile, 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])) : {}),
  ...(process.env.STRIPE_SECRET_KEY ? { STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY } : {}),
};

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
console.log(`\n${C.dim}── Tour Archive · catalogue numbers (${STRIPE ? 'WRITE + Stripe' : WRITE ? 'WRITE' : 'report'}) ──${C.off}`);

// 1. number the unnumbered, in the order they came in
const order = (e) => `${e._ingested || '0000-00-00'} ${e.name}`;
const todo = manifest.items.filter((e) => !e.sku).sort((a, b) => order(a).localeCompare(order(b)));
let numbered = 0;
for (const e of todo) {
  const sku = nextSku(manifest, e.collection);
  console.log(`${C.dim}   ${WRITE ? '' : 'would give '}${sku.padEnd(12)} ${e.name}${e.sold ? '  (sold)' : ''}${C.off}`);
  if (WRITE) { e.sku = sku; numbered += 1; }
}
if (WRITE && numbered) writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(`${C.dim}   ${todo.length} without a number · ${manifest.items.length - todo.length} already numbered${WRITE ? ` · ${numbered} written` : ''}${C.off}`);

// 2. the number on the Stripe product, as metadata sku
if (STRIPE) {
  if (!env.STRIPE_SECRET_KEY) { console.log(`${C.red}✖ STRIPE_SECRET_KEY is needed for --stripe${C.off}`); process.exit(1); }
  const H = { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' };
  let sent = 0;
  let same = 0;
  let failed = 0;
  for (const e of manifest.items.filter((x) => x.sku && x._stripe?.product)) {
    try {
      const cur = await (await fetch(`https://api.stripe.com/v1/products/${e._stripe.product}`, { headers: H })).json();
      if (cur.error) throw new Error(cur.error.message);
      if (cur.metadata?.sku === e.sku) { same += 1; continue; }
      const r = await fetch(`https://api.stripe.com/v1/products/${e._stripe.product}`, { method: 'POST', headers: H, body: new URLSearchParams({ 'metadata[sku]': e.sku }).toString() });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error?.message || r.status);
      sent += 1;
      console.log(`${C.green}   ✔ ${e.sku} → ${e._stripe.product} ${cur.active ? '' : '(archived product)'}${C.off}`);
    } catch (err) {
      failed += 1;
      console.log(`${C.red}   ✖ ${e.id}: ${err.message}${C.off}`);
    }
  }
  console.log(`${C.dim}   Stripe: ${sent} set · ${same} already right · ${failed} failed${C.off}`);
  process.exitCode = failed ? 1 : 0;
}
