/**
 * eBay bulk-listing CSV from the catalogue.
 *
 *   node scripts/ebay-csv.mjs [out.csv]      default: Desktop/Tour Archive/ebay-bulk-upload.csv
 *
 * One row per LIVE piece (never sold, never retired, never a drop that has
 * not opened), in the File Exchange shape that Seller Hub → Reports → Upload
 * accepts: the Action header carries the site/currency, starred columns are
 * eBay's required ones, C: columns are item specifics. Photos travel as
 * public URLs on tourarchive.us, pipe-separated in PicURL, hero first.
 *
 * eBay takes JPEG/PNG/GIF picture URLs; the eBay-era carousels hold .webp
 * frames, so the build (scripts/images.mjs) writes a JPEG twin of each to
 * dist/ebay/<slug>/NN.jpg and the CSV points there. The site must have
 * deployed since the last catalogue change, or those URLs 404.
 *
 * Nothing here links to the site: eBay forbids off-eBay links in listings.
 * Category IDs live in CATEGORY below; a wrong one rejects that row only,
 * and Seller Hub names the row, so the first upload doubles as the check.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const STOCK = join(ROOT, 'public', 'stock');
const ORIGIN = 'https://tourarchive.us';
const OUT = process.argv[2] || 'C:/Users/Karen Plankton/Desktop/Tour Archive/ebay-bulk-upload.csv';
const SHIPPING = '8.00';
const HANDLING_DAYS = 3;
const RETURN_DAYS = 14;
const MAX_PICS = 24;
const TITLE_MAX = 80;

/* eBay US leaf categories by our garment field. Men's clothing tree. */
const CATEGORY = {
  polo: 185100, // Men > Clothing > Shirts > Polo shirts
  sweater: 11484, // Men > Clothing > Sweaters
  cardigan: 11484,
  vest: 15691, // Men > Clothing > Vests
  windshirt: 57988, // Men > Clothing > Coats, Jackets & Vests
  jacket: 57988,
  tee: 15687, // Men > Clothing > T-Shirts
  cap: 52365, // Men > Accessories > Hats
  hat: 52365,
};

const manifest = JSON.parse(readFileSync(join(STOCK, 'manifest.json'), 'utf8'));
const live = manifest.items.filter((e) => !e.sold && !e.retired && !e.upcoming && e.file);

