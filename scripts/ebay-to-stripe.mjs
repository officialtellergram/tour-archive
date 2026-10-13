/**
 * eBay sales into Stripe, as invoices paid out of band.
 *
 *   node scripts/ebay-to-stripe.mjs            report
 *   node scripts/ebay-to-stripe.mjs --write    create invoices and credit notes, stamp the manifest
 *
 * Stripe only records money that moves through Stripe, so an eBay sale is
 * logged as an invoice marked "paid out of band": the piece and the
 * shipping as two lines, the buyer as a customer, channel and eBay order
 * number in the metadata, no fee, nothing moving. Stripe's invoice views,
 * customer pages, Sigma and exports then show both channels together.
 * (The home-page revenue chart counts card charges only.)
 *
 * A sale cancelled on eBay after it was invoiced gets a credit note for the
 * full amount, also out of band, so the record nets to zero and the history
 * stays. Runs after the eBay sync in stripe-drift.yml. Never runs git.
 *
 * Each invoice also carries Seller Hub's "Payment" panel as metadata
 * (ebay_subtotal, ebay_shipping_charged, ebay_sales_tax, ebay_order_total,
 * ebay_fees, ebay_shipping_label, ebay_earnings, ebay_funds_status) from the
 * Finances API, refreshed every run until the funds are paid out, so a
 * Stripe invoice export shows price, fees and net for both channels.
 *
 * Stripe key needs: Customers write, Invoices write, Credit notes write
 * (plus what the sync already has). eBay: EBAY_SYNC_SECRET for the order.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { breakdown, financeByOrder, metadataOf } from './lib/ebay-finance.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MANIFEST = join(ROOT, 'public', 'stock', 'manifest.json');
const BROKER = 'https://tour-archive-stripe-hook.officialtellergram.workers.dev/ebay/token';
const C = { red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', dim: '\x1b[2m', off: '\x1b[0m' };
const WRITE = process.argv.includes('--write');

const envFile = join(ROOT, '.env');
const env = {
  ...(existsSync(envFile)
    ? Object.fromEntries(readFileSync(envFile, 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
    : {}),
  ...Object.fromEntries(['STRIPE_SECRET_KEY', 'EBAY_SYNC_SECRET'].filter((k) => process.env[k]).map((k) => [k, process.env[k]])),
};
if (!env.STRIPE_SECRET_KEY || !env.EBAY_SYNC_SECRET) {
  console.log(`${C.red}✖ STRIPE_SECRET_KEY and EBAY_SYNC_SECRET are both needed${C.off}`);
  process.exitCode = 1;
}

async function stripe(method, path, body) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body: body ? new URLSearchParams(body).toString() : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path}: ${json.error?.message || res.status}`);
  return json;
}

let ebayToken = null;
async function ebayOrder(orderId) {
  if (!ebayToken) ebayToken = (await (await fetch(BROKER, { headers: { authorization: `Bearer ${env.EBAY_SYNC_SECRET}` } })).json()).access_token;
  const r = await fetch(`https://api.ebay.com/sell/fulfillment/v1/order/${orderId}`, { headers: { authorization: `Bearer ${ebayToken}` } });
  if (!r.ok) throw new Error(`eBay order ${orderId}: ${r.status}`);
  return r.json();
}

const cents = (v) => Math.round(Number(v || 0) * 100);

/** One Stripe customer per eBay buyer, found again by username. */
async function customerFor(order) {
  const user = order.buyer?.username || 'ebay-buyer';
  const to = order.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo || {};
  const found = await stripe('GET', `customers/search?query=${encodeURIComponent(`metadata['ebay_username']:'${user.replace(/'/g, '')}'`)}&limit=1`);
  if (found.data?.length) return found.data[0].id;
  const a = to.contactAddress || {};
  const body = {
    name: to.fullName || user,
    description: `eBay buyer ${user}`,
    'metadata[ebay_username]': user,
    'metadata[channel]': 'ebay',
  };
  if (to.email) body.email = to.email;
  if (a.addressLine1) {
    body['address[line1]'] = a.addressLine1;
    if (a.addressLine2) body['address[line2]'] = a.addressLine2;
    if (a.city) body['address[city]'] = a.city;
    if (a.stateOrProvince) body['address[state]'] = a.stateOrProvince;
    if (a.postalCode) body['address[postal_code]'] = a.postalCode;
    if (a.countryCode) body['address[country]'] = a.countryCode;
  }
  return (await stripe('POST', 'customers', body)).id;
}

