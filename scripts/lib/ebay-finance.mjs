/**
 * What eBay pays us per order — the "Payment" panel of Seller Hub, by API.
 *
 *   Buyer paid:   subtotal + shipping + sales tax (eBay collects and remits
 *                 the tax; it never reaches us)            → Fulfillment order
 *   Selling cost: transaction fees (final value fee + the per-order fixed
 *                 fee) and the shipping label bought in Seller Hub
 *                                                           → Finances API
 *   Earnings:     subtotal + shipping − fees − label
 *
 * Shared by scripts/ebay-report.mjs (the CSV) and scripts/ebay-to-stripe.mjs
 * (the same figures as metadata on the Stripe invoice). Money is in dollars
 * as numbers; eBay gives strings.
 */
const FINANCES = 'https://apiz.ebay.com/sell/finances/v1/transaction';
const num = (v) => Math.round(Number(v || 0) * 100) / 100;

/** Every Finances transaction, keyed by order: fees, label, refund. */
export async function financeByOrder(token) {
  const by = new Map();
  let url = `${FINANCES}?limit=200`;
  while (url) {
    const r = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`finances: ${r.status} ${(await r.text()).slice(0, 160)}`);
    const j = await r.json();
    for (const t of j.transactions || []) {
      if (!t.orderId) continue;
      const f = by.get(t.orderId) || { fees: 0, label: 0, net: 0, refunded: 0, feesRefunded: 0, status: '', saleDate: '' };
      if (t.transactionType === 'SALE') {
        f.fees = num(t.totalFeeAmount?.value);
        f.net = num(t.amount?.value);
        f.status = t.transactionStatus || '';
        f.saleDate = (t.transactionDate || '').slice(0, 10);
      } else if (t.transactionType === 'SHIPPING_LABEL') {
        f.label = num(f.label + num(t.amount?.value));
      } else if (t.transactionType === 'REFUND') {
        f.refunded = num(f.refunded + num(t.amount?.value));
        f.feesRefunded = num(f.feesRefunded + num(t.totalFeeAmount?.value));
      }
      by.set(t.orderId, f);
    }
    url = j.next || null;
  }
  return by;
}

/** The buyer's side of one Fulfillment order. */
export function buyerPaid(order) {
  const subtotal = num(order.pricingSummary?.priceSubtotal?.value);
  const shipping = num(order.pricingSummary?.deliveryCost?.value);
  const tax = num((order.lineItems || []).flatMap((li) => li.ebayCollectAndRemitTaxes || []).reduce((s, t) => s + Number(t.amount?.value || 0), 0));
  return { subtotal, shipping, tax, total: num(subtotal + shipping + tax) };
}

/** One row: the panel, top to bottom. `fin` may be missing (order not yet in Finances). */
export function breakdown(order, fin) {
  const paid = buyerPaid(order);
  const f = fin || { fees: 0, label: 0, net: num(paid.subtotal + paid.shipping), refunded: 0, feesRefunded: 0, status: 'PENDING', saleDate: '' };
  // eBay's SALE amount is already net of fees, and its REFUND amount is
  // likewise net of the fees it hands back, so a refunded order earns
  // nothing beyond what a label cost.
  const earnings = num(f.net - f.label - f.refunded);
  return { ...paid, fees: f.fees, label: f.label, refunded: f.refunded, earnings, fundsStatus: f.status, saleDate: f.saleDate || (order.creationDate || '').slice(0, 10) };
}

/** Flat form fields for Stripe metadata. */
export function metadataOf(b) {
  return {
    'metadata[ebay_subtotal]': b.subtotal.toFixed(2),
    'metadata[ebay_shipping_charged]': b.shipping.toFixed(2),
    'metadata[ebay_sales_tax]': b.tax.toFixed(2),
    'metadata[ebay_order_total]': b.total.toFixed(2),
    'metadata[ebay_fees]': b.fees.toFixed(2),
    'metadata[ebay_shipping_label]': b.label.toFixed(2),
    'metadata[ebay_earnings]': b.earnings.toFixed(2),
    'metadata[ebay_funds_status]': b.fundsStatus,
  };
}
