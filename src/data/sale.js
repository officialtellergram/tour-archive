/**
 * The sale — one record, read everywhere.
 *
 * The site (cards, item pages, the cart, the home banner), the build-time
 * prerender, the Cloudflare Worker that makes the Checkout Session, and the
 * sold sweep all import this file, so a price is worked out the same way in
 * every place. Pure data and pure functions: no DOM, no imports.
 *
 * Black Friday 2026 (Karen, 25 Nov 2026), site only — eBay prices are not
 * touched:
 *   - 25% off every piece priced under $60 (the "select pieces"); a manifest
 *     entry can opt a piece in (`sale: true`) or out (`sale: false`) by hand.
 *   - Cart tiers on the order's merchandise value AFTER the piece discounts
 *     and before shipping: $100+ takes $15 off, $150+ $25, $200+ $40, $300+
 *     $50. The highest tier reached applies, once per order, as a Stripe
 *     coupon on the Checkout Session (the Worker picks it).
 *   - Window: Friday 27 Nov 00:00 to Monday 30 Nov 23:59:59, Eastern.
 *
 * Preview before the window: `?sale=<word>` on any page keeps the sale on for
 * that tab (sessionStorage); the Worker honours the same word only when it
 * equals its SALE_PREVIEW_KEY secret, so nobody prices a real order early by
 * guessing the parameter.
 */

export const SALE = {
  id: 'black-friday-2026',
  name: 'Black Friday',
  /* Eastern Standard Time in late November is UTC-5. */
  starts: '2026-11-27T05:00:00.000Z', // Fri 27 Nov 00:00 ET
  ends: '2026-12-01T04:59:59.999Z', // Mon 30 Nov 23:59:59 ET (Cyber Monday)
  endsLabel: 'Ends Monday night',
  item: { percent: 25, under: 60 }, // 25% off every piece priced under $60
  tiers: [
    { min: 100, off: 15, coupon: 'BF26_15' },
    { min: 150, off: 25, coupon: 'BF26_25' },
    { min: 200, off: 40, coupon: 'BF26_40' },
    { min: 300, off: 50, coupon: 'BF26_50' },
  ],
};

export const PREVIEW_KEY = 'ta_sale_preview';

/** The preview word this tab was opened with, or ''. Browser only. */
export function previewWord() {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(PREVIEW_KEY) || '' : '';
  } catch {
    return '';
  }
}

/** Is the sale window open at `now` (ms)? A preview word opens it for this tab. */
export function saleOn(now = Date.now(), { preview = false } = {}) {
  if (preview || previewWord()) return true;
  return now >= Date.parse(SALE.starts) && now <= Date.parse(SALE.ends);
}

/** Does this piece take the piece discount while the sale is on? The entry's
 *  own `sale` flag wins; otherwise the price rule. Sold and reserved pieces
 *  never do. */
export function isSelect(item) {
  if (!item || item.sold || item.upcoming) return false;
  if (item.sale === true) return true;
  if (item.sale === false) return false;
  const p = Number(item.price);
  return Number.isFinite(p) && p > 0 && p < SALE.item.under;
}

export const onSale = (item, now = Date.now(), opts) => saleOn(now, opts) && isSelect(item);

/** Whole cents, so the site and the Worker never disagree by a rounding. */
export const cents = (dollars) => Math.round(Number(dollars) * 100);

/** The piece price in cents after the piece discount (unchanged when the
 *  piece is not select or the sale is off). */
export function unitCents(item, now = Date.now(), opts) {
  const full = cents(item.price);
  if (!onSale(item, now, opts)) return full;
  return Math.round((full * (100 - SALE.item.percent)) / 100);
}

export const salePrice = (item, now, opts) => unitCents(item, now, opts) / 100;

/** The highest tier the merchandise value (cents, after piece discounts) reaches, or null. */
export function tierFor(merchCents) {
  let hit = null;
  for (const t of SALE.tiers) if (merchCents >= cents(t.min)) hit = t;
  return hit;
}

/** The next tier above the merchandise value, or null at the top. */
export function nextTier(merchCents) {
  return SALE.tiers.find((t) => merchCents < cents(t.min)) || null;
}

/**
 * The arithmetic of an order, in cents, for a list of pieces.
 *   list        full prices summed
 *   pieceOff    the piece discounts summed
 *   merch       list - pieceOff: what the tiers are judged on
 *   tier        the tier reached (or null) and tierOff its amount
 *   total       merch - tierOff, before shipping
 *   next        the next tier and how far away it is (gap, cents)
 */
export function orderMath(items, now = Date.now(), opts) {
  const sale = saleOn(now, opts);
  const lines = items.map((it) => {
    const full = cents(it.price);
    const unit = unitCents(it, now, opts);
    return { item: it, full, unit, off: full - unit, select: sale && isSelect(it) };
  });
  const list = lines.reduce((s, l) => s + l.full, 0);
  const merch = lines.reduce((s, l) => s + l.unit, 0);
  const tier = sale ? tierFor(merch) : null;
  const tierOff = tier ? cents(tier.off) : 0;
  const next = sale ? nextTier(merch) : null;
  return {
    sale,
    lines,
    list,
    pieceOff: list - merch,
    merch,
    tier,
    tierOff,
    total: merch - tierOff,
    next: next ? { ...next, gap: cents(next.min) - merch } : null,
  };
}

/** "$18.74" — two decimals always, so a sale price never reads "$18.7". */
export const fmt = (c) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** "$15" for whole-dollar amounts, "$18.74" otherwise. */
export const fmtShort = (c) => (c % 100 === 0 ? `$${(c / 100).toLocaleString('en-US')}` : fmt(c));
