/**
 * eBay ↔ manifest sync — the second channel, listing and close-out.
 *
 *   node scripts/ebay-sync.mjs            report only (listings are VERIFIED with eBay, not created)
 *   node scripts/ebay-sync.mjs --write    apply, writing the manifest after each change
 *
 * Runs inside .github/workflows/stripe-drift.yml next to the Stripe sold
 * sweep and the drift repair, so a Stripe webhook (a site sale, a reprice)
 * and the ten-minute schedule both reach it. Never runs git.
 *
 * One run, in order:
 *   1. MAP        GetMyeBaySelling → every active eBay listing by SKU (the
 *                 manifest sku, else the id) → _ebay ledger: itemId, url, price.
 *                 Two active listings for one SKU: the ledger's (else the
 *                 older) stays, the rest are ended. A ledgered listing missing
 *                 from the answer is checked with GetItem; if eBay says it is
 *                 still active, the answer was short and step 5 is skipped.
 *                 (11 Oct 2026: one empty answer produced twelve duplicates.)
 *   2. SOLD ON    Fulfillment getOrders → a PAID order for a piece's SKU marks
 *      EBAY       it sold here, removes its checkout, deactivates its Stripe link.
 *   3. SOLD HERE  a piece sold or retired here still live on eBay → EndFixedPriceItem.
 *   4. PRICE      eBay price ≠ ebayPrice(site price) → ReviseFixedPriceItem.
 *                 ebayPrice: (P + A) / 0.864, up to the next .99, where A is
 *                 $0.40 when P is over $10, else $0.30 (Karen + Shep, 14 Oct 2026).
 *   5. LIST       a live piece with no eBay listing, past its drop hold, not
 *                 marked _ebay.skip → AddFixedPriceItem (VerifyAddFixedPriceItem
 *                 in report mode). At most LIST_PER_RUN per run. A piece whose
 *                 ledgered listing eBay confirmed ended without a sale counts
 *                 as having none; anything else ledgered is never listed again.
 *
 * Drop hold: a piece in a collection with an event gets listed only
 * EBAY_DROP_DELAY_DAYS (default 14) after the drop opens; general stock lists
 * at once. Listing content is scripts/lib/ebay-listing.mjs, shared with the
 * CSV, and the account has no business policies, so shipping and returns go
 * on each listing explicitly.
 *
 * Credentials: EBAY_SYNC_SECRET (the Worker's token broker holds the real
 * eBay tokens), STRIPE_SECRET_KEY (closing a link). Environment or .env.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ORIGIN, PICTURE_SET, TERMS, categoryOf, conditionId, conditionNote, descriptionOf, listable, picturesOf, skuOf, specificsOf, titleOf } from './lib/ebay-listing.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MANIFEST = join(ROOT, 'public', 'stock', 'manifest.json');
const BROKER = 'https://tour-archive-stripe-hook.officialtellergram.workers.dev/ebay/token';
const TRADING = 'https://api.ebay.com/ws/api.dll';
const FULFILMENT = 'https://api.ebay.com/sell/fulfillment/v1/order';
const C = { red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', dim: '\x1b[2m', off: '\x1b[0m' };
const WRITE = process.argv.includes('--write');
const LIST_PER_RUN = 12;

const envFile = join(ROOT, '.env');
const env = {
  ...(existsSync(envFile)
    ? Object.fromEntries(readFileSync(envFile, 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
    : {}),
  ...Object.fromEntries(['EBAY_SYNC_SECRET', 'STRIPE_SECRET_KEY', 'EBAY_DROP_DELAY_DAYS'].filter((k) => process.env[k]).map((k) => [k, process.env[k]])),
};
const DROP_DELAY_DAYS = Number(env.EBAY_DROP_DELAY_DAYS || 14);
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

const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pick = (xml, tag) => {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`));
  return m ? m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"') : '';
};
const blocks = (xml, tag) => xml.split(`<${tag}>`).slice(1).map((b) => b.split(`</${tag}>`)[0]);

/** A Trading API call with the OAuth user token. Returns the XML; throws on Failure unless `okCodes` covers every error. */
async function trading(token, call, body, okCodes = []) {
  const xml = `<?xml version="1.0" encoding="utf-8"?><${call}Request xmlns="urn:ebay:apis:eBLBaseComponents">${body}</${call}Request>`;
  const r = await fetch(TRADING, {
    method: 'POST',
    headers: { 'X-EBAY-API-IAF-TOKEN': token, 'X-EBAY-API-CALL-NAME': call, 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-COMPATIBILITY-LEVEL': '1225', 'content-type': 'text/xml' },
    body: xml,
  });
  const out = await r.text();
  const ack = pick(out, 'Ack');
  const errs = blocks(out, 'Errors').map((e) => ({ code: pick(e, 'ErrorCode'), severity: pick(e, 'SeverityCode'), msg: pick(e, 'LongMessage') || pick(e, 'ShortMessage') }));
  if (ack === 'Failure' && !errs.filter((e) => e.severity === 'Error').every((e) => okCodes.includes(e.code))) {
    throw new Error(`${call}: ${errs.filter((e) => e.severity === 'Error').map((e) => `${e.code} ${e.msg}`).join('; ')}`);
  }
  if (!r.ok && ack !== 'Success' && ack !== 'Warning') throw new Error(`${call}: HTTP ${r.status}`);
  return { xml: out, warnings: errs.filter((e) => e.severity === 'Warning').map((e) => e.msg) };
}

async function activeListings(token) {
  const found = [];
  for (let page = 1; page < 20; page++) {
    const { xml } = await trading(token, 'GetMyeBaySelling',
      `<ActiveList><Include>true</Include><Pagination><EntriesPerPage>200</EntriesPerPage><PageNumber>${page}</PageNumber></Pagination></ActiveList><DetailLevel>ReturnAll</DetailLevel>`);
    const list = xml.split('<ActiveList>')[1]?.split('</ActiveList>')[0] || '';
    for (const item of blocks(list, 'Item')) {
      found.push({ itemId: pick(item, 'ItemID'), sku: pick(item, 'SKU'), title: pick(item, 'Title'), price: Number(pick(item, 'CurrentPrice')), url: pick(item, 'ViewItemURL'), start: pick(item, 'StartTime') });
    }
    if (page >= Number(pick(list, 'TotalNumberOfPages') || 1)) break;
  }
  return found;
}

async function allOrdersOf(token) {
  const orders = [];
  let url = `${FULFILMENT}?limit=200`;
  while (url) {
    const r = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`getOrders: ${r.status} ${(await r.text()).slice(0, 160)}`);
    const j = await r.json();
    orders.push(...(j.orders || []));
    url = j.next || null;
  }
  return orders;
}

