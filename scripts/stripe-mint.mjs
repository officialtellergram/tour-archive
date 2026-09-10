/**
 * Stripe mint — turns manifest entries into live checkout, manifest → Stripe.
 *
 * For every sellable entry without a Payment Link it creates the Product
 * (photos by their public tourarchive.us URLs), the Price, and the Payment
 * Link (quantity locked to 1, one completed checkout only, flat US shipping,
 * terms consent), then writes the link back into the entry. The manifest
 * stays the single source of truth: Stripe is derived from it by this
 * script and never authored in the dashboard for existing stock. New stock
 * Henry lists in the dashboard flows the OTHER way (stripe-drain, Phase C)
 * and this script then only minted what the drain scaffolded.
 *
 * Idempotent: the entry's `_stripe` ledger is primary; crash recovery
 * re-adopts by listing products and matching `metadata.ta_id` client-side
 * (the Search API returns inactive objects and lags its index — never used).
 * Price drift on an already-minted entry is REPORTED and refused, never
 * auto-reminted (v1).
 *
 * Modes:  (none)     dry-run — the full per-entry plan, zero network calls
 *         --probe    read-only preflight: key, every image URL, shipping
 *                    rate, adoption scan. Exit 1 on any failure.
 *         --write    mint + write the manifest locally. NEVER runs git.
 *         --only=id  restrict to one entry (the proof-piece flow)
 *         --shipping=<cents>  flat rate when creating one (default 800)
 *         --live     required alongside --write when the key is sk_live_
 *
 * Key discipline: sk_test_ mints play-money links the gates refuse to ship
 * (audit + deploy + integration all tripwire buy.stripe.com/test_). A live
 * key without --live aborts; --live with a test key aborts.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MANIFEST = join(ROOT, 'public', 'stock', 'manifest.json');
const SITE = 'https://tourarchive.us';
const API = 'https://api.stripe.com';

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const PROBE = args.includes('--probe');
const LIVE = args.includes('--live');
const ONLY = (args.find((a) => a.startsWith('--only=')) || '').slice(7) || null;
const SHIP_CENTS = Number((args.find((a) => a.startsWith('--shipping=')) || '').slice(11)) || 800;
const C = { red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', dim: '\x1b[2m', off: '\x1b[0m' };

/* ---------------- key + mode ---------------- */

function envKey() {
  if (process.env.STRIPE_SECRET_KEY) return process.env.STRIPE_SECRET_KEY.trim();
  const envPath = join(ROOT, '.env');
  if (!existsSync(envPath)) return '';
  for (const line of readFileSync(envPath, 'utf8').replace(/^﻿/, '').split('\n')) {
    if (line.startsWith('STRIPE_SECRET_KEY=')) return line.slice('STRIPE_SECRET_KEY='.length).replace(/\r$/, '').trim();
  }
  return '';
}

const KEY = envKey();
const MODE = KEY.startsWith('sk_test_') ? 'test' : KEY.startsWith('sk_live_') ? 'live' : null;
if (!MODE) {
  console.error(`${C.red}✖ STRIPE_SECRET_KEY missing or not an sk_test_/sk_live_ key${C.off}`);
  process.exit(1);
}
if (WRITE && MODE === 'live' && !LIVE) {
  console.error(`${C.red}✖ live key without --live — pass --write --live to mint for real money${C.off}`);
  process.exit(1);
}
if (LIVE && MODE !== 'live') {
  console.error(`${C.red}✖ --live passed but the key is a test key — swap .env to sk_live_ first${C.off}`);
  process.exit(1);
}

console.log(`\n${C.dim}── Tour Archive · stripe mint ──${C.off}`);
console.log(
  `${MODE === 'test' ? C.yellow : C.red}   ${MODE.toUpperCase()} MODE${C.off}${C.dim} · ${
    WRITE ? 'WRITE' : PROBE ? 'probe (read-only)' : 'dry-run (no network)'
  }${ONLY ? ` · only ${ONLY}` : ''}${C.off}`
);

/* ---------------- Stripe REST (form-encoded, no deps) ---------------- */

const AUTH = 'Basic ' + Buffer.from(KEY + ':').toString('base64');

async function stripe(method, path, params) {
  const opts = { method, headers: { Authorization: AUTH } };
  if (params) {
    opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    opts.body = new URLSearchParams(params).toString();
  }
  const res = await fetch(API + path, opts);
  const body = await res.json();
  if (!res.ok) {
    const msg = body?.error?.message || `HTTP ${res.status}`;
    throw new Error(`${method} ${path}: ${msg}`);
  }
  return body;
}

/* ---------------- manifest ---------------- */

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const saveManifest = () => writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

