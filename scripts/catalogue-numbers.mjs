/**
 * Give every piece a catalogue number, and write it to its Stripe product.
 *
 *   node scripts/catalogue-numbers.mjs             report: what would be numbered
 *   node scripts/catalogue-numbers.mjs --write     number the catalogue's pieces
 *   node scripts/catalogue-numbers.mjs --stripe    also set metadata sku on each
 *                                                  piece's Stripe product
 *   node scripts/catalogue-numbers.mjs --held      number the HELD Stripe products
 *                                                  (never drained, so they live only
 *                                                  in Stripe): metadata sku on each
 *
 * Pieces and products already numbered keep their number; a number Henry
 * wrote in a product's description ("SKU: TA_GS_56") is honoured and copied
 * to metadata. Numbers past the catalogue's and past every claim on Stripe,
 * so nothing collides. Order: ingestion date (or Stripe creation), then
 * name. Never runs git. --stripe and --held need Products write on the key.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { claimedSku, nextSku, usableSku } from './lib/catalogue.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MANIFEST = join(ROOT, 'public', 'stock', 'manifest.json');
const STRIPE = process.argv.includes('--stripe');
const HELD = process.argv.includes('--held');
const WRITE = process.argv.includes('--write') || STRIPE || HELD;
const C = process.stdout.isTTY ? { red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', dim: '\x1b[2m', off: '\x1b[0m' } : { red: '', yellow: '', green: '', dim: '', off: '' };

const envFile = join(ROOT, '.env');
const env = {
  ...(existsSync(envFile) ? Object.fromEntries(readFileSync(envFile, 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])) : {}),
  ...(process.env.STRIPE_SECRET_KEY ? { STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY } : {}),
};
const H = { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' };
async function products() {
  const out = [];
  let after = '';
  for (;;) {
    const r = await fetch(`https://api.stripe.com/v1/products?active=true&limit=100${after ? `&starting_after=${after}` : ''}`, { headers: H });
    const page = await r.json();
    if (!r.ok) throw new Error(page.error?.message || r.status);
    out.push(...page.data);
    if (!page.has_more || !page.data.length) break;
    after = page.data[page.data.length - 1].id;
  }
  return out;
}
const isHeld = (p) => /^(true|yes|1)$/i.test(String(p.metadata?.held || '')) || /^\s*\[?hold\]?\s*[:\-–]/i.test(p.name) || /(^|\n)\s*\[?held\]?\s*:?\s*(\r?\n|$)/i.test(String(p.description || ''));

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
console.log(`\n${C.dim}── Tour Archive · catalogue numbers (${HELD ? 'held products on Stripe' : STRIPE ? 'WRITE + Stripe' : WRITE ? 'WRITE' : 'report'}) ──${C.off}`);

// every number any Stripe product has claimed, so new ones never collide
let all = [];
let claimed = [];
if ((STRIPE || HELD) && env.STRIPE_SECRET_KEY) {
  all = await products();
  claimed = all.map(claimedSku).filter(Boolean);
}

if (!HELD) {
  // 1. number the catalogue's unnumbered pieces, in the order they came in
  const order = (e) => `${e._ingested || '0000-00-00'} ${e.name}`;
  const todo = manifest.items.filter((e) => !e.sku).sort((a, b) => order(a).localeCompare(order(b)));
  let numbered = 0;
  for (const e of todo) {
    const sku = nextSku(manifest, e.collection, claimed);
    console.log(`${C.dim}   ${WRITE ? '' : 'would give '}${sku.padEnd(12)} ${e.name}${e.sold ? '  (sold)' : ''}${C.off}`);
    if (WRITE) { e.sku = sku; numbered += 1; }
  }
  if (WRITE && numbered) writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log(`${C.dim}   ${todo.length} without a number · ${manifest.items.length - todo.length} already numbered${WRITE ? ` · ${numbered} written` : ''}${C.off}`);
}

// 2. the number on the Stripe product, as metadata sku
if (STRIPE || HELD) {
  if (!env.STRIPE_SECRET_KEY) { console.log(`${C.red}✖ STRIPE_SECRET_KEY is needed${C.off}`); process.exit(1); }
  let sent = 0;
  let same = 0;
  let failed = 0;
  const set = async (p, sku, note) => {
    if (p.metadata?.sku === sku) { same += 1; return; }
    const r = await fetch(`https://api.stripe.com/v1/products/${p.id}`, { method: 'POST', headers: H, body: new URLSearchParams({ 'metadata[sku]': sku }).toString() });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error?.message || r.status);
    sent += 1;
    console.log(`${C.green}   ✔ ${sku.padEnd(12)} ${p.name}${note ? `  ${C.dim}${note}${C.off}` : ''}${C.off}`);
  };
  if (HELD) {
    // held products, oldest first, numbered in the general-stock series
    const held = all.filter(isHeld).sort((a, b) => a.created - b.created || a.name.localeCompare(b.name));
    for (const p of held) {
      try {
        let sku = claimedSku(p);
        let note = sku ? (p.metadata?.sku ? '' : 'from the description') : '';
        if (!sku) { sku = nextSku(manifest, 'basic-stock', claimed); claimed.push(sku); note = 'new'; }
        await set(p, sku, note);
      } catch (err) { failed += 1; console.log(`${C.red}   ✖ ${p.name}: ${err.message}${C.off}`); }
    }
    console.log(`${C.dim}   held: ${held.length} product(s) · ${sent} numbered · ${same} already right · ${failed} failed${C.off}`);
  } else {
    for (const e of manifest.items.filter((x) => x.sku && x._stripe?.product)) {
      try {
        const p = all.find((x) => x.id === e._stripe.product) || (await (await fetch(`https://api.stripe.com/v1/products/${e._stripe.product}`, { headers: H })).json());
        if (p.error) throw new Error(p.error.message);
        await set(p, e.sku, p.active ? '' : '(archived product)');
      } catch (err) { failed += 1; console.log(`${C.red}   ✖ ${e.id}: ${err.message}${C.off}`); }
    }
    console.log(`${C.dim}   Stripe: ${sent} set · ${same} already right · ${failed} failed${C.off}`);
  }
  process.exitCode = failed ? 1 : 0;
}
