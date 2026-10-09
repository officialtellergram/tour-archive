/**
 * One eBay listing, composed from a catalogue record.
 *
 * Shared by scripts/ebay-csv.mjs (the Seller Hub bulk file) and
 * scripts/ebay-sync.mjs (listing by API), so a piece reads the same on eBay
 * whichever path put it there. Nothing here links to the site: eBay forbids
 * off-eBay links in a listing.
 */

export const ORIGIN = 'https://tourarchive.us';
export const TERMS = {
  shipping: '8.00',
  // eBay's Trading name for USPS Ground Advantage (GeteBayDetails, 8 Oct 2026)
  shippingService: 'USPSParcel',
  handlingDays: 3,
  returnDays: 14,
  location: 'Virginia, United States',
  country: 'US',
  currency: 'USD',
};
export const MAX_PICS = 24;
export const TITLE_MAX = 80;

/**
 * eBay US leaf categories by the catalogue's garment field. Read from eBay's
 * Taxonomy API on 8 Oct 2026 (get_category_suggestions, tree 0): IDs from
 * memory had drifted — 185100 is no longer a leaf. Apparel sits in the
 * Men's Clothing tree (the larger audience); hats, towels and programmes in
 * the golf and memorabilia trees where their buyers look.
 */
export const CATEGORY = {
  polo: 185101, // Clothing > Men > Men's Clothing > Shirts > Polos
  sweater: 11484, // Clothing > Men > Men's Clothing > Sweaters
  cardigan: 11484,
  vest: 57988, // Clothing > Men > Men's Clothing > Coats, Jackets & Vests
  windshirt: 57988,
  windbreaker: 57988,
  jacket: 57988,
  tee: 15687, // Clothing > Men > Men's Clothing > Shirts > T-Shirts
  cap: 158937, // Sporting Goods > Golf > Golf Clothing, Shoes & Accessories > Golf Visors & Hats
  hat: 158937,
  snapback: 158937,
};
/** Pieces whose garment field says only "memorabilia": the category by record. */
export const CATEGORY_BY_ID = {
  'stock-tc-east-lake-bag-towel': 18932, // Sporting Goods > Golf > Golf Accessories > Golf Towels
  'stock-2002-tc-magazine-fan-guide': 50131, // Sports Mem > Vintage Sports Memorabilia > Publications > Programs > Other
};
const TYPE = { polo: 'Polo Shirt', sweater: 'Sweater', cardigan: 'Cardigan', vest: 'Vest', windshirt: 'Windbreaker', windbreaker: 'Windbreaker', jacket: 'Jacket', cap: 'Baseball Cap', snapback: 'Baseball Cap', tee: 'T-Shirt' };

export const html = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const sentence = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** eBay condition codes: 1000 new, 3000 pre-owned. "See listing" is our placeholder, never a note. */
export const conditionId = (e) => (/^new\b/i.test(e.specifics?.Condition || e.condition || '') ? 1000 : 3000);
export const conditionNote = (e) => {
  const c = e.specifics?.Condition || e.condition || '';
  return /see (listing|photos)/i.test(c) ? '' : c;
};
export const sizeOf = (e) => {
  const s = e.specifics?.Size || e.size;
  return s && !/see (listing|photos)/i.test(s) ? s : '';
};
export const brandOf = (e) => (e.specifics?.Brand || (e.brand && e.brand !== 'Unattributed' ? e.brand : '')) || '';

