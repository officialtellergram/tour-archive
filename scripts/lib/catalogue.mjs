/**
 * Catalogue numbers — one per piece, for tags, the stall sheet, the Stripe
 * app's Description at a sale, and the eBay SKU of listings made after the
 * number existed.
 *
 *   TA_GS_14      general stock (basic-stock, and the pre-collection pieces)
 *   TA_TC26_10    Tour Championship 2026
 *   TA_PC26_01    Presidents Cup 2026
 *   TA_<CODE>_01  any later collection: the code is the collection id's
 *                 initials plus a two-digit year when the id ends in one
 *
 * Numbers are never reused and never changed once given: a piece already on
 * eBay keeps the SKU its listing was made with (the sync remembers it in
 * _ebay.sku), so numbering a piece later breaks nothing there.
 */
const SERIES = { 'basic-stock': 'GS', '': 'GS', 'tour-championship-2026': 'TC26', 'presidents-cup-2026': 'PC26' };

export function seriesOf(collection) {
  const id = collection || '';
  if (SERIES[id]) return SERIES[id];
  const m = id.match(/^(.*?)(?:-(\d{4}))?$/);
  const initials = (m?.[1] || id).split('-').filter(Boolean).map((w) => w[0].toUpperCase()).join('');
  const year = m?.[2] ? m[2].slice(2) : '';
  return `${initials || 'XX'}${year}`;
}

/** The next free number in a series, counting every sku in the catalogue (sold ones too). */
export function nextSku(manifest, collection) {
  const series = seriesOf(collection);
  const re = new RegExp(`^TA_${series}_(\\d+)$`);
  let max = 0;
  for (const e of manifest.items) {
    const m = String(e.sku || '').match(re);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `TA_${series}_${String(max + 1).padStart(2, '0')}`;
}

/** A sku a human typed (Stripe metadata, a tag) is kept only if it is well formed and unused. */
export function usableSku(manifest, sku) {
  const s = String(sku || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (!/^TA_[A-Z0-9]{2,6}_\d{2,3}$/.test(s)) return '';
  return manifest.items.some((e) => e.sku === s) ? '' : s;
}