/* Placeholder substitution, same contract as the mapper (inventory.mjs). */
const PLACEHOLDERS = new Set(['see listing', 'see photos', '—', '']);
const isPh = (v) => v == null || (typeof v === 'string' && PLACEHOLDERS.has(v.trim().toLowerCase()));
const fact = (editorial, f) => (isPh(editorial) && typeof f === 'string' && f.trim() ? f : editorial);

const sellable = (e) =>
  !e.sold && !e.retired && !e._missing && !e._draft &&
  Number(e.price) > 0 && (e.photos?.length || e.file);

/* An entry counts as minted only when its ledger matches the running mode —
   at live cutover, test-mode ledgers read as absent and the piece remints. */
const minted = (e) => e._stripe?.link && e._stripe?.mode === MODE;

const queue = manifest.items.filter((e) => sellable(e) && !minted(e) && (!ONLY || e.id === ONLY));
const already = manifest.items.filter((e) => sellable(e) && minted(e)).length;

const imagesOf = (e) => {
  const rel = e.photos?.length ? e.photos : [e.file];
  return rel.slice(0, 8).map((p) => `${SITE}/stock/${p}`); // 8 is Stripe's hard cap
};
const descOf = (e) => {
  const lead = Array.isArray(e.description) && e.description.length ? e.description[0] : e.story || '';
  const size = fact(e.size, e.specifics?.Size);
  const cond = fact(e.condition, e.specifics?.Condition);
  const facts = [size && `Size ${size}`, cond].filter(Boolean).join(', ');
  return [lead, facts].filter(Boolean).join(' — ').slice(0, 1500);
};

/* ---------------- dry-run ---------------- */

if (!WRITE && !PROBE) {
  for (const e of queue) {
    console.log(
      `${C.dim}   would mint${C.off} ${e.id}  $${e.price} · ${imagesOf(e).length} image(s)${e.sku ? ` · ${e.sku}` : ''}`
    );
  }
  console.log(`\n${C.dim}   ${queue.length} to mint · ${already} already minted (${MODE})${C.off}`);
  console.log(`${C.dim}   next: node scripts/stripe-mint.mjs --probe${C.off}\n`);
  process.exit(0);
}

/* ---------------- shared preflight ---------------- */

let failures = 0;
const fail = (msg) => { failures += 1; console.log(`${C.red}   ✖ ${msg}${C.off}`); };

const bal = await stripe('GET', '/v1/balance').catch((err) => (fail(`key rejected: ${err.message}`), null));
if (bal) console.log(`${C.dim}   key OK (${MODE})${C.off}`);

async function findShippingRate() {
  const rates = await stripe('GET', '/v1/shipping_rates?active=true&limit=100');
  return rates.data.find((r) => r.metadata?.ta === 'flat') || null;
}
let shipRate = await findShippingRate();
if (shipRate && shipRate.fixed_amount?.amount !== SHIP_CENTS) {
  fail(
    `shipping rate ${shipRate.id} is ${shipRate.fixed_amount?.amount}¢ but --shipping says ${SHIP_CENTS}¢ — ` +
      `deactivate the old rate or match the flag`
  );
}

async function listAll(path) {
  const out = [];
  let after = '';
  for (;;) {
    const page = await stripe('GET', `${path}${after ? `&starting_after=${after}` : ''}`);
    out.push(...page.data);
    if (!page.has_more || !page.data.length) return out;
    after = page.data[page.data.length - 1].id;
  }
}

/* Crash-recovery adoption: products already carrying our stamp. */
const remoteProducts = (await listAll('/v1/products?limit=100').catch((err) => (fail(`product scan: ${err.message}`), [])))
  .filter((p) => p.active && p.metadata?.ta_id);
const remoteByTa = new Map(remoteProducts.map((p) => [p.metadata.ta_id, p]));

/* ---------------- probe ---------------- */

if (PROBE) {
  for (const e of queue) {
    for (const url of imagesOf(e)) {
      const res = await fetch(url, { method: 'HEAD' }).catch(() => null);
      const type = res?.headers?.get('content-type') || '';
      if (!res?.ok || !type.startsWith('image/'))
        fail(`${e.id}: ${url} → ${res ? `${res.status} ${type}` : 'unreachable'}`);
    }
  }
  console.log(`${C.dim}   images checked for ${queue.length} entr${queue.length === 1 ? 'y' : 'ies'}${C.off}`);
  console.log(
    shipRate
      ? `${C.dim}   shipping rate: ${shipRate.id} (${shipRate.fixed_amount.amount}¢)${C.off}`
      : `${C.dim}   shipping rate: none — --write will create one at ${SHIP_CENTS}¢${C.off}`
  );
  const orphans = [...remoteByTa.keys()].filter((ta) => !manifest.items.some((e) => e.id === ta && minted(e)));
  console.log(`${C.dim}   adoption scan: ${remoteByTa.size} stamped product(s), ${orphans.length} unledgered${C.off}`);
  if (failures) {
    console.log(`\n${C.red}✖ probe failed (${failures})${C.off}\n`);
    process.exit(1);
  }
  console.log(`\n${C.green}✔ probe clean — ready for --write${C.off}\n`);
  process.exit(0);
}

