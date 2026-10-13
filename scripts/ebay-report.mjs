/**
 * eBay sales report — Seller Hub's "Payment" panel for every order, in one CSV.
 *
 *   node scripts/ebay-report.mjs                     print the table, write the CSV
 *   node scripts/ebay-report.mjs path/to/out.csv     another file
 *     default out: Desktop/Tour Archive/ebay-sales-report.csv
 *
 * Per order: piece, site price, what the buyer paid (subtotal, shipping,
 * sales tax, order total), selling costs (transaction fees, shipping label),
 * earnings, funds status, the Stripe invoice, and whether it was cancelled
 * and refunded. Orders come from the Fulfillment API, fees and labels from
 * the Finances API (scripts/lib/ebay-finance.mjs). Read-only; never runs git.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { breakdown, financeByOrder } from './lib/ebay-finance.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MANIFEST = join(ROOT, 'public', 'stock', 'manifest.json');
const BROKER = 'https://tour-archive-stripe-hook.officialtellergram.workers.dev/ebay/token';
const FULFILMENT = 'https://api.ebay.com/sell/fulfillment/v1/order';
const C = { red: '\x1b[31m', dim: '\x1b[2m', off: '\x1b[0m' };
const OUT = process.argv.slice(2).find((a) => !a.startsWith('--')) || 'C:/Users/Karen Plankton/Desktop/Tour Archive/ebay-sales-report.csv';

const envFile = join(ROOT, '.env');
const env = {
  ...(existsSync(envFile) ? Object.fromEntries(readFileSync(envFile, 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])) : {}),
  ...(process.env.EBAY_SYNC_SECRET ? { EBAY_SYNC_SECRET: process.env.EBAY_SYNC_SECRET } : {}),
};
if (!env.EBAY_SYNC_SECRET) {
  console.log(`${C.red}✖ EBAY_SYNC_SECRET is needed${C.off}`);
  process.exit(1);
}

const token = (await (await fetch(BROKER, { headers: { authorization: `Bearer ${env.EBAY_SYNC_SECRET}` } })).json()).access_token;
const orders = [];
let url = `${FULFILMENT}?limit=200`;
while (url) {
  const r = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`getOrders: ${r.status}`);
  const j = await r.json();
  orders.push(...(j.orders || []));
  url = j.next || null;
}
const fin = await financeByOrder(token);
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const bySku = new Map(manifest.items.map((e) => [e.sku || e.id, e]));

const rows = [];
for (const o of orders.sort((a, b) => a.creationDate.localeCompare(b.creationDate))) {
  const li = o.lineItems?.[0] || {};
  const e = bySku.get(li.sku);
  const b = breakdown(o, fin.get(o.orderId));
  const cancelled = o.cancelStatus?.cancelState === 'CANCELED' || o.orderPaymentStatus === 'FULLY_REFUNDED';
  const invoice = e && (e._ebay?.soldOrder === o.orderId || e._ebay?.cancelledOrder === o.orderId) ? e._ebay.stripeInvoice || '' : '';
  rows.push({
    date: o.creationDate.slice(0, 10),
    order: o.orderId,
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
    stripeInvoice: invoice,
  });
}

const head = ['date', 'order', 'piece', 'id', 'site_price', 'ebay_subtotal', 'shipping_charged', 'sales_tax', 'order_total', 'transaction_fees', 'shipping_label', 'earnings', 'funds_status', 'status', 'refunded', 'buyer', 'stripe_invoice'];
const csv = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
writeFileSync(OUT, [head.join(','), ...rows.map((r) => Object.values(r).map(csv).join(','))].join('\r\n') + '\r\n', 'utf8');

console.log(`\n${C.dim}── Tour Archive · eBay sales report ──${C.off}`);
const pad = (s, n) => String(s).padEnd(n).slice(0, n);
const money = (s) => String(s).padStart(8);
console.log(`${C.dim}   ${pad('date', 10)} ${pad('piece', 34)} ${money('subtotal')} ${money('ship')} ${money('tax')} ${money('total')} ${money('fees')} ${money('label')} ${money('earned')}  status${C.off}`);
for (const r of rows) console.log(`   ${pad(r.date, 10)} ${pad(r.piece, 34)} ${money(r.subtotal)} ${money(r.shipping)} ${money(r.salesTax)} ${money(r.orderTotal)} ${money(r.fees)} ${money(r.label)} ${money(r.earnings)}  ${r.status}`);
const live = rows.filter((r) => r.status !== 'cancelled');
const sum = (k) => live.reduce((s, r) => s + Number(r[k]), 0).toFixed(2);
console.log(`${C.dim}   ${live.length} sale(s) kept · subtotal $${sum('subtotal')} · fees $${sum('fees')} · labels $${sum('label')} · earnings $${sum('earnings')}${C.off}`);
console.log(`${C.dim}   → ${OUT}${C.off}`);