export const titleOf = (e) => {
  let t = sentence(e.name);
  const size = sizeOf(e);
  if (size && !new RegExp(`\\b${size.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(t) && t.length + size.length + 6 <= TITLE_MAX) t += ` Size ${size}`;
  return t.slice(0, TITLE_MAX);
};

/** Measurements from the map, else the "Measurements:" line the listing carried. */
export function measurementsOf(e) {
  if (e.measurements && Object.keys(e.measurements).length) return Object.entries(e.measurements).map(([k, v]) => `${k}: ${v}`);
  const lines = [...(e.description || []), ...(e.details || [])];
  const i = lines.findIndex((l) => /^measurements:?$/i.test(sentence(l)));
  if (i >= 0 && lines[i + 1]) return [sentence(lines[i + 1]).replace(/\s*\/\s*/g, ' · ')];
  const inline = lines.find((l) => /^measurements:\s*\S/i.test(sentence(l)));
  return inline ? [sentence(inline).replace(/^measurements:\s*/i, '').replace(/\s*\/\s*/g, ' · ')] : [];
}

export function descriptionOf(e) {
  const skip = (l) => /^measurements:?/i.test(sentence(l)) || /checkout completes/i.test(l) || /^\d[\d.]*["”″]/.test(sentence(l));
  const paras = (e.description || []).filter((l) => !skip(l)).map(sentence).filter(Boolean);
  const details = (e.details || []).filter((l) => !skip(l)).map(sentence).filter(Boolean);
  const meas = measurementsOf(e);
  const facts = [
    brandOf(e) ? `Brand: ${brandOf(e)}` : '',
    e.year ? `Era: ${e.year}` : '',
    sizeOf(e) ? `Tagged size: ${sizeOf(e)}` : '',
    e.colorName ? `Colour: ${e.colorName}` : '',
  ].filter(Boolean);
  return [
    `<p><b>${html(e.name)}</b></p>`,
    ...paras.map((p) => `<p>${html(p)}</p>`),
    details.length ? `<ul>${details.map((d) => `<li>${html(d)}</li>`).join('')}</ul>` : '',
    facts.length ? `<p>${facts.map(html).join('<br>')}</p>` : '',
    meas.length ? `<p><b>Measurements, taken flat</b><br>${meas.map(html).join('<br>')}</p>` : '',
    '<p>One of one, photographed in house. Pre-owned: ordinary wear consistent with age; anything beyond that is described and shown. Buy on the measurements, not the label.</p>',
  ].filter(Boolean).join('');
}

/**
 * Public JPEG URLs. First the square hero the build writes to
 * dist/ebay/<slug>/hero-sq.jpg (eBay's gallery tile is square; a portrait
 * gets grey bars), then every frame in order — the portrait hero included,
 * so the listing's own gallery still has the full photograph. A .webp frame
 * points at the JPEG twin under dist/ebay/.
 */
export const PICTURE_SET = 'sq1'; // bump when the set changes; the sync re-sends pictures whose ledger differs
export function picturesOf(e) {
  const slug = e.id.replace(/^stock-/, '');
  const frames = Array.isArray(e.photos) && e.photos.length ? e.photos : [e.file];
  const rest = frames.slice(0, MAX_PICS - 1).map((p) => (/\.webp$/i.test(p)
    ? `${ORIGIN}/ebay/${slug}/${p.split('/').pop().replace(/\.webp$/i, '.jpg')}`
    : `${ORIGIN}/stock/${p}`));
  return [`${ORIGIN}/ebay/${slug}/hero-sq.jpg`, ...rest];
}

/** Item specifics as name → value, with the catalogue filling what the record lacks. */
export function specificsOf(e) {
  const out = {};
  for (const [k, v] of Object.entries(e.specifics || {})) if (k !== 'Condition' && v) out[k] = String(v);
  if (!out.Brand && brandOf(e)) out.Brand = brandOf(e);
  if (!out.Size && sizeOf(e)) out.Size = sizeOf(e);
  if (!out.Color && e.colorName) out.Color = e.colorName.split(' ')[0];
  if (!out.Department) out.Department = 'Men';
  if (!out.Type && TYPE[e.garment]) out.Type = TYPE[e.garment];
  // Required by eBay in these categories (VerifyAddFixedPriceItem, 8 Oct 2026):
  // Brand always, Size Type on polos, Style on sweaters and outerwear.
  if (!out.Brand) out.Brand = 'Unbranded';
  if (!out['Size Type'] && ['polo', 'sweater', 'cardigan', 'tee', 'vest', 'windshirt', 'windbreaker', 'jacket'].includes(e.garment)) out['Size Type'] = 'Regular';
  if (!out.Style) {
    const n = `${e.name} ${e.garment}`.toLowerCase();
    if (/cardigan/.test(n)) out.Style = 'Cardigan';
    else if (/quarter[- ]zip|1\/4[- ]zip/.test(n)) out.Style = 'Quarter-Zip';
    else if (/v-neck|vneck/.test(n)) out.Style = 'V-Neck';
    else if (e.garment === 'sweater') out.Style = 'Pullover';
    else if (e.garment === 'vest') out.Style = 'Vest';
    else if (['windshirt', 'windbreaker'].includes(e.garment)) out.Style = 'Windbreaker';
    else if (e.garment === 'jacket') out.Style = 'Basic Jacket';
  }
  return out;
}

export const categoryOf = (e) => CATEGORY_BY_ID[e.id] || CATEGORY[e.garment] || 0;
export const skuOf = (e) => e.sku || e.id;

/** Can this record be listed as it stands? */
export function listable(e) {
  if (e.sold || e.retired || e.upcoming) return { ok: false, why: 'not for sale' };
  if (!e.file) return { ok: false, why: 'no photograph' };
  if (!categoryOf(e)) return { ok: false, why: `no eBay category for garment "${e.garment}"` };
  if (!Number(e.price)) return { ok: false, why: 'no price' };
  return { ok: true };
}
