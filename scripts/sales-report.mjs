/**
 * Sales report — every sold piece, both channels, one row each, same columns.
 *
 *   node scripts/sales-report.mjs                    print the table, write the CSV
 *   node scripts/sales-report.mjs --ebay             eBay orders only (the Seller Hub panel)
 *   node scripts/sales-report.mjs path/to/out.csv    another file
 *     default out: G:/My Drive/Finance/Transaction Invoices/sales-report.csv (Drive)
 *                  --ebay: Desktop/Tour Archive/ebay-sales-report.csv
 *
 * A LEFT JOIN from the catalogue: every piece marked sold is a row, whether
 * or not a channel record exists for it. The channel record fills the money
 * columns —
 *   eBay    Fulfillment order + Finances API: subtotal, shipping, sales tax,
 *           order total, transaction fees, shipping label, earnings, funds
 *           status (scripts/lib/ebay-finance.mjs; Seller Hub's panel exactly)
 *   Stripe  the paid Checkout Session and its balance transaction: subtotal,
 *           shipping as charged (the flat $8 on every link), tax, total,
 *           Stripe's fee, net. No label: postage for site sales is not in
 *           Stripe, so that column is blank and earnings are net of fees only.
 *   none    sales from before the automations (the old eBay account): piece
 *           and site price, shipping assumed $8, the rest blank.
 * eBay orders with no sold piece behind them (a cancelled order whose piece
 * sold again) are appended so no record is lost. Read-only; never runs git.
 *
 * Stripe key needs Checkout Sessions, Payment Intents, Charges and Balance
 * transactions read; the local .env key has them.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { breakdown, financeByOrder } from './lib/ebay-finance.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MANIFEST = join(ROOT, 'public', 'stock', 'manifest.json');
const BROKER = 'https://tour-archive-stripe-hook.officialtellergram.workers.dev/ebay/token';
const FULFILMENT = 'https://api.ebay.com/sell/fulfillment/v1/order';
const C = { red: '\x1b[31m', yellow: '\x1b[33m', dim: '\x1b[2m', off: '\x1b[0m' };
const EBAY_ONLY = process.argv.includes('--ebay');
const FLAT_SHIPPING = 8;
// The combined report lands in the shared Drive folder the team reads
// (Drive for Desktop, G:); the eBay-only cut stays on the Desktop. Either
// falls back to the Desktop when Drive is not mounted.
const DRIVE = 'G:/My Drive/Finance/Transaction Invoices';
const DESK = 'C:/Users/Karen Plankton/Desktop/Tour Archive';
const OUT = process.argv.slice(2).find((a) => !a.startsWith('--'))
  || (EBAY_ONLY ? `${DESK}/ebay-sales-report.csv` : `${existsSync(DRIVE) ? DRIVE : DESK}/sales-report.csv`);

const envFile = join(ROOT, '.env');
const env = {
  ...(existsSync(envFile) ? Object.fromEntries(readFileSync(envFile, 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])) : {}),
  ...Object.fromEntries(['STRIPE_SECRET_KEY', 'EBAY_SYNC_SECRET'].filter((k) => process.env[k]).map((k) => [k, process.env[k]])),
};
if (!env.EBAY_SYNC_SECRET) {
  console.log(`${C.red}✖ EBAY_SYNC_SECRET is needed${C.off}`);
  process.exit(1);
}
if (!EBAY_ONLY && !env.STRIPE_SECRET_KEY) console.log(`${C.yellow}⚠ no STRIPE_SECRET_KEY; site sales will show the site price and the flat shipping only${C.off}`);

const money = (c) => (c / 100).toFixed(2);
const num = (v) => Math.round(Number(v || 0) * 100) / 100;

// ── eBay: orders and finances, by order id
const token = (await (await fetch(BROKER, { headers: { authorization: `Bearer ${env.EBAY_SYNC_SECRET}` } })).json()).access_token;
const orders = new Map();
let url = `${FULFILMENT}?limit=200`;
while (url) {
  const r = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`getOrders: ${r.status}`);
  const j = await r.json();
  for (const o of j.orders || []) orders.set(o.orderId, o);
  url = j.next || null;
}
const fin = await financeByOrder(token);

function ebayRow(e, o) {
  const b = breakdown(o, fin.get(o.orderId));
  const cancelled = o.cancelStatus?.cancelState === 'CANCELED' || o.orderPaymentStatus === 'FULLY_REFUNDED';
  const li = o.lineItems?.[0] || {};
  return {
    channel: 'ebay',
    date: o.creationDate.slice(0, 10),
    piece: e?.name || li.title || '',
    id: e?.id || li.sku || '',
    sitePrice: e ? Number(e.price).toFixed(2) : '',
    subtotal: b.subtotal.toFixed(2),
    shipping: b.shipping.toFixed(2),
    salesTax: b.tax.toFixed(2),
    orderTotal: b.total.toFixed(2),
    fees: b.fees.toFixed(2),
    label: b.label.toFixed(2),
    earnings: b.earnings.toFixed(2),
    funds: b.fundsStatus,
    status: cancelled ? 'cancelled' : o.orderFulfillmentStatus === 'FULFILLED' ? 'shipped' : 'to ship',
    refunded: b.refunded.toFixed(2),
    buyer: o.buyer?.username || '',
    reference: o.orderId,
    stripeInvoice: e && (e._ebay?.soldOrder === o.orderId || e._ebay?.cancelledOrder === o.orderId) ? e._ebay.stripeInvoice || '' : '',
  };
}

// ── Stripe: the paid Checkout Session with its balance transaction
async function stripeRow(e) {
  const base = {
    channel: 'stripe',
    date: '',
    piece: e.name,
    id: e.id,
    sitePrice: Number(e.price).toFixed(2),
    subtotal: Number(e.price).toFixed(2),
    shipping: FLAT_SHIPPING.toFixed(2),
    salesTax: '',
    orderTotal: '',
    fees: '',
    label: '',
    earnings: '',
    funds: '',
    status: 'paid',
    refunded: '',
    buyer: '',
    reference: e._stripe.soldSession,
    stripeInvoice: '',
  };
  if (!env.STRIPE_SECRET_KEY) return base;
  const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${e._stripe.soldSession}?expand[]=payment_intent.latest_charge.balance_transaction`, { headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } });
  const s = await r.json();
  if (!r.ok) {
    console.log(`${C.yellow}   ⚠ ${e.id}: ${s.error?.message || r.status}${C.off}`);
    return base;
  }
  const charge = s.payment_intent?.latest_charge;
  const bt = charge?.balance_transaction;
  const refunded = charge?.amount_refunded || 0;
  const fee = bt ? bt.fee : 0;
  const net = bt ? bt.net : s.amount_total;
  return {
    ...base,
    date: new Date(s.created * 1000).toISOString().slice(0, 10),
    subtotal: money(s.amount_subtotal),
    shipping: money(s.total_details?.amount_shipping ?? FLAT_SHIPPING * 100),
    salesTax: money(s.total_details?.amount_tax || 0),
    orderTotal: money(s.amount_total),
    fees: money(fee),
    earnings: money(net - refunded),
    funds: bt ? (bt.status === 'available' ? 'PAID_OUT' : 'PENDING') : '',
    status: refunded >= s.amount_total ? 'refunded' : charge?.disputed ? 'disputed' : 'paid',
    refunded: money(refunded),
    buyer: s.customer_details?.email || '',
    reference: s.payment_intent?.id || e._stripe.soldSession,
  };
}

// ── the join: every sold piece is a row
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const rows = [];
const usedOrders = new Set();
for (const e of manifest.items.filter((x) => x.sold)) {
  if (e._ebay?.soldOrder && orders.has(e._ebay.soldOrder)) {
    rows.push(ebayRow(e, orders.get(e._ebay.soldOrder)));
    usedOrders.add(e._ebay.soldOrder);
  } else if (e._stripe?.soldSession) {
    if (EBAY_ONLY) continue;
    rows.push(await stripeRow(e));
  } else {
    if (EBAY_ONLY) continue;
    rows.push({
      channel: e._ebayUrl ? 'ebay (old account)' : 'unknown',
      date: e.soldAt || '',
      piece: e.name,
      id: e.id,
      sitePrice: Number(e.price).toFixed(2),
      subtotal: Number(e.price).toFixed(2),
      shipping: FLAT_SHIPPING.toFixed(2),
      salesTax: '',
      orderTotal: '',
      fees: '',
      label: '',
      earnings: '',
      funds: '',
      status: 'sold',
      refunded: '',
      buyer: '',
      reference: '',
      stripeInvoice: '',
    });
  }
}
// eBay orders with no sold piece behind them (cancelled, then sold again)
const bySku = new Map(manifest.items.map((e) => [e.sku || e.id, e]));
for (const o of orders.values()) {
  if (usedOrders.has(o.orderId)) continue;
  rows.push(ebayRow(bySku.get(o.lineItems?.[0]?.sku), o));
}
rows.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.piece.localeCompare(b.piece));

const head = ['channel', 'date', 'piece', 'id', 'site_price', 'subtotal', 'shipping_charged', 'sales_tax', 'order_total', 'transaction_fees', 'shipping_label', 'earnings', 'funds_status', 'status', 'refunded', 'buyer', 'reference', 'stripe_invoice'];
const csv = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
let written = true;
try {
  writeFileSync(OUT, [head.join(','), ...rows.map((r) => Object.values(r).map(csv).join(','))].join('\r\n') + '\r\n', 'utf8');
} catch (err) {
  written = false;
  if (err.code !== 'EBUSY' && err.code !== 'EPERM') throw err;
}

console.log(`\n${C.dim}── Tour Archive · ${EBAY_ONLY ? 'eBay sales' : 'sales'} report ──${C.off}`);
const pad = (s, n) => String(s).padEnd(n).slice(0, n);
const col = (s) => String(s).padStart(8);
console.log(`${C.dim}   ${pad('channel', 18)} ${pad('date', 10)} ${pad('piece', 34)} ${col('subtotal')} ${col('ship')} ${col('tax')} ${col('total')} ${col('fees')} ${col('label')} ${col('earned')}  status${C.off}`);
for (const r of rows) console.log(`   ${pad(r.channel, 18)} ${pad(r.date || '—', 10)} ${pad(r.piece, 34)} ${col(r.subtotal)} ${col(r.shipping)} ${col(r.salesTax)} ${col(r.orderTotal)} ${col(r.fees)} ${col(r.label)} ${col(r.earnings)}  ${r.status}`);
const kept = rows.filter((r) => !['cancelled', 'refunded'].includes(r.status));
const sum = (k) => kept.reduce((s, r) => s + Number(r[k] || 0), 0).toFixed(2);
console.log(`${C.dim}   ${kept.length} sale(s) kept · subtotal $${sum('subtotal')} · fees $${sum('fees')} · labels $${sum('label')} · earnings $${sum('earnings')} (blank cells count as 0)${C.off}`);
if (written) console.log(`${C.dim}   → ${OUT}${C.off}`);
else console.log(`${C.yellow}   ⚠ ${OUT} is open in another program (Excel?) — close it and run again to refresh the file${C.off}`);
