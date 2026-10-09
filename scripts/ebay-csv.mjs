/**
 * eBay bulk-listing CSV from the catalogue — the manual path.
 *
 *   node scripts/ebay-csv.mjs [out.csv] [--all]
 *     default out: Desktop/Tour Archive/ebay-bulk-upload.csv
 *
 * One row per live piece that is NOT yet on eBay (no _ebay.itemId from the
 * sync), so re-uploading the file can never duplicate a listing. --all
 * includes every live piece regardless. The listing content comes from
 * scripts/lib/ebay-listing.mjs, the same module the API path uses.
 *
 * Seller Hub → Reports → Upload accepts this File Exchange shape. Photos are
 * public URLs on tourarchive.us (JPEG twins of .webp frames are written by
 * the build to dist/ebay/), so the site must have deployed since the last
 * catalogue change.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TERMS, categoryOf, conditionId, conditionNote, descriptionOf, listable, picturesOf, skuOf, specificsOf, titleOf } from './lib/ebay-listing.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const ALL = args.includes('--all');
const OUT = args.find((a) => !a.startsWith('--')) || 'C:/Users/Karen Plankton/Desktop/Tour Archive/ebay-bulk-upload.csv';

const manifest = JSON.parse(readFileSync(join(ROOT, 'public', 'stock', 'manifest.json'), 'utf8'));
const live = manifest.items.filter((e) => listable(e).ok || (!e.sold && !e.retired && !e.upcoming && e.file));
const rowsWanted = live.filter((e) => ALL || !e._ebay?.itemId);

const esc = (v) => {
  const s = String(v ?? '').replace(/\r?\n/g, ' ').trim();
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const SPEC_KEYS = [...new Set(rowsWanted.flatMap((e) => Object.keys(specificsOf(e))))].sort();
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
for (const e of rowsWanted) {
  const ok = listable(e);
  if (!ok.ok) report.push(`${e.id}: ${ok.why} — set it in Seller Hub`);
  const sp = specificsOf(e);
  if (!sp.Size) report.push(`${e.id}: no size on record`);
  rows.push([
    'Add', skuOf(e), categoryOf(e) || '', titleOf(e), descriptionOf(e), conditionId(e), conditionNote(e),
    picturesOf(e).join('|'), 'FixedPrice', 'GTC', Number(e.price).toFixed(2), 1, TERMS.location, '',
    '', '', '',
    'Flat', TERMS.shippingService, TERMS.shipping, TERMS.handlingDays,
    'ReturnsAccepted', `Days_${TERMS.returnDays}`, 'Buyer', 'MoneyBack',
    ...SPEC_KEYS.map((k) => sp[k] || ''),
  ].map(esc).join(','));
}

writeFileSync(OUT, '\uFEFF' + rows.join('\r\n') + '\r\n', 'utf8');
console.log(`\n── Tour Archive · eBay bulk CSV ──`);
console.log(`   ${rowsWanted.length} piece(s) ${ALL ? '(every live piece)' : 'not yet on eBay'} of ${live.length} live → ${OUT}`);
for (const r of report) console.log(`   ⚠ ${r}`);
process.exitCode = 0;
