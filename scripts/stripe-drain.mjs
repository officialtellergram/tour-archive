/**
 * Stripe drain — Henry's dashboard listings into the manifest, Stripe → repo.
 *
 * The mint runs manifest → Stripe for stock we photographed and dressed
 * here. This is the other direction: a cofounder lists a piece in the Stripe
 * Dashboard from a phone (name, description, price, photos), and this sweep
 * archives it — photos normalised into public/stock/, an entry scaffolded
 * into the manifest, the product stamped with our id so it is never drained
 * twice. The mint then only has to mint the Payment Link.
 *
 * Collision contract with stripe-mint.mjs: the drain owns products WITHOUT
 * `metadata.ta_id`; the mint owns products WITH one. Neither touches the
 * other's.
 *
 * What Henry types, and where it lands:
 *   name          → entry.name (and the slug/id/filename)
 *   description   → first line becomes the story; a "Size XL" line becomes
 *                   the size; a "Measurements: …" line is parsed into the
 *                   measurements map; the rest is kept verbatim as
 *                   description[] paragraphs
 *   price         → entry.price (the product's default_price, one-time, USD)
 *   images        → images[0] is the hero (<slug>.jpg), the rest the carousel
 *
 * Gate ladder — report, never half-scaffold: no image, no usable price, or
 * an empty name means the product is skipped and named in the summary.
 *
 * Modes:  (none)      dry — report what would be drained, touch nothing
 *         --write     archive photos, write the manifest, stamp the product.
 *                     NEVER runs git. A human gates and pushes.
 *         --collection=<id>   collection for scaffolded entries
 *                             (default: basic-stock)
 *         --refresh   re-pull PHOTOGRAPHS for products already archived whose
 *                     Stripe image count now exceeds the manifest's. The
 *                     phone dashboard attaches one image; the rest get added
 *                     from the web dashboard later, and this is how they
 *                     reach the carousel. Copy and price are never touched —
 *                     the manifest owns those once an entry exists.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { inferGarment, inferColourway, inferYear } from '../server/normalize.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MANIFEST = join(ROOT, 'public', 'stock', 'manifest.json');
const STOCK = join(ROOT, 'public', 'stock');
const FIT = join(ROOT, 'scripts', 'photo-fit.py');
const API = 'https://api.stripe.com';

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const REFRESH = args.includes('--refresh');
const COLLECTION = (args.find((a) => a.startsWith('--collection=')) || '').slice(13) || 'basic-stock';
const C = { red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', dim: '\x1b[2m', off: '\x1b[0m' };

/* ---------------- key + mode (same discipline as the mint) ---------------- */

function envKey() {
  if (process.env.STRIPE_SECRET_KEY) return process.env.STRIPE_SECRET_KEY.trim();
  const p = join(ROOT, '.env');
  if (!existsSync(p)) return '';
  for (const line of readFileSync(p, 'utf8').replace(/^﻿/, '').split('\n')) {
    if (line.startsWith('STRIPE_SECRET_KEY=')) return line.slice('STRIPE_SECRET_KEY='.length).replace(/\r$/, '').trim();
  }
  return '';
}
const KEY = envKey();
const MODE = /^[sr]k_test_/.test(KEY) ? 'test' : /^[sr]k_live_/.test(KEY) ? 'live' : null;
if (!MODE) {
  console.error(`${C.red}✖ STRIPE_SECRET_KEY missing or not an sk_/rk_ test/live key${C.off}`);
  process.exit(1);
}
console.log(`\n${C.dim}── Tour Archive · stripe drain (${MODE}${WRITE ? ', WRITE' : ', dry'}) → ${COLLECTION} ──${C.off}`);

const AUTH = 'Basic ' + Buffer.from(KEY + ':').toString('base64');
async function stripe(method, path, params) {
  const opts = { method, headers: { Authorization: AUTH } };
  if (params) {
    opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    opts.body = new URLSearchParams(params).toString();
  }
  const res = await fetch(API + path, opts);
  const body = await res.json();
  if (!res.ok) throw new Error(`${method} ${path}: ${body?.error?.message || `HTTP ${res.status}`}`);
  return body;
}

/* ---------------- 1. what Henry listed ---------------- */

