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
// Colour on a terminal only; the scheduled runs append to a log file.
const C = process.stdout.isTTY ? { red: '\x1b[31m', yellow: '\x1b[33m', dim: '\x1b[2m', off: '\x1b[0m' } : { red: '', yellow: '', dim: '', off: '' };
const EBAY_ONLY = process.argv.includes('--ebay');
const FLAT_SHIPPING = 8;
// A period statement instead of the all-time report: that period's rows, a
// TOTAL line for the period and a CUMULATIVE line for everything up to its
// last day.
//   --month=YYYY-MM      one calendar month        --month=previous  the month just ended
//   --week=YYYY-MM-DD    Monday to Sunday from     --week=previous   the week just ended
//                        that Monday                                 (Monday to Sunday)
const dayISO = (d) => d.toISOString().slice(0, 10);
const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return dayISO(d); };
const monthArg = (process.argv.find((a) => a.startsWith('--month=')) || '').slice(8);
const weekArg = (process.argv.find((a) => a.startsWith('--week=')) || '').slice(7);
let PERIOD = null; // { label, from, to, suffix }
if (monthArg) {
  const m = monthArg === 'previous'
    ? (() => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); })()
    : /^\d{4}-\d{2}$/.test(monthArg) ? monthArg : '';
  if (!m) { console.log(`${C.red}✖ --month wants YYYY-MM or "previous"${C.off}`); process.exit(1); }
  const last = new Date(`${m}-01T00:00:00Z`); last.setUTCMonth(last.getUTCMonth() + 1); last.setUTCDate(0);
  PERIOD = { label: m, from: `${m}-01`, to: dayISO(last), suffix: `-${m}` };
} else if (weekArg) {
  let monday = '';
  if (weekArg === 'previous') {
    const today = new Date(); const dow = (today.getUTCDay() + 6) % 7; // Monday = 0
    monday = addDays(dayISO(today), -dow - 7);
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(weekArg)) {
    const dow = (new Date(`${weekArg}T00:00:00Z`).getUTCDay() + 6) % 7;
    monday = addDays(weekArg, -dow); // any day in the week → its Monday
  }
  if (!monday) { console.log(`${C.red}✖ --week wants YYYY-MM-DD or "previous"${C.off}`); process.exit(1); }
  const sunday = addDays(monday, 6);
  PERIOD = { label: `week ${monday} to ${sunday}`, from: monday, to: sunday, suffix: `-week-${monday}` };
}
// The combined report lands in the shared Drive folder the team reads
// (Drive for Desktop, G:); the eBay-only cut stays on the Desktop. Either
// falls back to the Desktop when Drive is not mounted.
const DRIVE = 'G:/My Drive/Finance/Transaction Invoices';
const DESK = 'C:/Users/Karen Plankton/Desktop/Tour Archive';
const OUT = process.argv.slice(2).find((a) => !a.startsWith('--'))
  || (EBAY_ONLY ? `${DESK}/ebay-sales-report.csv` : `${existsSync(DRIVE) ? DRIVE : DESK}/sales-report${PERIOD ? PERIOD.suffix : ''}.csv`);

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