let financeCache = null;
async function finance() {
  if (!financeCache) {
    if (!ebayToken) ebayToken = (await (await fetch(BROKER, { headers: { authorization: `Bearer ${env.EBAY_SYNC_SECRET}` } })).json()).access_token;
    financeCache = await financeByOrder(ebayToken);
  }
  return financeCache;
}

/** The panel's figures for an order, as Stripe metadata fields. */
async function financeMetadata(order) {
  const b = breakdown(order, (await finance()).get(order.orderId));
  return { fields: metadataOf(b), stamp: `${b.fees}|${b.label}|${b.earnings}|${b.fundsStatus}` };
}

async function invoiceFor(e, order) {
  const customer = await customerFor(order);
  const fin = await financeMetadata(order);
  const li = order.lineItems?.find((x) => x.sku === (e.sku || e.id)) || order.lineItems?.[0] || {};
  const item = cents(li.lineItemCost?.value ?? e.price);
  const ship = cents(li.deliveryCost?.shippingCost?.value ?? order.pricingSummary?.deliveryCost?.value ?? 0);
  const when = Math.floor(new Date(order.creationDate).getTime() / 1000);
  const inv = await stripe('POST', 'invoices', {
    customer,
    collection_method: 'charge_automatically', // paid out of band at once; nothing is ever sent or charged
    auto_advance: 'false',
    pending_invoice_items_behavior: 'exclude',
    description: `eBay order ${order.orderId} — ${e.name}`,
    'metadata[channel]': 'ebay',
    'metadata[ebay_order]': order.orderId,
    'metadata[ta_id]': e.id,
    'metadata[sold_at]': order.creationDate.slice(0, 10),
    ...fin.fields,
  });
  await stripe('POST', 'invoiceitems', { customer, invoice: inv.id, amount: String(item), currency: 'usd', description: e.name, 'metadata[ta_id]': e.id });
  if (ship > 0) await stripe('POST', 'invoiceitems', { customer, invoice: inv.id, amount: String(ship), currency: 'usd', description: 'Shipping (eBay)' });
  await stripe('POST', `invoices/${inv.id}/finalize`);
  const paid = await stripe('POST', `invoices/${inv.id}/pay`, { paid_out_of_band: 'true' });
  return { id: paid.id, total: paid.total, number: paid.number, when, stamp: fin.stamp };
}

