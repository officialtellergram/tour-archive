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
 *
 * Henry may claim a number himself on a Stripe product — the metadata row
 * `sku`, or "SKU: TA_GS_56" in the description — before the piece is
 * drained (held pieces are never drained). Those claims count as taken.
 */
const SERIES = { 'basic-stock': 'GS', '': 'GS', 'tour-championship-2026': 'TC26', 'presidents-cup-2026': 'PC26' };
const SKU_RX = /\bTA[_\s-]?([A-Z]{2,6}\d{0,2})[_\s-]?(\d{2,3})\b/i;

export function seriesOf(collection) {
  const id = collection || '';
  if (SERIES[id]) return SERIES[id];
  const m = id.match(/^(.*?)(?:-(\d{4}))?$/);
  const initials = (m?.[1] || id).split('-').filter(Boolean).map((w) => w[0].toUpperCase()).join('');
  const year = m?.[2] ? m[2].slice(2) : '';
  return `${initials || 'XX'}${year}`;
}

/** A catalogue number written anywhere in free text ("SKU: TA_GS_56", "ta gs 56"), in canonical form, or ''. */
export function skuInText(text) {
  const m = String(text || '').match(SKU_RX);
  return m ? `TA_${m[1].toUpperCase()}_${m[2].padStart(2, '0')}` : '';
}

/** The number a Stripe product claims for itself: metadata sku first, then the description. */
export function claimedSku(product) {
  return skuInText(product?.metadata?.sku) || skuInText(product?.description) || '';
}

/** The next free number in a series: past every sku in the catalogue (sold ones too) and every claimed one. */
export function nextSku(manifest, collection, claimed = []) {
  const series = seriesOf(collection);
  const re = new RegExp(`^TA_${series}_(\\d+)$`);
  let max = 0;
  for (const sku of [...manifest.items.map((e) => e.sku), ...claimed]) {
    const m = String(sku || '').match(re);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `TA_${series}_${String(max + 1).padStart(2, '0')}`;
}

/** A sku a human typed is kept only if it is well formed and unused in the catalogue. */
export function usableSku(manifest, sku) {
  const s = skuInText(sku);
  if (!s) return '';
  return manifest.items.some((e) => e.sku === s) ? '' : s;
}