const products = [];
{
  let after = '';
  for (;;) {
    const page = await stripe('GET', `/v1/products?active=true&limit=100&expand[]=data.default_price${after ? `&starting_after=${after}` : ''}`);
    products.push(...page.data);
    if (!page.has_more || !page.data.length) break;
    after = page.data[page.data.length - 1].id;
  }
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const known = new Set(manifest.items.map((e) => e._stripe?.product).filter(Boolean));
const fresh = products.filter((p) => !p.metadata?.ta_id && !known.has(p.id));
console.log(`${C.dim}   ${products.length} active product(s) · ${fresh.length} not yet drained${C.off}`);

/* ---------------- 2. scaffolding ---------------- */

const slugOf = (name) =>
  String(name).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

// 'Polo' is a garment far more often than a brand in this stock; the brand
// is caught by 'Ralph Lauren' when it is genuinely present.
const BRANDS = ['Nike', 'Peter Millar', 'Ralph Lauren', 'FootJoy', 'Titleist', 'TaylorMade', 'Callaway',
  'Izod', 'Slazenger', 'Ashworth', 'Cutter & Buck', 'Bobby Jones', 'Fairway & Greene', 'Adidas', 'Puma',
  'Under Armour', 'Antigua', 'Gear for Sports', 'Champion', 'Lacoste', 'Munsingwear', 'Pringle', 'Lyle & Scott'];
const brandOf = (hay) => BRANDS.find((b) => new RegExp(`\\b${b.replace(/[&]/g, '\\&')}\\b`, 'i').test(hay)) || 'Unattributed';

const SIZE_RX = /\bsize\s*:?\s*(XS|S|M|L|XL|XXL|2XL|3XL)\b/i;
const MEAS_RX = /^\s*measurements?\s*:?\s*(.+)$/i;

/** "26\" Length - 24\" Pit to Pit" → { Length: '26 in', 'Pit to Pit': '24 in' } */
function parseMeasurements(line) {
  const out = {};
  for (const seg of line.split(/\s*[-–—,•|]\s*|\s{2,}/)) {
    const m = seg.match(/^\s*([\d.]+)\s*["”″]?\s*([A-Za-z][A-Za-z ]{1,24}?)\s*$/) ||
              seg.match(/^\s*([A-Za-z][A-Za-z ]{1,24}?)\s*:?\s*([\d.]+)\s*["”″]?\s*$/);
    if (!m) continue;
    const [n, label] = /^[\d.]/.test(m[1]) ? [m[1], m[2]] : [m[2], m[1]];
    out[label.trim().replace(/\b\w/g, (c) => c.toUpperCase())] = `${n} in`;
  }
  return out;
}

/**
 * Henry writes one field per segment, separated by line breaks, " / " or
 * " - " — whichever his thumb reaches. Split on all three, then re-join the
 * pieces of a measurements list that the " - " split tore apart
 * ("Measurements: 26\" Length - 24\" Pit to Pit" is one field, not three).
 */
function segments(text) {
  const raw = String(text || '').split(/\r?\n|\s\/\s|\s[-–—]\s/).map((l) => l.replace(/</g, '').trim()).filter(Boolean);
  const out = [];
  for (const seg of raw) {
    const prev = out[out.length - 1];
    if (prev && /^measurements?\s*:?/i.test(prev) && /^[\d.]+\s*["”″]?\s*[A-Za-z]/.test(seg)) {
      out[out.length - 1] = `${prev} - ${seg}`;
      continue;
    }
    out.push(seg);
  }
  return out;
}

function scaffold(p, file, photos) {
  const lines = segments(p.description);
  const hay = `${p.name} ${lines.join(' ')}`;
  let size = 'See photos';
  let measurements = {};
  const paras = [];
  for (const l of lines) {
    const s = l.match(SIZE_RX);
    const m = l.match(MEAS_RX);
    if (m) { measurements = { ...measurements, ...parseMeasurements(m[1]) }; continue; }
    if (s) {
      size = s[1].toUpperCase();
      const rest = l.replace(SIZE_RX, '').replace(/^\s*[,;:-]\s*/, '').trim();
      if (rest.length >= 4) paras.push(rest);   // "100% cotton" survives, "Size XL" alone does not
      continue;
    }
    paras.push(l);
  }
  // a tee has no silhouette of its own; the collared shirt is the nearest
  // drawn fallback and only matters if the photograph ever fails to load
  const garment = /\bt-?shirt\b|\btee\b/i.test(hay) ? 'polo' : inferGarment(hay);
  const CATEGORY = { vest: 'Knitwear', cardigan: 'Knitwear', sweater: 'Knitwear', polo: 'Shirting', rugby: 'Shirting',
    windshirt: 'Outerwear', jacket: 'Outerwear', trousers: 'Trousers', cap: 'Headwear' };
  const { colorway, colorName } = inferColourway(hay);
  return {
    id: `stock-${slugOf(p.name)}`,
    file,
    name: p.name.trim(),
    brand: brandOf(hay),
    year: inferYear(hay) || '—',
    category: CATEGORY[garment] || 'Knitwear',
    garment,
    size,
    condition: 'Pre-owned',
    price: p.default_price.unit_amount / 100,
    colorway,
    colorName,
    story: paras[0] || p.name.trim(),
    details: ['Checkout completes with Stripe'],
    measurements,
    collection: COLLECTION,
    _ingested: new Date().toISOString().slice(0, 10),
    _source: `stripe:${p.id}`,
    ...(photos.length ? { photos } : {}),
    description: paras,
    _stripe: { mode: MODE, product: p.id, price: p.default_price.id },
  };
}

/* ---------------- 3. drain ---------------- */

const drained = [];
const skipped = [];
const tmp = join(tmpdir(), `drain-${process.pid}`);
mkdirSync(tmp, { recursive: true });

async function fetchTo(url, dst) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
  writeFileSync(dst, Buffer.from(await res.arrayBuffer()));
}

/* Fit every image of a product into hero + carousel slots for an entry.
   Frame 01 of the carousel is the hero again so the PDP rail is complete. */
async function pullPhotos(p, entry) {
  const slug = entry.id.replace(/^stock-/, '');
  const all = p.images.slice(0, 8);
  const raw0 = join(tmp, `${slug}-0`);
  await fetchTo(all[0], raw0);
  const fit = spawnSync('python', [FIT, raw0, join(STOCK, entry.file)], { encoding: 'utf8' });
  if (fit.status !== 0) throw new Error(`photo-fit: ${(fit.stderr || fit.stdout).trim().slice(0, 200)}`);
  console.log(`${C.dim}      ${fit.stdout.trim()}${C.off}`);
  if (all.length < 2) return [];
  const photos = all.map((_, i) => `carousel/${slug}/${String(i + 1).padStart(2, '0')}.jpg`);
  spawnSync('python', [FIT, raw0, join(STOCK, photos[0])], { encoding: 'utf8' });
  for (let i = 1; i < all.length; i++) {
    const r = join(tmp, `${slug}-${i}`);
    await fetchTo(all[i], r);
    const f = spawnSync('python', [FIT, r, join(STOCK, photos[i])], { encoding: 'utf8' });
    if (f.status !== 0) throw new Error(`photo-fit (carousel ${i + 1}): ${(f.stderr || '').trim().slice(0, 200)}`);
    console.log(`${C.dim}      ${f.stdout.trim()}${C.off}`);
  }
  return photos;
}

if (REFRESH) {
  const byProduct = new Map(manifest.items.filter((e) => e._stripe?.product).map((e) => [e._stripe.product, e]));
  let refreshed = 0;
  for (const p of products) {
    const entry = byProduct.get(p.id);
    if (!entry) continue;
    const have = Array.isArray(entry.photos) ? entry.photos.length : (entry.file ? 1 : 0);
    const now = (p.images || []).length;
    if (now <= Math.max(have, 1)) continue;
    console.log(`${C.dim}   ${WRITE ? 'refreshing' : 'would refresh'} ${entry.id} — ${have} photo(s) archived, ${now} on Stripe${C.off}`);
    if (!WRITE) { refreshed += 1; continue; }
    try {
      const photos = await pullPhotos(p, entry);
      if (photos.length) entry.photos = photos;
      entry._photosPulled = new Date().toISOString().slice(0, 10);
      writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
      refreshed += 1;
      console.log(`${C.green}   ✔ ${entry.id} — ${photos.length || 1} frame(s)${C.off}`);
    } catch (err) {
      console.log(`${C.red}   ✖ ${entry.id}: ${err.message}${C.off}`);
    }
  }
  console.log(`${C.dim}   ${refreshed} ${WRITE ? 'refreshed' : 'would refresh'}${C.off}`);
}

for (const p of fresh) {
  const price = p.default_price;
  const why =
    !p.name?.trim() ? 'no name'
    : !p.images?.length ? 'no photograph'
    : !price || price.type !== 'one_time' || price.currency !== 'usd' || !(price.unit_amount > 0) ? 'no usable one-time USD price'
    : manifest.items.some((e) => e.id === `stock-${slugOf(p.name)}`) ? `id stock-${slugOf(p.name)} already exists in the manifest`
    : null;
  if (why) {
    skipped.push(`${p.id} "${p.name}" — ${why}`);
    console.log(`${C.yellow}   ⚠ skip ${p.name}: ${why}${C.off}`);
    continue;
  }

  const slug = slugOf(p.name);
  const file = `${slug}.jpg`;
  const extra = p.images.slice(1, 8);
  const photos = extra.length ? [`carousel/${slug}/${String(1).padStart(2, '0')}.jpg`, ...extra.map((_, i) => `carousel/${slug}/${String(i + 2).padStart(2, '0')}.jpg`)] : [];

  console.log(`${C.dim}   ${WRITE ? 'draining' : 'would drain'} ${p.name} — $${price.unit_amount / 100}, ${p.images.length} image(s) → ${file}${C.off}`);
  if (!WRITE) { drained.push(p.name); continue; }

  try {
    // hero
    const raw = join(tmp, `${slug}-0`);
    await fetchTo(p.images[0], raw);
    const fit = spawnSync('python', [FIT, raw, join(STOCK, file)], { encoding: 'utf8' });
    if (fit.status !== 0) throw new Error(`photo-fit: ${(fit.stderr || fit.stdout).trim().slice(0, 200)}`);
    console.log(`${C.dim}      ${fit.stdout.trim()}${C.off}`);
    // carousel: frame 01 is the hero again so the PDP rail is complete
    if (photos.length) {
      spawnSync('python', [FIT, raw, join(STOCK, photos[0])], { encoding: 'utf8' });
      for (let i = 0; i < extra.length; i++) {
        const r = join(tmp, `${slug}-${i + 1}`);
        await fetchTo(extra[i], r);
        const f = spawnSync('python', [FIT, r, join(STOCK, photos[i + 1])], { encoding: 'utf8' });
        if (f.status !== 0) throw new Error(`photo-fit (carousel ${i + 2}): ${(f.stderr || '').trim().slice(0, 200)}`);
        console.log(`${C.dim}      ${f.stdout.trim()}${C.off}`);
      }
    }
    // entry, written immediately — a crash after this line loses nothing
    manifest.items.push(scaffold(p, file, photos));
    writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    // stamp: from here the mint owns this product
    await stripe('POST', `/v1/products/${p.id}`, {
      'metadata[ta_id]': `stock-${slug}`,
      'metadata[ta_drained]': new Date().toISOString().slice(0, 10),
    });
    drained.push(p.name);
    console.log(`${C.green}   ✔ stock-${slug}${C.off}`);
  } catch (err) {
    // undo a half-written hero so ingest never scaffolds a phantom from it
    try { unlinkSync(join(STOCK, file)); } catch { /* not written */ }
    skipped.push(`${p.id} "${p.name}" — ${err.message}`);
    console.log(`${C.red}   ✖ ${p.name}: ${err.message}${C.off}`);
  }
}

console.log(`\n${C.dim}   ${drained.length} ${WRITE ? 'drained' : 'would drain'} · ${skipped.length} skipped${C.off}`);
for (const s of skipped) console.log(`${C.yellow}   · ${s}${C.off}`);
if (WRITE && drained.length) {
  console.log(`${C.dim}   next: node scripts/stripe-mint.mjs --probe  then  --write --live  (mints only the Payment Links)${C.off}`);
}
console.log('');
process.exitCode = 0;
