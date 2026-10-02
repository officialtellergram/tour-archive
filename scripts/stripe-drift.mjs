/**
 * Price drift between Stripe and the manifest, and the repair.
 *
 *   node scripts/stripe-drift.mjs                 report only (read-only)
 *   node scripts/stripe-drift.mjs --write --live  repair, then write the manifest
 *
 * WHY THIS EXISTS. A Stripe Price is immutable. "Changing the price" in the
 * Dashboard creates a NEW price, makes it the product's default and archives
 * the old one — and a Payment Link is bound to the price it was minted with.
 * A link whose price is archived refuses checkout. So a price edit in the
 * Dashboard silently breaks the buy button of that piece until its link is
 * re-pointed. (1 Oct 2026: Henry repriced pieces; their links died.)
 *
 * WHAT A REPAIR DOES, per drifted piece:
 *   1. takes the product's current default price (one-time, USD, active) as
 *      the truth — Stripe is where the price was changed, deliberately;
 *   2. mints a new Payment Link on that price with the same contract as
 *      stripe-mint.mjs (one completed session, the flat shipping rate, US
 *      addresses, the terms consent, the confirmation message), copied from
 *      the old link so nothing is re-typed here;
 *   3. deactivates the old link;
 *   4. writes price, listingUrl and the _stripe ledger back to the manifest,
 *      after EACH piece, so a failure midway loses nothing.
 * It never touches a sold piece, never runs git, and refuses a test key
 * unless --test is passed.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MANIFEST = join(ROOT, 'public', 'stock', 'manifest.json');
const C = { red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', dim: '\x1b[2m', off: '\x1b[0m' };
const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const LIVE = args.includes('--live');
const TEST = args.includes('--test');

// Locally the key lives in .env; in the scheduled job it arrives as an
// environment variable (a repository secret) and there is no .env at all.
const envPath = join(ROOT, '.env');
const env = {
  ...(existsSync(envPath)
    ? Object.fromEntries(
        readFileSync(envPath, 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#'))
          .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
      )
    : {}),
  ...(process.env.STRIPE_SECRET_KEY ? { STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY } : {}),
};
const KEY = TEST ? env.STRIPE_TEST_SECRET_KEY : env.STRIPE_SECRET_KEY;
if (!KEY) throw new Error('no Stripe key in .env');
const liveKey = /^(sk|rk)_live_/.test(KEY);
if (WRITE && liveKey && !LIVE) throw new Error('a live key needs --live to write');

async function stripe(method, path, body) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body: body ? new URLSearchParams(body).toString() : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path}: ${json.error?.message || res.status}`);
  return json;
}
const money = (cents) => (cents / 100).toFixed(2);

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const pieces = manifest.items.filter((e) => e._stripe?.product && e._stripe?.link && !e.sold && !e.retired);

console.log(`\n${C.dim}── Tour Archive · stripe drift (${liveKey ? 'live' : 'test'}, ${WRITE ? 'WRITE' : 'report'}) ──${C.off}`);
console.log(`${C.dim}   ${pieces.length} live piece(s) with a minted link${C.off}`);

let ok = 0, drifted = 0, repaired = 0, failed = 0;
for (const e of pieces) {
  try {
    const [product, link] = await Promise.all([
      stripe('GET', `products/${e._stripe.product}?expand[]=default_price`),
      stripe('GET', `payment_links/${e._stripe.link}?expand[]=line_items`),
    ]);
    const linkPrice = link.line_items?.data?.[0]?.price;
    // The truth is the product's default price. Products minted by script
    // have none set, so fall back to the ONE active one-time USD price; two
    // or more active prices is ambiguous and is left for a person.
    let want = product.default_price?.active ? product.default_price : null;
    let ambiguous = false;
    if (!want) {
      const list = await stripe('GET', `prices?product=${e._stripe.product}&active=true&limit=10`);
      const usable = list.data.filter((p) => p.type === 'one_time' && p.currency === 'usd');
      if (usable.length === 1) want = usable[0];
      else ambiguous = usable.length > 1;
    }
    const problems = [];
    if (!product.active) problems.push('product archived in Stripe');
    if (!link.active) problems.push('link inactive');
    if (linkPrice && !linkPrice.active) problems.push(`link price ${linkPrice.id} archived ($${money(linkPrice.unit_amount)})`);
    if (want && linkPrice && want.id !== linkPrice.id) problems.push(`default price is now ${want.id} ($${money(want.unit_amount)})`);
    if (want && Number(e.price) !== want.unit_amount / 100) problems.push(`site shows $${e.price}`);
    if (!problems.length) { ok += 1; continue; }

    drifted += 1;
    console.log(`${C.yellow}   ⚠ ${e.id}${C.off}${C.dim} — ${problems.join('; ')}${C.off}`);
    if (!product.active) { console.log(`${C.dim}       product is archived: not repairing — decide whether the piece is retired${C.off}`); continue; }
    if (!want || !want.active || want.type !== 'one_time' || want.currency !== 'usd') {
      console.log(`${C.red}       ${ambiguous ? 'several active prices and no default — set the default price in Stripe' : 'no active one-time USD price — add one in Stripe'}${C.off}`);
      failed += 1;
      continue;
    }
    if (!WRITE) continue;

    // Same contract as the old link, on the new price.
    const body = {
      'line_items[0][price]': want.id,
      'line_items[0][quantity]': '1',
      'restrictions[completed_sessions][limit]': '1',
      'metadata[ta_id]': e.id,
      'metadata[ta_repriced_from]': link.id,
    };
    (link.shipping_options || []).forEach((o, i) => { body[`shipping_options[${i}][shipping_rate]`] = typeof o.shipping_rate === 'string' ? o.shipping_rate : o.shipping_rate.id; });
    (link.shipping_address_collection?.allowed_countries || []).forEach((c, i) => { body[`shipping_address_collection[allowed_countries][${i}]`] = c; });
    if (link.consent_collection?.terms_of_service) body['consent_collection[terms_of_service]'] = link.consent_collection.terms_of_service;
    for (const k of ['terms_of_service_acceptance', 'submit', 'shipping_address', 'after_submit']) {
      const m = link.custom_text?.[k]?.message;
      if (m) body[`custom_text[${k}][message]`] = m;
    }
    if (link.after_completion?.type === 'hosted_confirmation') {
      body['after_completion[type]'] = 'hosted_confirmation';
      const m = link.after_completion.hosted_confirmation?.custom_message;
      if (m) body['after_completion[hosted_confirmation][custom_message]'] = m;
    } else if (link.after_completion?.type === 'redirect') {
      body['after_completion[type]'] = 'redirect';
      body['after_completion[redirect][url]'] = link.after_completion.redirect.url;
    }
    if (link.billing_address_collection) body.billing_address_collection = link.billing_address_collection;
    if (link.phone_number_collection?.enabled) body['phone_number_collection[enabled]'] = 'true';

    const fresh = await stripe('POST', 'payment_links', body);
    if (link.active) await stripe('POST', `payment_links/${link.id}`, { active: 'false' });
    // Pin the default, so the Dashboard, the next drift report and the site agree.
    if (product.default_price?.id !== want.id) await stripe('POST', `products/${product.id}`, { default_price: want.id });

    e.price = want.unit_amount / 100;
    e.listingUrl = fresh.url;
    e._stripe = { ...e._stripe, price: want.id, link: fresh.id, repriced: new Date().toISOString().slice(0, 10) };
    writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    repaired += 1;
    console.log(`${C.green}       ✔ $${money(want.unit_amount)} → ${fresh.url}${C.off}`);
  } catch (err) {
    failed += 1;
    console.log(`${C.red}   ✖ ${e.id}: ${err.message}${C.off}`);
  }
}

console.log(`\n${C.dim}   ${ok} in step · ${drifted} drifted · ${repaired} repaired · ${failed} failed${C.off}`);
if (drifted && !WRITE) console.log(`${C.dim}   repair: node scripts/stripe-drift.mjs --write --live  (then npm run check, build, push)${C.off}`);
process.exitCode = failed ? 1 : 0;
