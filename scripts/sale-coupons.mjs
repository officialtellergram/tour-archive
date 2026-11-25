/**
 * The sale's cart-tier coupons in Stripe (src/data/sale.js SALE.tiers).
 *
 *   node scripts/sale-coupons.mjs            show which tier coupons exist
 *   node scripts/sale-coupons.mjs --write    make the missing ones
 *
 * One coupon per tier, fixed ids (BF26_15 …), amount off in whole dollars,
 * duration once, good until the day after the sale ends. The Worker applies
 * the tier a cart reaches to its Checkout Session (`discounts[0][coupon]`);
 * if a coupon is missing at that moment the Worker makes it itself, so this
 * script is the tidy way, not the only way. Needs the full key in .env
 * (coupons are outside the restricted key's grant). Never runs git.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SALE } from '../src/data/sale.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WRITE = process.argv.includes('--write');
const C = process.stdout.isTTY ? { red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', dim: '\x1b[2m', off: '\x1b[0m' } : { red: '', yellow: '', green: '', dim: '', off: '' };
const envFile = join(ROOT, '.env');
const env = {
  ...(existsSync(envFile) ? Object.fromEntries(readFileSync(envFile, 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])) : {}),
  ...(process.env.STRIPE_SECRET_KEY ? { STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY } : {}),
};
if (!env.STRIPE_SECRET_KEY) { console.log(`${C.red}✖ STRIPE_SECRET_KEY is needed${C.off}`); process.exit(1); }
if (!/^[sr]k_live_/.test(env.STRIPE_SECRET_KEY)) { console.log(`${C.red}✖ the key is not a live key — the sale runs in the live account${C.off}`); process.exit(1); }
const H = { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' };
async function stripe(method, path, params) {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, { method, headers: H, body: params ? new URLSearchParams(params).toString() : undefined });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || `${r.status}`);
  return j;
}

console.log(`\n${C.dim}── Tour Archive · ${SALE.name} tier coupons (${WRITE ? 'write' : 'check'}) ──${C.off}`);
const redeemBy = Math.floor(Date.parse(SALE.ends) / 1000) + 86400;
let missing = 0;
for (const t of SALE.tiers) {
  let c = null;
  try { c = await stripe('GET', `coupons/${t.coupon}`); } catch { /* not there */ }
  if (c) {
    const ok = c.amount_off === t.off * 100 && c.currency === 'usd' && c.valid;
    console.log(`   ${ok ? C.green + '✔' : C.yellow + '⚠'} ${t.coupon}${C.off}  $${(c.amount_off || 0) / 100} off · ${c.duration} · ${c.valid ? 'valid' : 'NOT VALID'}${ok ? '' : `  (wanted $${t.off} off, usd)`}`);
    continue;
  }
  missing += 1;
  if (!WRITE) { console.log(`   ${C.yellow}· ${t.coupon} missing${C.off}  ($${t.off} off orders of $${t.min}+)`); continue; }
  const made = await stripe('POST', 'coupons', {
    id: t.coupon,
    amount_off: String(t.off * 100),
    currency: 'usd',
    duration: 'once',
    name: `${SALE.name}: $${t.off} off $${t.min}+`,
    redeem_by: String(redeemBy),
    'metadata[ta]': SALE.id,
    'metadata[ta_min]': String(t.min),
  });
  console.log(`   ${C.green}✔ made ${made.id}${C.off}  $${made.amount_off / 100} off · once · until ${new Date(redeemBy * 1000).toISOString().slice(0, 10)}`);
}
console.log(`${C.dim}   ${SALE.tiers.length} tier(s) · ${missing} ${WRITE ? 'made' : 'missing'}${!WRITE && missing ? ' — run again with --write' : ''}${C.off}\n`);
