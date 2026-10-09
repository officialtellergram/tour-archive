/**
 * eBay ↔ manifest sync — the second channel's close-out, both directions.
 *
 *   node scripts/ebay-sync.mjs            report only
 *   node scripts/ebay-sync.mjs --write    apply, writing the manifest after each change
 *
 * Runs inside .github/workflows/stripe-drift.yml next to the Stripe sold
 * sweep and the drift repair, so a Stripe webhook (a site sale, a reprice)
 * and the ten-minute schedule both reach it. Never runs git.
 *
 * What one run does, in order:
 *   1. MAP      GetMyeBaySelling → every active eBay listing by SKU (the CSV's
 *               CustomLabel is the manifest sku, else the id) → _ebay ledger
 *               on the piece: itemId, url, price.
 *   2. SOLD ON  Fulfillment getOrders → a PAID order for a piece's SKU marks
 *      EBAY     the piece sold here, takes its checkout off the record and
 *               deactivates its Stripe link. eBay already ended the listing.
 *   3. SOLD ON  a piece sold or retired here that still has an active eBay
 *      SITE     listing → EndFixedPriceItem (NotAvailable). The double-sell
 *               window closes when the Stripe webhook fires this job.
 *   4. PRICE    a live piece whose eBay price differs from manifest price
 *               (times 1 + EBAY_PRICE_MARKUP, default 0) → ReviseFixedPriceItem.
 *
 * Credentials: EBAY_SYNC_SECRET (shared with the Worker, which holds the real
 * eBay tokens and hands out a two-hour access token); STRIPE_SECRET_KEY for
 * closing a link. Both from the environment or .env.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MANIFEST = join(ROOT, 'public', 'stock', 'manifest.json');
const BROKER = 'https://tour-archive-stripe-hook.officialtellergram.workers.dev/ebay/token';
const TRADING = 'https://api.ebay.com/ws/api.dll';
const FULFILMENT = 'https://api.ebay.com/sell/fulfillment/v1/order';
const C = { red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', dim: '\x1b[2m', off: '\x1b[0m' };
const WRITE = process.argv.includes('--write');

const envFile = join(ROOT, '.env');
const env = {
  ...(existsSync(envFile)
    ? Object.fromEntries(readFileSync(envFile, 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
    : {}),
  ...Object.fromEntries(['EBAY_SYNC_SECRET', 'STRIPE_SECRET_KEY', 'EBAY_PRICE_MARKUP'].filter((k) => process.env[k]).map((k) => [k, process.env[k]])),
};
const MARKUP = Number(env.EBAY_PRICE_MARKUP || 0);
if (!env.EBAY_SYNC_SECRET) {
  console.log(`${C.red}✖ EBAY_SYNC_SECRET missing${C.off}`);
  process.exitCode = 1;
}

/* ---------------- eBay plumbing ---------------- */

async function accessToken() {
  const r = await fetch(BROKER, { headers: { authorization: `Bearer ${env.EBAY_SYNC_SECRET}` } });
  if (!r.ok) throw new Error(`token broker: ${r.status} ${(await r.text()).slice(0, 120)}`);
  return r.json();
}

const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pick = (xml, tag) => {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`));
  return m ? m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"') : '';
};
const blocks = (xml, tag) => xml.split(`<${tag}>`).slice(1).map((b) => b.split(`</${tag}>`)[0]);

/** A Trading API call with the OAuth user token. Returns the response XML; throws on Failure unless `okCodes` covers it. */
async function trading(token, call, body, okCodes = []) {
  const xml = `<?xml version="1.0" encoding="utf-8"?><${call}Request xmlns="urn:ebay:apis:eBLBaseComponents">${body}</${call}Request>`;
  const r = await fetch(TRADING, {
    method: 'POST',
    headers: {
      'X-EBAY-API-IAF-TOKEN': token,
      'X-EBAY-API-CALL-NAME': call,
      'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1225',
      'content-type': 'text/xml',
    },
    body: xml,
  });
  const out = await r.text();
  const ack = pick(out, 'Ack');
  if (ack === 'Failure') {
    const errs = blocks(out, 'Errors').map((e) => ({ code: pick(e, 'ErrorCode'), msg: pick(e, 'LongMessage') || pick(e, 'ShortMessage') }));
    if (!errs.some((e) => okCodes.includes(e.code))) throw new Error(`${call}: ${errs.map((e) => `${e.code} ${e.msg}`).join('; ')}`);
  }
  if (!r.ok && ack !== 'Success' && ack !== 'Warning') throw new Error(`${call}: HTTP ${r.status}`);
  return out;
}

async function activeListings(token) {
  const found = [];
  for (let page = 1; page < 20; page++) {
    const out = await trading(token, 'GetMyeBaySelling',
      `<ActiveList><Include>true</Include><Pagination><EntriesPerPage>200</EntriesPerPage><PageNumber>${page}</PageNumber></Pagination></ActiveList><DetailLevel>ReturnAll</DetailLevel>`);
    const list = out.split('<ActiveList>')[1]?.split('</ActiveList>')[0] || '';
    for (const item of blocks(list, 'Item')) {
      found.push({ itemId: pick(item, 'ItemID'), sku: pick(item, 'SKU'), title: pick(item, 'Title'), price: Number(pick(item, 'CurrentPrice')), url: pick(item, 'ViewItemURL'), qty: Number(pick(item, 'QuantityAvailable') || pick(item, 'Quantity') || 1) });
    }
    const pages = Number(pick(list, 'TotalNumberOfPages') || 1);
    if (page >= pages) break;
  }
  return found;
}

async function paidOrders(token) {
  const orders = [];
  let url = `${FULFILMENT}?limit=200`;
  while (url) {
    const r = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`getOrders: ${r.status} ${(await r.text()).slice(0, 160)}`);
    const j = await r.json();
    orders.push(...(j.orders || []));
    url = j.next || null;
  }
  return orders.filter((o) => ['PAID', 'PARTIALLY_REFUNDED'].includes(o.orderPaymentStatus));
}

async function closeStripeLink(linkId) {
  if (!env.STRIPE_SECRET_KEY || !linkId) return 'no key';
  const r = await fetch(`https://api.stripe.com/v1/payment_links/${linkId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'active=false',
  });
  return r.ok ? 'closed' : `stripe ${r.status}`;
}

