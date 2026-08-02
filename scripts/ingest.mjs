/**
 * Photo ingest — turns dropped product photos into mock listings.
 *
 * Scans public/stock/ for images and maintains manifest.json beside them.
 * The contract with the human is one-way: the ingest ADDS entries for new
 * files and flags entries whose file has gone, but it never overwrites a
 * field in an existing entry — the manifest is the editable record, the
 * filename is only the first guess.
 *
 * Inference is deliberately modest (the user asked for "1/4 zip sweater"
 * level, not provenance): title, garment type, colourway, size and price
 * band come from filename tokens via the same rules the eBay mapper uses,
 * so a piece keeps the same identity when it later becomes a real listing.
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, statSync, copyFileSync } from 'node:fs';
import { join, parse } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { inferGarment, inferColourway, inferYear, catalogueNumber } from '../server/normalize.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const STOCK = join(ROOT, 'public', 'stock');
const MANIFEST = join(STOCK, 'manifest.json');

/**
 * The intake is the user's own Desktop folder — photos get dropped there,
 * ingest copies new ones into public/stock (slug-named) so they ship with the
 * repo. Files with "logo" in the name are brand art, not stock.
 */
const INTAKE = process.env.STOCK_INTAKE || join(homedir(), 'Desktop', 'Tour Archive');

const IMAGE_RX = /\.(jpe?g|png|webp)$/i;
const HERO_RX = /^hero-/i;
const MAX_BYTES = 1.5 * 1024 * 1024;

const C = { red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', dim: '\x1b[2m', off: '\x1b[0m' };

/* ---------------- inference helpers ---------------- */

const CATEGORY_BY_GARMENT = {
  vest: 'Knitwear', cardigan: 'Knitwear', sweater: 'Knitwear',
  polo: 'Shirting', rugby: 'Shirting',
  windshirt: 'Outerwear', jacket: 'Outerwear',
  trousers: 'Trousers', cap: 'Headwear',
};

const PRICE_BY_CATEGORY = {
  Knitwear: 185, Shirting: 125, Outerwear: 225, Trousers: 155, Headwear: 75,
};

const SIZE_RX = /\b(XS|S|M|L|XL|XXL|\d{2}\s?[x×]\s?\d{2})\b/i;

/** "quarter-zip-navy-lambswool-L" → "Quarter-Zip Navy Lambswool" + size L */
function parseName(stem) {
  const size = stem.match(SIZE_RX)?.[1]?.toUpperCase().replace(/\s/g, ' × ') || 'See photos';
  const cleaned = stem
    .replace(/TA[\s._-]?[A-Z]{2}[\s._-]?\d{2}/i, '') // catalogue number out of the title
    .replace(SIZE_RX, '')
    .replace(/\b(19\d{2})\b/g, '')
    .replace(/[-_.]+/g, ' ')
    .replace(/\b(1\/4|quarter)\s*zip\b/gi, 'Quarter-Zip')
    .replace(/\b(1\/2|half)\s*zip\b/gi, 'Half-Zip')
    .replace(/\s+/g, ' ')
    .trim();
  const title = cleaned
    .split(' ')
    .filter(Boolean)
    .map((w) => (/^[A-Z0-9-]+$/.test(w) ? w : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');
  return { title: title || 'Untitled Piece', size };
}

function entryFor(file) {
  const stem = parse(file).name;
  const { title, size } = parseName(stem);
  const hay = stem.replace(/[-_.]+/g, ' ');
  const garment = inferGarment(hay);
  const { colorway, colorName } = inferColourway(hay);
  const category = CATEGORY_BY_GARMENT[garment] || 'Knitwear';
  const year = inferYear(hay);

  return {
    id: `stock-${stem.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
    file,
    catalogue: catalogueNumber(stem),
    name: title,
    brand: 'Unattributed',
    year: year || '—',
    category,
    garment,
    size,
    condition: 'Very Good',
    price: PRICE_BY_CATEGORY[category],
    colorway,
    colorName,
    story: `${title} — photographed in house, awaiting full write-up. Listed here ahead of the marketplace listing.`,
    details: ['Photographed as found', 'Full measurements on request'],
    measurements: {},
    _ingested: new Date().toISOString().slice(0, 10),
  };
}

/* ---------------- run ---------------- */

console.log(`\n${C.dim}── Tour Archive · photo ingest ──${C.off}`);

/* Pull new photos in from the Desktop intake first. */
if (existsSync(INTAKE)) {
  const already = new Set(
    (existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')).items || [] : [])
      .flatMap((i) => [i.file, i._source].filter(Boolean))
  );
  for (const f of readdirSync(INTAKE)) {
    if (!IMAGE_RX.test(f) || /logo/i.test(f)) continue;
    const slug = parse(f).name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const dest = `${slug}${parse(f).ext.toLowerCase().replace('jpeg', 'jpg')}`;
    if (already.has(dest) || already.has(f) || existsSync(join(STOCK, dest))) continue;
    copyFileSync(join(INTAKE, f), join(STOCK, dest));
    console.log(`${C.dim}   intake: ${f} → stock/${dest}${C.off}`);
  }
} else {
  console.log(`${C.yellow}   ⚠ intake folder not found: ${INTAKE}${C.off}`);
}

const files = existsSync(STOCK)
  ? readdirSync(STOCK).filter((f) => IMAGE_RX.test(f))
  : [];
const heroes = files.filter((f) => HERO_RX.test(f));
const products = files.filter((f) => !HERO_RX.test(f));

let manifest = { _comment: 'Editable record of photographed stock. Ingest adds entries; it never overwrites your edits.', items: [] };
if (existsSync(MANIFEST)) {
  try {
    manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
    manifest.items ||= [];
  } catch (err) {
    console.log(`${C.red}✖ manifest.json is corrupt (${err.message}) — fix or delete it${C.off}\n`);
    process.exit(1);
  }
}

const known = new Set(manifest.items.map((i) => i.file));
let added = 0;

for (const file of products) {
  if (known.has(file)) continue;
  manifest.items.push(entryFor(file));
  added += 1;
  console.log(`${C.green}   + ${file}${C.off}`);
}

let missing = 0;
for (const item of manifest.items) {
  const gone = !files.includes(item.file);
  if (gone && !item._missing) { item._missing = true; missing += 1; }
  if (!gone && item._missing) delete item._missing;
}

for (const file of products) {
  const size = statSync(join(STOCK, file)).size;
  if (size > MAX_BYTES) {
    console.log(`${C.yellow}   ⚠ ${file} is ${(size / 1048576).toFixed(1)} MB — compress it; it ships with the site${C.off}`);
  }
}

writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2), 'utf8');

const active = manifest.items.filter((i) => !i._missing).length;
console.log(`${C.dim}   ${products.length} photo(s) · ${added} new · ${active} active listing(s) · ${heroes.length} hero image(s)${C.off}`);
if (missing) console.log(`${C.yellow}   ⚠ ${missing} manifest entr(ies) flagged _missing — their file is gone${C.off}`);
console.log(`\n${C.green}✔ manifest up to date${C.off}\n`);
