/**
 * The welcome discount's two fixtures in Stripe, and a view of the codes.
 *
 *   node scripts/promo-setup.mjs           make the WELCOME10 coupon if it is
 *                                          missing; let every live payment
 *                                          link accept promotion codes
 *   node scripts/promo-setup.mjs --codes   list the codes minted so far, who
 *                                          they went to, and which were used
 *
 * WELCOME10 is 10% off, once. Each subscriber gets their own promotion code
 * on it (scripts/welcome-mail.mjs): one redemption, first purchase only,
 * thirty days. New links are minted accepting codes (stripe-mint.mjs,
 * stripe-drift.mjs); this flips the ones minted before. Needs the full key
 * in .env (coupons are not in the restricted key's grant). Never runs git.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CODES = process.argv.includes('--codes');
const C = process.stdout.isTTY ? { red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', dim: '\x1b[2m', off: '\x1b[0m' } : { red: '', yellow: '', green: '', dim: '', off: '' };
const envFile = join(ROOT, '.env');
const env = {
  ...(existsSync(envFile) ? Object.fromEntries(readFileSync(envFile, 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])) : {}),
  ...(process.env.STRIPE_SECRET_KEY ? { STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY } : {}),
};
if (!env.STRIPE_SECRET_KEY) { console.log(`${C.red}✖ STRIPE_SECRET_KEY is needed${C.off}`); process.exit(1); }
const H = { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' };
async function stripe(method, path, params) {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, { method, headers: H, body: params ? new URLSearchParams(params).toString() : undefined });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || `${r.status}`);
  return j;
}
async function all(path) {
  const out = [];
  let after = '';
  for (;;) {
    const page = await stripe('GET', `${path}${path.includes('?') ? '&' : '?'}limit=100${after ? `&starting_after=${after}` : ''}`);
    out.push(...page.data);
    if (!page.has_more || !page.data.length) break;
    after = page.data[page.data.length - 1].id;
  }
  return out;
}

console.log(`\n${C.dim}── Tour Archive · welcome discount (${CODES ? 'codes' : 'setup'}) ──${C.off}`);
if (CODES) {
  const codes = await all('promotion_codes?coupon=WELCOME10');
  for (const p of codes.sort((a, b) => a.created - b.created)) {
    const exp = p.expires_at ? new Date(p.expires_at * 1000).toISOString().slice(0, 10) : '';
    const state = p.times_redeemed ? `${C.green}USED${C.off}` : !p.active || (p.expires_at && p.expires_at * 1000 < Date.now()) ? `${C.dim}expired${C.off}` : 'open';
    console.log(`   ${p.code.padEnd(14)} ${(p.metadata?.email || '').padEnd(34)} until ${exp}  ${state}`);
  }
  console.log(`${C.dim}   ${codes.length} code(s) · ${codes.filter((p) => p.times_redeemed).length} used${C.off}`);
} else {
  let coupon;
  try { coupon = await stripe('GET', 'coupons/WELCOME10'); console.log(`${C.dim}   coupon WELCOME10 exists: ${coupon.percent_off}% off, ${coupon.duration}${C.off}`); } catch {
    coupon = await stripe('POST', 'coupons', { id: 'WELCOME10', percent_off: '10', duration: 'once', name: 'Welcome 10%', 'metadata[ta]': 'welcome' });
    console.log(`${C.green}   ✔ coupon WELCOME10 made: 10% off, once${C.off}`);
  }
  const links = await all('payment_links?active=true');
  const todo = links.filter((l) => !l.allow_promotion_codes);
  let done = 0;
  for (const l of todo) {
    try { await stripe('POST', `payment_links/${l.id}`, { allow_promotion_codes: 'true' }); done += 1; } catch (err) { console.log(`${C.red}   ✖ ${l.id}: ${err.message}${C.off}`); }
  }
  console.log(`${C.dim}   ${links.length} live link(s) · ${links.length - todo.length} already accepted codes · ${done} switched on${C.off}`);
}