/* ---------------- the run ---------------- */

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const save = () => writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
const skuOf = (e) => e.sku || e.id;
const bySku = new Map(manifest.items.map((e) => [skuOf(e), e]));
const ebayPrice = (e) => Math.round(Number(e.price) * (1 + MARKUP) * 100) / 100;

console.log(`\n${C.dim}── Tour Archive · eBay sync (${WRITE ? 'WRITE' : 'report'}${MARKUP ? ` · markup ${Math.round(MARKUP * 100)}%` : ''}) ──${C.off}`);
let changes = 0;
let failures = 0;
try {
  const tok = await accessToken();
  const token = tok.access_token;
  const daysLeft = Math.round((tok.refresh_expires_at - Date.now()) / 86400000);
  if (daysLeft < 30) console.log(`${C.yellow}   ⚠ eBay consent expires in ${daysLeft} day(s) — the account holder must sign in again at /ebay/oauth/start${C.off}`);

  // 1. map
  const listings = await activeListings(token);
  let matched = 0;
  for (const l of listings) {
    const e = bySku.get(l.sku);
    if (!e) continue;
    matched += 1;
    const led = e._ebay || {};
    if (led.itemId !== l.itemId || led.price !== l.price || !e._ebayUrl) {
      e._ebay = { ...led, itemId: l.itemId, sku: l.sku, price: l.price, seen: new Date().toISOString().slice(0, 10) };
      delete e._ebay.endedAt;
      if (l.url) e._ebayUrl = l.url;
      if (WRITE) save();
    }
  }
  console.log(`${C.dim}   ${listings.length} active eBay listing(s) · ${matched} matched to the catalogue · ${listings.length - matched} unknown SKU(s)${C.off}`);
  for (const l of listings.filter((x) => !bySku.has(x.sku))) console.log(`${C.yellow}   ⚠ eBay ${l.itemId} "${l.title.slice(0, 50)}" SKU "${l.sku}" is not in the catalogue${C.off}`);
  const activeIds = new Set(listings.map((l) => l.itemId));

  // 2. sold on eBay
  const orders = await paidOrders(token);
  for (const o of orders) {
    for (const li of o.lineItems || []) {
      const e = bySku.get(li.sku);
      if (!e || e.sold) continue;
      console.log(`${C.green}   ✔ ${e.id} — SOLD on eBay (order ${o.orderId}, ${o.creationDate.slice(0, 10)})${C.off}`);
      if (!WRITE) continue;
      e.sold = true;
      delete e.channel;
      delete e.listingUrl;
      e._ebay = { ...(e._ebay || {}), soldOrder: o.orderId, soldAt: o.creationDate.slice(0, 10) };
      save();
      changes += 1;
      if (e._stripe?.link) console.log(`${C.dim}       stripe link ${await closeStripeLink(e._stripe.link)}${C.off}`);
    }
  }

  // 3. sold or retired here, still live on eBay
  for (const e of manifest.items) {
    const id = e._ebay?.itemId;
    if (!id || !(e.sold || e.retired) || e._ebay.soldOrder || !activeIds.has(id)) continue;
    console.log(`${C.yellow}   ⚠ ${e.id} is ${e.sold ? 'sold' : 'retired'} here but still listed on eBay (${id})${C.off}`);
    if (!WRITE) continue;
    try {
      // 1047 = already ended: the goal state, not a failure
      await trading(token, 'EndFixedPriceItem', `<ItemID>${xmlEsc(id)}</ItemID><EndingReason>NotAvailable</EndingReason>`, ['1047']);
      e._ebay.endedAt = new Date().toISOString().slice(0, 10);
      save();
      changes += 1;
      console.log(`${C.green}       ✔ eBay listing ended${C.off}`);
    } catch (err) {
      failures += 1;
      console.log(`${C.red}       ✖ ${err.message}${C.off}`);
    }
  }

  // 4. price
  for (const e of manifest.items) {
    const id = e._ebay?.itemId;
    if (!id || e.sold || e.retired || !activeIds.has(id)) continue;
    const want = ebayPrice(e);
    if (Math.abs(want - e._ebay.price) < 0.005) continue;
    console.log(`${C.yellow}   ⚠ ${e.id} — eBay $${e._ebay.price.toFixed(2)}, should be $${want.toFixed(2)}${C.off}`);
    if (!WRITE) continue;
    try {
      await trading(token, 'ReviseFixedPriceItem', `<Item><ItemID>${xmlEsc(id)}</ItemID><StartPrice>${want.toFixed(2)}</StartPrice></Item>`);
      e._ebay.price = want;
      save();
      changes += 1;
      console.log(`${C.green}       ✔ eBay price revised${C.off}`);
    } catch (err) {
      failures += 1;
      console.log(`${C.red}       ✖ ${err.message}${C.off}`);
    }
  }
} catch (err) {
  failures += 1;
  console.log(`${C.red}✖ ${err.message}${C.off}`);
}

console.log(`${C.dim}   ${changes} change(s) · ${failures} failure(s)${C.off}`);
process.exitCode = failures ? 1 : 0;