// --probe: prove the key's write permissions with a throwaway customer and
// a draft invoice, both deleted again; nothing is left in the account.
if (process.argv.includes('--probe')) {
  try {
    const c = await stripe('POST', 'customers', { name: 'permission probe', 'metadata[probe]': 'true' });
    try {
      const inv = await stripe('POST', 'invoices', { customer: c.id, collection_method: 'charge_automatically', auto_advance: 'false', 'metadata[probe]': 'true' });
      await stripe('DELETE', `invoices/${inv.id}`);
    } finally {
      await stripe('DELETE', `customers/${c.id}`);
    }
    console.log(`${C.green}   ✔ key can create customers and invoices (probe objects deleted)${C.off}`);
  } catch (err) {
    console.log(`${C.red}   ✖ key probe: ${err.message}${C.off}`);
    process.exitCode = 1;
  }
  process.exit();
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const save = () => writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(`\n${C.dim}── Tour Archive · eBay sales → Stripe invoices (${WRITE ? 'WRITE' : 'report'}) ──${C.off}`);
let changes = 0;
let failures = 0;

// sales to invoice
for (const e of manifest.items.filter((x) => x.sold && x._ebay?.soldOrder && !x._ebay?.stripeInvoice)) {
  try {
    const order = await ebayOrder(e._ebay.soldOrder);
    const total = order.pricingSummary?.total?.value;
    console.log(`${C.yellow}   ${WRITE ? '' : 'would invoice: '}${e.id} — eBay order ${e._ebay.soldOrder}, $${Number(total).toFixed(2)}${C.off}`);
    if (!WRITE) continue;
    const inv = await invoiceFor(e, order);
    e._ebay.stripeInvoice = inv.id;
    e._ebay.finance = inv.stamp;
    save();
    changes += 1;
    console.log(`${C.green}   ✔ ${inv.number || inv.id} paid out of band, $${(inv.total / 100).toFixed(2)}${C.off}`);
  } catch (err) {
    failures += 1;
    console.log(`${C.red}   ✖ ${e.id}: ${err.message}${C.off}`);
  }
}

// cancellations after invoicing → full credit note
for (const e of manifest.items.filter((x) => x._ebay?.cancelledOrder && x._ebay?.stripeInvoice && !x._ebay?.stripeCreditNote && !x._ebay?.soldOrder)) {
  try {
    const inv = await stripe('GET', `invoices/${e._ebay.stripeInvoice}`);
    console.log(`${C.yellow}   ${WRITE ? '' : 'would credit: '}${e.id} — eBay order ${e._ebay.cancelledOrder} cancelled; credit note for $${(inv.total / 100).toFixed(2)}${C.off}`);
    if (!WRITE) continue;
    const cn = await stripe('POST', 'credit_notes', { invoice: inv.id, out_of_band_amount: String(inv.total), reason: 'order_change', memo: `eBay order ${e._ebay.cancelledOrder} cancelled by the buyer`, 'metadata[channel]': 'ebay', 'metadata[ebay_order]': e._ebay.cancelledOrder });
    e._ebay.stripeCreditNote = cn.id;
    save();
    changes += 1;
    console.log(`${C.green}   ✔ credit note ${cn.number || cn.id}${C.off}`);
  } catch (err) {
    failures += 1;
    console.log(`${C.red}   ✖ ${e.id}: ${err.message}${C.off}`);
  }
}

// the panel's figures, kept current: fees are known at the sale, the
// shipping label arrives when Henry buys it, the funds status moves from
// on-hold to paid out. Metadata stays editable after finalization. The
// ledger's _ebay.finance stamp means nothing is re-sent when nothing moved.
for (const e of manifest.items.filter((x) => x._ebay?.stripeInvoice && (x._ebay.soldOrder || x._ebay.cancelledOrder))) {
  try {
    const orderId = e._ebay.soldOrder || e._ebay.cancelledOrder;
    const order = await ebayOrder(orderId);
    const fin = await financeMetadata(order);
    if (e._ebay.finance === fin.stamp) continue;
    console.log(`${C.yellow}   ${WRITE ? '' : 'would stamp: '}${e.id} — fees $${fin.fields['metadata[ebay_fees]']}, label $${fin.fields['metadata[ebay_shipping_label]']}, earnings $${fin.fields['metadata[ebay_earnings]']} (${fin.fields['metadata[ebay_funds_status]']})${C.off}`);
    if (!WRITE) continue;
    await stripe('POST', `invoices/${e._ebay.stripeInvoice}`, fin.fields);
    e._ebay.finance = fin.stamp;
    save();
    changes += 1;
  } catch (err) {
    failures += 1;
    console.log(`${C.red}   ✖ ${e.id}: ${err.message}${C.off}`);
  }
}

console.log(`${C.dim}   ${changes} change(s) · ${failures} failure(s)${C.off}`);
process.exitCode = failures ? 1 : 0;