/* ---------------- write ---------------- */

if (failures) {
  console.log(`\n${C.red}✖ preflight failed — nothing minted${C.off}\n`);
  process.exit(1);
}

if (!shipRate) {
  shipRate = await stripe('POST', '/v1/shipping_rates', {
    display_name: 'USPS Ground Advantage',
    type: 'fixed_amount',
    'fixed_amount[amount]': String(SHIP_CENTS),
    'fixed_amount[currency]': 'usd',
    'metadata[ta]': 'flat',
  });
  console.log(`${C.green}   ✔ created shipping rate ${shipRate.id} (${SHIP_CENTS}¢)${C.off}`);
}

const today = new Date().toISOString().slice(0, 10);
let mintedNow = 0;
const drifted = [];

for (const e of queue) {
  try {
    /* 1. product — adopt a stamped survivor from a crashed run, else create */
    let product = remoteByTa.get(e.id) || null;
    if (!product) {
      const params = {
        name: e.name,
        description: descOf(e),
        shippable: 'true',
        'metadata[ta_id]': e.id,
      };
      if (typeof e.sku === 'string' && e.sku.trim()) params['metadata[ta_sku]'] = e.sku;
      imagesOf(e).forEach((u, i) => (params[`images[${i}]`] = u));
      product = await stripe('POST', '/v1/products', params);
    }

    /* 2. price — reuse the product's active one-time USD price if it agrees */
    const want = Math.round(Number(e.price) * 100);
    const prices = await stripe('GET', `/v1/prices?product=${product.id}&active=true&limit=100`);
    let price = prices.data.find((p) => p.currency === 'usd' && !p.recurring) || null;
    if (price && price.unit_amount !== want) {
      drifted.push(`${e.id}: manifest $${e.price} vs Stripe ${price.unit_amount}¢ (${price.id})`);
      console.log(`${C.yellow}   ⚠ ${e.id} PRICE DRIFT — remint by hand, skipped${C.off}`);
      continue;
    }
    if (!price)
      price = await stripe('POST', '/v1/prices', {
        product: product.id,
        currency: 'usd',
        unit_amount: String(want),
      });

    /* 3. payment link — one piece, one completed checkout, consent to terms */
    const link = await stripe('POST', '/v1/payment_links', {
      'line_items[0][price]': price.id,
      'line_items[0][quantity]': '1',
      'restrictions[completed_sessions][limit]': '1',
      'shipping_address_collection[allowed_countries][0]': 'US',
      'shipping_options[0][shipping_rate]': shipRate.id,
      'consent_collection[terms_of_service]': 'required',
      'custom_text[terms_of_service_acceptance][message]':
        'I agree to the [terms of sale](https://tourarchive.us/terms).',
      inactive_message: 'Sold — one of one. Everything at tourarchive.us is a single piece.',
      'after_completion[type]': 'hosted_confirmation',
      'after_completion[hosted_confirmation][custom_message]':
        'Thank you. Your piece ships within 3 business days; tracking follows by email.',
      'metadata[ta_id]': e.id,
    });

    /* 4. write-back, immediately — a crash after this line loses nothing */
    if (e.listingUrl && !e._ebayUrl) e._ebayUrl = e.listingUrl;
    e.channel = 'stripe';
    e.listingUrl = link.url;
    e._stripe = {
      product: product.id,
      price: price.id,
      link: link.id,
      shippingRate: shipRate.id,
      mode: MODE,
      minted: today,
    };
    saveManifest();
    mintedNow += 1;
    console.log(`${C.green}   ✔ ${e.id} → ${link.url}${C.off}`);
  } catch (err) {
    fail(`${e.id}: ${err.message}`);
  }
}

console.log(
  `\n${C.dim}   minted ${mintedNow}/${queue.length} · ${already} were already minted · ${drifted.length} drifted · ${failures} failed${C.off}`
);
if (MODE === 'test' && mintedNow) {
  console.log(
    `${C.red}   TEST links written to the manifest — npm run check will refuse to ship these. Proof runs only; git restore when done.${C.off}`
  );
}
console.log('');
// exitCode, never process.exit(): a hard exit races undici's keep-alive
// teardown on Windows (libuv async.c assertion) — let the loop drain.
process.exitCode = failures ? 1 : 0;