async function stripeLink(linkId, active) {
  if (!env.STRIPE_SECRET_KEY || !linkId) return { error: 'no key' };
  const r = await fetch(`https://api.stripe.com/v1/payment_links/${linkId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `active=${active}`,
  });
  const j = await r.json().catch(() => ({}));
  return r.ok ? { url: j.url } : { error: `stripe ${r.status} ${j.error?.message || ''}`.trim() };
}
const closeStripeLink = async (id) => { const r = await stripeLink(id, 'false'); return r.url ? 'closed' : r.error; };
const reopenStripeLink = (id) => stripeLink(id, 'true');

/** The AddFixedPriceItem / VerifyAddFixedPriceItem body for a piece. */
function listingXml(e, price) {
  const specifics = Object.entries(specificsOf(e))
    .map(([n, v]) => `<NameValueList><Name>${xmlEsc(n)}</Name><Value>${xmlEsc(v)}</Value></NameValueList>`).join('');
  const pics = picturesOf(e).map((u) => `<PictureURL>${xmlEsc(u)}</PictureURL>`).join('');
  const note = conditionNote(e);
  return `<Item>
    <Title>${xmlEsc(titleOf(e))}</Title>
    <Description><![CDATA[${descriptionOf(e)}]]></Description>
    <PrimaryCategory><CategoryID>${categoryOf(e)}</CategoryID></PrimaryCategory>
    <StartPrice>${price.toFixed(2)}</StartPrice>
    <ConditionID>${conditionId(e)}</ConditionID>${note ? `<ConditionDescription>${xmlEsc(note)}</ConditionDescription>` : ''}
    <Country>${TERMS.country}</Country><Currency>${TERMS.currency}</Currency>
    <DispatchTimeMax>${TERMS.handlingDays}</DispatchTimeMax>
    <ListingDuration>GTC</ListingDuration><ListingType>FixedPriceItem</ListingType>
    <Location>${xmlEsc(TERMS.location)}</Location>
    <PictureDetails>${pics}</PictureDetails>
    <Quantity>1</Quantity>
    <SKU>${xmlEsc(skuOf(e))}</SKU>
    <ItemSpecifics>${specifics}</ItemSpecifics>
    <ReturnPolicy><ReturnsAcceptedOption>ReturnsAccepted</ReturnsAcceptedOption><ReturnsWithinOption>Days_${TERMS.returnDays}</ReturnsWithinOption><ShippingCostPaidByOption>Buyer</ShippingCostPaidByOption><RefundOption>MoneyBack</RefundOption></ReturnPolicy>
    <ShippingDetails><ShippingType>Flat</ShippingType><ShippingServiceOptions><ShippingServicePriority>1</ShippingServicePriority><ShippingService>${TERMS.shippingService}</ShippingService><ShippingServiceCost>${TERMS.shipping}</ShippingServiceCost></ShippingServiceOptions></ShippingDetails>
  </Item>`;
}

/* ---------------- drop hold ---------------- */

const { events } = await import('../src/data/events.js').catch(() => ({ events: [] }));
const { collections } = await import('../src/data/collections.js').catch(() => ({ collections: [] }));
const eventList = Array.isArray(events) ? events : Object.values(events || {});
const collList = Array.isArray(collections) ? collections : Object.values(collections || {});

/** The date a piece may go to eBay: drop opens + the delay, or now. */
function listableFrom(e) {
  const coll = collList.find((c) => c.id === e.collection);
  const ev = coll && eventList.find((x) => x.id === (coll.event || coll.id) || x.collection === coll.id);
  if (!ev?.dropOpens) return null;
  const d = new Date(ev.dropOpens + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + DROP_DELAY_DAYS);
  return d;
}

/* ---------------- the run ---------------- */

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const save = () => writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
const bySku = new Map(manifest.items.map((e) => [skuOf(e), e]));
/**
 * The eBay price from the site price (Karen and Shep, 14 Oct 2026):
 *   E = (P + A) / 0.864, rounded UP to the next .99
 *   A = $0.40 when P is more than $10, else $0.30 (eBay's fixed per-order fee)
 *   0.864 = what is left after eBay's 13.6 % final value fee
 * e.g. P 24.99 → 29.39 → 29.99 · P 9.00 → 10.76 → 10.99 · P 14.00 → 16.67 → 16.99
 * Worked in cents so 0.1 + 0.2 never bites.
 */
export const ebayPrice = (e) => {
  const p = Math.round(Number(e.price) * 100);
  const a = p > 1000 ? 40 : 30;
  const raw = Math.ceil((p + a) / 0.864);
  let dollars = Math.floor(raw / 100);
  if (dollars * 100 + 99 < raw) dollars += 1; // above x.99 already → next x.99
  return (dollars * 100 + 99) / 100;
};
const today = new Date().toISOString().slice(0, 10);

console.log(`\n${C.dim}── Tour Archive · eBay sync (${WRITE ? 'WRITE' : 'report'} · price (P + fee) ÷ 0.864 → .99 · drops held ${DROP_DELAY_DAYS} d) ──${C.off}`);
let changes = 0;
let failures = 0;
try {
  const tok = await accessToken();
  const token = tok.access_token;
  const daysLeft = Math.round((tok.refresh_expires_at - Date.now()) / 86400000);
  if (daysLeft < 30) console.log(`${C.yellow}   ⚠ eBay consent expires in ${daysLeft} day(s) — the account holder must sign in again at /ebay/oauth/start${C.off}`);

  // 1. map
  let listings = await activeListings(token);
  // Twins: two active listings for one piece can only come from a listing
  // made twice (11 Oct 2026: eBay once answered the active list with zero
  // rows and twelve pieces were listed again). The ledger's listing stays —
  // failing that, the older one — and the rest are ended here and now.
  const twins = new Map();
  for (const l of listings) if (l.sku) twins.set(l.sku, [...(twins.get(l.sku) || []), l]);
  for (const [sku, arr] of twins) {
    if (arr.length < 2) continue;
    const e = bySku.get(sku);
    const keep = arr.find((l) => l.itemId === e?._ebay?.itemId) || [...arr].sort((a, b) => a.start.localeCompare(b.start))[0];
    for (const d of arr.filter((l) => l !== keep)) {
      console.log(`${C.yellow}   ⚠ ${sku}: listed twice — ${WRITE ? 'ending' : 'would end'} ${d.itemId} (${d.start.slice(0, 10)}), keeping ${keep.itemId}${C.off}`);
      if (!WRITE) continue;
      try {
        await trading(token, 'EndFixedPriceItem', `<ItemID>${xmlEsc(d.itemId)}</ItemID><EndingReason>NotAvailable</EndingReason>`, ['1047']);
        listings = listings.filter((l) => l !== d);
        if (e?._ebay) e._ebay.duplicateEnded = [...(e._ebay.duplicateEnded || []), d.itemId];
      } catch (err) {
        console.log(`${C.red}   ✖ ${sku}: could not end the twin ${d.itemId}: ${err.message}${C.off}`);
        failures += 1;
      }
    }
  }
  const activeIds = new Set(listings.map((l) => l.itemId));
  let matched = 0;
  for (const l of listings) {
    const e = bySku.get(l.sku);
    if (!e) continue;
    matched += 1;
    const led = e._ebay || {};
    if (led.itemId !== l.itemId || led.price !== l.price || !e._ebayUrl) {
      e._ebay = { ...led, itemId: l.itemId, sku: l.sku, price: l.price, seen: today };
      delete e._ebay.endedAt;
      if (l.url) e._ebayUrl = l.url;
      if (WRITE) save();
    }
  }
  console.log(`${C.dim}   ${listings.length} active eBay listing(s) · ${matched} matched to the catalogue · ${listings.length - matched} unknown SKU(s)${C.off}`);
  // Trust check. The ledger remembers every live piece's listing; a ledgered
  // listing missing from eBay's answer is asked about by itself (GetItem).
  // Only one eBay confirms ended without a sale may be listed again. If eBay
  // says it is still active, the active list was short and nothing new is
  // listed this run — a short answer must never read as "nothing is listed".
  const endedUnsold = new Set();
  let mapSuspect = false;
  for (const e of manifest.items.filter((x) => x._ebay?.itemId && !x.sold && !x.retired && !activeIds.has(x._ebay.itemId))) {
    const id = e._ebay.itemId;
    let status = 'unknown';
    let sold = 0;
    try {
      const { xml } = await trading(token, 'GetItem', `<ItemID>${xmlEsc(id)}</ItemID><OutputSelector>Item.SellingStatus.ListingStatus</OutputSelector><OutputSelector>Item.SellingStatus.QuantitySold</OutputSelector>`);
      status = pick(xml, 'ListingStatus') || 'unknown';
      sold = Number(pick(xml, 'QuantitySold') || 0);
    } catch (err) {
      mapSuspect = true;
      console.log(`${C.yellow}   ⚠ ${e.id}: listing ${id} is not in the active list and GetItem failed (${err.message.slice(0, 90)})${C.off}`);
      continue;
    }
    if (status === 'Active') {
      mapSuspect = true;
      console.log(`${C.yellow}   ⚠ ${e.id}: listing ${id} is active on eBay but missing from the active list${C.off}`);
      continue;
    }
    if (status !== 'Completed' && status !== 'Ended') {
      console.log(`${C.yellow}   ⚠ ${e.id}: listing ${id} is "${status}" on eBay; left alone${C.off}`);
      continue;
    }
    if (sold > 0 && !e._ebay.cancelledOrder) {
      console.log(`${C.yellow}   ⚠ ${e.id}: listing ${id} ended with a sale the order sweep has not recorded; left alone${C.off}`);
      continue;
    }
    endedUnsold.add(id);
    console.log(`${C.dim}   · ${e.id}: listing ${id} ended on eBay without a sale; may be listed again${C.off}`);
  }
  if (mapSuspect) console.log(`${C.yellow}   ⚠ eBay's active list looks incomplete (${listings.length} rows); no listing will be created this run${C.off}`);
  for (const l of listings.filter((x) => !bySku.has(x.sku))) console.log(`${C.yellow}   ⚠ eBay ${l.itemId} "${l.title.slice(0, 50)}" SKU "${l.sku}" is not in the catalogue${C.off}`);

  // 2. sold on eBay — and cancelled on eBay. An order cancelled after the
  //    sync marked its piece sold (buyer's request, approved in Seller Hub,
  //    piece relisted) is reversed: the piece is for sale again here, its
  //    Stripe link reactivated, and it may be announced again if it sells.
  const allOrders = await allOrdersOf(token);
  for (const o of allOrders.filter((x) => x.cancelStatus?.cancelState === 'CANCELED' || x.orderPaymentStatus === 'FULLY_REFUNDED')) {
    for (const li of o.lineItems || []) {
      const e = bySku.get(li.sku);
      if (!e || !e.sold || e._ebay?.soldOrder !== o.orderId) continue;
      console.log(`${C.yellow}   ↺ ${e.id} — eBay order ${o.orderId} was CANCELLED (${o.cancelStatus?.cancelRequests?.[0]?.cancelReason || o.orderPaymentStatus}); for sale again${C.off}`);
      if (!WRITE) continue;
      e.sold = false;
      e._ebay = { ...e._ebay, cancelledOrder: o.orderId, cancelledAt: today };
      delete e._ebay.soldOrder;
      delete e._ebay.soldAt;
      delete e._saleNotified;
      if (e._stripe?.link) {
        const r = await reopenStripeLink(e._stripe.link);
        if (r.url) {
          e.channel = 'stripe';
          e.listingUrl = r.url;
        }
        console.log(`${C.dim}       stripe link ${r.url ? 'reactivated' : r.error}${C.off}`);
      }
      save();
      changes += 1;
    }
  }
  for (const o of allOrders.filter((x) => ['PAID', 'PARTIALLY_REFUNDED'].includes(x.orderPaymentStatus) && x.cancelStatus?.cancelState !== 'CANCELED')) {
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
      await trading(token, 'EndFixedPriceItem', `<ItemID>${xmlEsc(id)}</ItemID><EndingReason>NotAvailable</EndingReason>`, ['1047']); // 1047: already ended
      e._ebay.endedAt = today;
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

  // 5. list what is not on eBay yet — only once EBAY_LISTING_ENABLED is "true"
  //    (a repository variable; the kill switch). Report mode still verifies.
  const LISTING_ON = String(env.EBAY_LISTING_ENABLED || process.env.EBAY_LISTING_ENABLED || '').toLowerCase() === 'true';
  if (WRITE && !LISTING_ON) console.log(`${C.dim}   · listing by API is switched off (EBAY_LISTING_ENABLED is not "true"); nothing will be created${C.off}`);
  let listed = 0;
  const held = [];
  for (const e of manifest.items) {
    if (WRITE && !LISTING_ON) break;
    if (mapSuspect) break;
    if (e._ebay?.itemId && activeIds.has(e._ebay.itemId)) continue;
    if (e._ebay?.skip) continue;
    if (e._ebay?.itemId && !e.sold && !e.retired && !endedUnsold.has(e._ebay.itemId)) continue;
    const ok = listable(e);
    if (!ok.ok) {
      if (ok.why !== 'not for sale') console.log(`${C.dim}   · ${e.id}: not listed — ${ok.why}${C.off}`);
      continue;
    }
    const from = listableFrom(e);
    if (from && from > new Date()) {
      held.push(`${e.id} until ${from.toISOString().slice(0, 10)}`);
      continue;
    }
    if (WRITE && listed >= LIST_PER_RUN) {
      console.log(`${C.dim}   · ${e.id}: next run (${LIST_PER_RUN} per run)${C.off}`);
      continue;
    }
    const price = ebayPrice(e);
    const call = WRITE ? 'AddFixedPriceItem' : 'VerifyAddFixedPriceItem';
    if (WRITE) {
      // eBay fetches the pictures as it lists; a new piece's photographs are
      // public only once the site has deployed, so it waits for its first.
      const first = await fetch(picturesOf(e)[0], { method: 'HEAD' }).catch(() => null);
      if (!first?.ok) {
        console.log(`${C.dim}   · ${e.id}: pictures not published yet, next run${C.off}`);
        continue;
      }
    }
    try {
      const { xml, warnings } = await trading(token, call, listingXml(e, price));
      listed += 1;
      const fees = blocks(xml, 'Fee').map((f) => [pick(f, 'Name'), Number(pick(f, 'Fee'))]).filter(([, v]) => v > 0);
      const feeNote = fees.length ? ` · fees ${fees.map(([n, v]) => `${n} $${v.toFixed(2)}`).join(', ')}` : '';
      if (WRITE) {
        const itemId = pick(xml, 'ItemID');
        e._ebay = { ...(e._ebay || {}), itemId, sku: skuOf(e), price, listedAt: today };
        e._ebayUrl = `https://www.ebay.com/itm/${itemId}`;
        save();
        changes += 1;
        console.log(`${C.green}   ✔ ${e.id} — listed on eBay as ${itemId} at $${price.toFixed(2)}${feeNote}${C.off}`);
      } else {
        console.log(`${C.green}   ✔ ${e.id} — would list at $${price.toFixed(2)} (verified by eBay)${feeNote}${C.off}`);
      }
      for (const w of warnings) console.log(`${C.dim}       warning: ${w}${C.off}`);
    } catch (err) {
      failures += 1;
      console.log(`${C.red}   ✖ ${e.id} — ${err.message}${C.off}`);
    }
  }
  if (held.length) console.log(`${C.dim}   · drop hold (${DROP_DELAY_DAYS} d): ${held.join('; ')}${C.off}`);

  // 6. pictures: a live listing whose picture set is older than PICTURE_SET
  //    gets the current set (the raw photographs, hero first) by
  //    ReviseFixedPriceItem — only once the first URL answers 200.
  let pictured = 0;
  for (const e of manifest.items) {
    const id = e._ebay?.itemId;
    if (!id || e.sold || e.retired || !activeIds.has(id) || e._ebay.pictures === PICTURE_SET) continue;
    const urls = picturesOf(e);
    const head = await fetch(urls[0], { method: 'HEAD' }).catch(() => null);
    if (!head?.ok) {
      console.log(`${C.dim}   · ${e.id}: new pictures not published yet (${urls[0].replace(ORIGIN, '')} ${head ? head.status : 'unreachable'})${C.off}`);
      continue;
    }
    if (!WRITE) {
      console.log(`${C.yellow}   ⚠ ${e.id} — would send picture set ${PICTURE_SET} (${urls.length} pictures)${C.off}`);
      continue;
    }
    try {
      const pics = urls.map((u) => `<PictureURL>${xmlEsc(u)}</PictureURL>`).join('');
      await trading(token, 'ReviseFixedPriceItem', `<Item><ItemID>${xmlEsc(id)}</ItemID><PictureDetails>${pics}</PictureDetails></Item>`);
      e._ebay.pictures = PICTURE_SET;
      save();
      changes += 1;
      pictured += 1;
      console.log(`${C.green}   ✔ ${e.id} — pictures updated (${urls.length})${C.off}`);
    } catch (err) {
      failures += 1;
      console.log(`${C.red}   ✖ ${e.id} — ${err.message}${C.off}`);
    }
  }
  if (pictured) console.log(`${C.dim}   ${pictured} listing(s) given the ${PICTURE_SET} picture set${C.off}`);
} catch (err) {
  failures += 1;
  console.log(`${C.red}✖ ${err.message}${C.off}`);
}

console.log(`${C.dim}   ${changes} change(s) · ${failures} failure(s)${C.off}`);
process.exitCode = failures ? 1 : 0;