// ── In person: a Tap to Pay charge from the Dashboard app (no shipping, no label)
async function inPersonRow(e) {
  const base = {
    channel: 'in-person', date: e._stripe.soldAt || '', piece: e.name, id: e.id,
    sitePrice: Number(e.price).toFixed(2), subtotal: Number(e._stripe.soldAmount ?? e.price).toFixed(2), shipping: '0.00',
    salesTax: '', orderTotal: '', fees: '', label: '', earnings: '', funds: '', status: 'paid', refunded: '', buyer: '',
    reference: e._stripe.soldCharge, stripeInvoice: '',
  };
  if (!env.STRIPE_SECRET_KEY) return base;
  const r = await fetch(`https://api.stripe.com/v1/charges/${e._stripe.soldCharge}?expand[]=balance_transaction`, { headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } });
  const c = await r.json();
  if (!r.ok) { console.log(`${C.yellow}   ⚠ ${e.id}: ${c.error?.message || r.status}${C.off}`); return base; }
  const bt = c.balance_transaction;
  const refunded = c.amount_refunded || 0;
  return {
    ...base,
    date: new Date(c.created * 1000).toISOString().slice(0, 10),
    subtotal: money(c.amount), salesTax: '0.00', orderTotal: money(c.amount),
    fees: money(bt ? bt.fee : 0), earnings: money((bt ? bt.net : c.amount) - refunded),
    funds: bt ? (bt.status === 'available' ? 'PAID_OUT' : 'PENDING') : '',
    status: refunded >= c.amount ? 'refunded' : 'paid', refunded: money(refunded),
    buyer: [c.billing_details?.name, c.receipt_email].filter(Boolean).join(' '),
    reference: c.payment_intent || c.id,
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
  } else if (e._stripe?.soldCharge) {
    if (EBAY_ONLY) continue;
    rows.push(await inPersonRow(e));
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

// Totals count kept sales only (not cancelled, not refunded); blank cells are 0.
const MONEY = ['subtotal', 'shipping', 'salesTax', 'orderTotal', 'fees', 'label', 'earnings', 'refunded'];
const isKept = (r) => !['cancelled', 'refunded'].includes(r.status);
const totalRow = (label, set) => {
  const kept = set.filter(isKept);
  const t = Object.fromEntries(Object.keys(rows[0] || { channel: 1 }).map((k) => [k, '']));
  t.channel = label;
  t.piece = `${kept.length} sale(s)`;
  for (const k of MONEY) t[k] = kept.reduce((s, r) => s + Number(r[k] || 0), 0).toFixed(2);
  return t;
};
let out = rows;
const extra = [];
if (PERIOD) {
  const undated = rows.filter((r) => !r.date);
  out = rows.filter((r) => r.date >= PERIOD.from && r.date <= PERIOD.to);
  extra.push(totalRow(`TOTAL ${PERIOD.label}`, out), totalRow(`CUMULATIVE to ${PERIOD.to}`, rows.filter((r) => r.date && r.date <= PERIOD.to)));
  if (undated.length) console.log(`${C.yellow}   ⚠ ${undated.length} sale(s) with no date (before the automations) are outside any period and left out of both lines${C.off}`);
}

const head = ['channel', 'date', 'piece', 'id', 'site_price', 'subtotal', 'shipping_charged', 'sales_tax', 'order_total', 'transaction_fees', 'shipping_label', 'earnings', 'funds_status', 'status', 'refunded', 'buyer', 'reference', 'stripe_invoice'];
const csv = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
let written = true;
try {
  const lines = [head.join(','), ...out.map((r) => Object.values(r).map(csv).join(','))];
  if (extra.length) lines.push('', ...extra.map((r) => Object.values(r).map(csv).join(',')));
  writeFileSync(OUT, lines.join('\r\n') + '\r\n', 'utf8');
} catch (err) {
  written = false;
  if (err.code !== 'EBUSY' && err.code !== 'EPERM') throw err;
}

console.log(`\n${C.dim}── Tour Archive · ${EBAY_ONLY ? 'eBay sales' : 'sales'} report${PERIOD ? ` · ${PERIOD.label}` : ''} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC ──${C.off}`);
const pad = (s, n) => String(s).padEnd(n).slice(0, n);
const col = (s) => String(s).padStart(8);
console.log(`${C.dim}   ${pad('channel', 22)} ${pad('date', 10)} ${pad('piece', 34)} ${col('subtotal')} ${col('ship')} ${col('tax')} ${col('total')} ${col('fees')} ${col('label')} ${col('earned')}  status${C.off}`);
for (const r of [...out, ...extra]) console.log(`   ${pad(r.channel, 22)} ${pad(r.date || '—', 10)} ${pad(r.piece, 34)} ${col(r.subtotal)} ${col(r.shipping)} ${col(r.salesTax)} ${col(r.orderTotal)} ${col(r.fees)} ${col(r.label)} ${col(r.earnings)}  ${r.status}`);
if (!PERIOD) {
  const t = totalRow('all time', rows);
  console.log(`${C.dim}   ${t.piece} kept · subtotal $${t.subtotal} · fees $${t.fees} · labels $${t.label} · earnings $${t.earnings} (blank cells count as 0)${C.off}`);
}
if (written) console.log(`${C.dim}   → ${OUT}${C.off}`);
else console.log(`${C.yellow}   ⚠ ${OUT} is open in another program (Excel?) — close it and run again to refresh the file${C.off}`);