const esc = (v) => {
  const s = String(v ?? '').replace(/\r?\n/g, ' ').trim();
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const html = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const sentence = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** Public JPEG URL for a stock path. A .webp frame points at the JPEG twin
 *  the build writes to dist/ebay/<slug>/NN.jpg (scripts/images.mjs). */
function pictureURL(path, slug) {
  if (!/\.webp$/i.test(path)) return `${ORIGIN}/stock/${path}`;
  return `${ORIGIN}/ebay/${slug}/${path.split('/').pop().replace(/\.webp$/i, '.jpg')}`;
}

/** Measurements from the map, else the "Measurements:" line Henry writes. */
function measurementsOf(e) {
  const m = e.measurements && Object.keys(e.measurements).length
    ? Object.entries(e.measurements).map(([k, v]) => `${k}: ${v}`)
    : [];
  if (m.length) return m;
  const lines = [...(e.description || []), ...(e.details || [])];
  const i = lines.findIndex((l) => /^measurements:?$/i.test(sentence(l)));
  if (i >= 0 && lines[i + 1]) return [sentence(lines[i + 1]).replace(/\s*\/\s*/g, ' · ')];
  const inline = lines.find((l) => /^measurements:\s*\S/i.test(sentence(l)));
  return inline ? [sentence(inline).replace(/^measurements:\s*/i, '').replace(/\s*\/\s*/g, ' · ')] : [];
}

function descriptionOf(e) {
  const skip = (l) => /^measurements:?/i.test(sentence(l)) || /checkout completes/i.test(l) || /^\d[\d.]*["”″]/.test(sentence(l));
  const paras = (e.description || []).filter((l) => !skip(l)).map(sentence).filter(Boolean);
  const details = (e.details || []).filter((l) => !skip(l)).map(sentence).filter(Boolean);
  const meas = measurementsOf(e);
  const facts = [
    e.brand && e.brand !== 'Unattributed' ? `Brand: ${e.brand}` : '',
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

/* eBay condition codes: 1000 new, 3000 pre-owned. "See listing" is a
   placeholder on our side, never a note a buyer should read. */
const conditionId = (e) => (/^new\b/i.test(e.specifics?.Condition || e.condition || '') ? 1000 : 3000);
const conditionNote = (e) => {
  const c = e.specifics?.Condition || e.condition || '';
  return /see (listing|photos)/i.test(c) ? '' : c;
};

const sizeOf = (e) => {
  const s = e.specifics?.Size || e.size;
  return s && !/see (listing|photos)/i.test(s) ? s : '';
};
const titleOf = (e) => {
  let t = sentence(e.name);
  const size = sizeOf(e);
  if (size && !new RegExp(`\\b${size}\\b`, 'i').test(t) && t.length + size.length + 6 <= TITLE_MAX) t += ` Size ${size}`;
  return t.slice(0, TITLE_MAX);
};

/* Item-specific columns: the union of every key the pieces carry, minus
   Condition (that is the ConditionID + description). */
const SPEC_KEYS = [...new Set(live.flatMap((e) => Object.keys(e.specifics || {})))].filter((k) => k !== 'Condition').sort();
for (const k of ['Brand', 'Size', 'Color', 'Type', 'Department', 'Size Type']) if (!SPEC_KEYS.includes(k)) SPEC_KEYS.push(k);

const HEAD = [
  '*Action(SiteID=US|Country=US|Currency=USD|Version=1193|CC=UTF-8)',
  'CustomLabel', '*Category', '*Title', '*Description', '*ConditionID', 'ConditionDescription',
  'PicURL', '*Format', '*Duration', '*StartPrice', '*Quantity', '*Location', 'PostalCode',
  'ShippingProfileName', 'ReturnProfileName', 'PaymentProfileName',
  '*ShippingType', 'ShippingService-1:Option', 'ShippingService-1:Cost', '*DispatchTimeMax',
  '*ReturnsAcceptedOption', 'ReturnsWithinOption', 'ShippingCostPaidByOption', 'RefundOption',
  ...SPEC_KEYS.map((k) => `C:${k}`),
];

const rows = [HEAD.map(esc).join(',')];
const report = [];
let converted = 0;
for (const e of live) {
  const slug = e.id.replace(/^stock-/, '');
  const frames = Array.isArray(e.photos) && e.photos.length ? e.photos : [e.file];
  const urls = [];
  for (const p of frames.slice(0, MAX_PICS)) {
    if (/\.webp$/i.test(p)) converted += 1;
    urls.push(pictureURL(p, slug));
  }
  const sp = e.specifics || {};
  const specifics = Object.fromEntries(SPEC_KEYS.map((k) => [k, sp[k] || '']));
  if (!specifics.Brand && e.brand && e.brand !== 'Unattributed') specifics.Brand = e.brand;
  if (!specifics.Size) specifics.Size = sizeOf(e);
  if (!specifics.Color && e.colorName) specifics.Color = e.colorName.split(' ')[0];
  if (!specifics.Department) specifics.Department = 'Men';
  if (!specifics.Type) specifics.Type = { polo: 'Polo Shirt', sweater: 'Sweater', cardigan: 'Cardigan', vest: 'Vest', windshirt: 'Windbreaker', cap: 'Baseball Cap', tee: 'T-Shirt' }[e.garment] || '';
  const category = CATEGORY[e.garment] || '';
  if (!category) report.push(`${e.id}: no category for garment "${e.garment}" — set it in Seller Hub`);
  if (!sizeOf(e)) report.push(`${e.id}: no size on record`);
  rows.push([
    'Add', e.sku || e.id, category, titleOf(e), descriptionOf(e), conditionId(e), conditionNote(e),
    urls.join('|'), 'FixedPrice', 'GTC', Number(e.price).toFixed(2), 1, 'Virginia, United States', '',
    '', '', '',
    'Flat', 'USPSGroundAdvantage', SHIPPING, HANDLING_DAYS,
    'ReturnsAccepted', `Days_${RETURN_DAYS}`, 'Buyer', 'MoneyBack',
    ...SPEC_KEYS.map((k) => specifics[k]),
  ].map(esc).join(','));
}

writeFileSync(OUT, '\uFEFF' + rows.join('\r\n') + '\r\n', 'utf8');
console.log(`\n── Tour Archive · eBay bulk CSV ──`);
console.log(`   ${live.length} live piece(s) → ${OUT}`);
console.log(`   ${converted} webp frame(s) referenced as JPEG twins under /ebay/ (written by the build; deploy before uploading)`);
for (const r of report) console.log(`   ⚠ ${r}`);
process.exitCode = 0;
