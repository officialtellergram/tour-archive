/**
 * Build-time WebP siblings — part of `npm run build:pages`, after `vite build`.
 *
 * Every public/stock/**\/*.jpg and public/hero/*.jpg gets a `<name>.webp`
 * written beside its copy in dist/ (never into public/: the JPEGs stay the
 * source of truth and the repo carries one encoding of each photograph).
 * The templates offer the sibling through <picture><source type="image/webp">
 * with the JPEG as the <img> fallback (pictureTag in src/components/ui.js;
 * webpURL in src/lib/media.js is the naming rule this step honours).
 *
 * Quality: 78 for stock (garment texture, read up close on the PDP), 72 for
 * the hero plates (sit under a parchment veil, so they can go softer). A
 * sibling already in dist/ and newer than its JPEG is left alone — a re-run
 * on a warm dist/ is a no-op — but `vite build` empties dist/, so the chain
 * always encodes fresh. Roughly 15-20 s for the current 120 files.
 *
 * Also the guard for src/lib/media.js: the width/height constants the
 * templates stamp on every <img> are checked here against the real files
 * (hero and brand exactly; stock within 10 % of 4:5) — a plate re-encoded
 * at a new size fails the build instead of shipping a wrong ratio.
 *
 *   npm run images            after a build; safe to re-run
 *   node scripts/images.mjs --check   verify the constants only, write nothing
 */
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { imageSize, BRAND_SIZES, HERO_SIZES, HERO_SIZE, STOCK_SIZE } from '../src/lib/media.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PUBLIC = join(ROOT, 'public');
const DIST = join(ROOT, 'dist');
const CHECK_ONLY = process.argv.includes('--check');
const QUALITY = { stock: 78, hero: 72, ebay: 82 };
const CONCURRENCY = 4;
const C = { red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', dim: '\x1b[2m', off: '\x1b[0m' };

const errors = [];
const warnings = [];
const posix = (p) => p.split(sep).join('/');

/* ---------------- sources ---------------- */

function walk(dir, rx = /\.jpe?g$/i) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && rx.test(d.name))
    .map((d) => join(d.parentPath ?? d.path, d.name));
}
const sources = [
  ...walk(join(PUBLIC, 'stock')).map((f) => ({ file: f, kind: 'stock' })),
  ...walk(join(PUBLIC, 'hero')).map((f) => ({ file: f, kind: 'hero' })),
  // The eBay-era carousels hold .webp frames; eBay's bulk upload fetches
  // JPEG/PNG only, so each gets a JPEG twin at dist/ebay/<slug>/NN.jpg for
  // scripts/ebay-csv.mjs to point at. Build output only, never committed.
  ...walk(join(PUBLIC, 'stock', 'carousel'), /\.webp$/i).map((f) => ({ file: f, kind: 'ebay' })),
];

/* ---------------- sharp ---------------- */

let sharp;
try {
  ({ default: sharp } = await import('sharp'));
} catch (err) {
  console.log(`${C.red}✖ sharp is not installed (npm i -D sharp): ${err.message}${C.off}`);
  process.exitCode = 1;
}

if (sharp) await run();

async function run() {
  console.log(`\n${C.dim}── Tour Archive · WebP siblings${CHECK_ONLY ? ' (check only)' : ''} ──${C.off}`);

  /* ---- 1. the size constants against disk ---- */
  const meta = async (rel) => {
    const f = join(PUBLIC, rel);
    if (!existsSync(f)) return null;
    const m = await sharp(f).metadata();
    return { width: m.width, height: m.height };
  };
  for (const rel of Object.keys(BRAND_SIZES)) {
    const m = await meta(rel);
    const want = BRAND_SIZES[rel];
    if (!m) warnings.push(`${rel}: listed in media.js BRAND_SIZES but not on disk`);
    else if (m.width !== want.width || m.height !== want.height)
      errors.push(`${rel} is ${m.width}x${m.height} on disk, media.js says ${want.width}x${want.height} — update BRAND_SIZES`);
  }
  for (const rel of Object.keys(HERO_SIZES)) {
    if (!existsSync(join(PUBLIC, rel))) warnings.push(`${rel}: listed in media.js HERO_SIZES but not on disk`);
  }
  let checked = 0;
  for (const { file, kind } of sources) {
    const rel = posix(relative(PUBLIC, file));
    const m = await meta(rel);
    if (!m) continue;
    checked += 1;
    const want = imageSize(rel);
    if (kind === 'hero') {
      if (!want || m.width !== want.width || m.height !== want.height)
        errors.push(`${rel} is ${m.width}x${m.height} on disk, media.js says ${want ? `${want.width}x${want.height}` : 'nothing'} — add it to HERO_SIZES (default ${HERO_SIZE.width}x${HERO_SIZE.height})`);
    } else {
      const ratio = m.width / m.height;
      const wantRatio = STOCK_SIZE.width / STOCK_SIZE.height;
      // 10 %: catches a landscape or square file, not the 1199x1500 hanger
      // shots that already ship (7 % off, cropped by the plate like the rest).
      if (Math.abs(ratio - wantRatio) / wantRatio > 0.1)
        warnings.push(`${rel} is ${m.width}x${m.height} — off the 4:5 plate by more than 10 % (object-fit: cover crops it)`);
    }
  }
  console.log(`${C.dim}   sizes: ${checked} photographs + ${Object.keys(BRAND_SIZES).length} brand files checked against media.js${C.off}`);

  /* ---- 2. encode ---- */
  let written = 0;
  let skipped = 0;
  let jpgBytes = 0;
  let webpBytes = 0;
  if (!CHECK_ONLY) {
    if (!existsSync(join(DIST, 'index.html'))) {
      errors.push('dist/ has no build — run `vite build` first (this step writes only into dist/)');
    } else {
      const t0 = Date.now();
      const queue = [...sources];
      const worker = async () => {
        for (let job = queue.shift(); job; job = queue.shift()) {
          const { file, kind } = job;
          const rel = relative(PUBLIC, file);
          const out = kind === 'ebay'
            ? join(DIST, 'ebay', relative(join(PUBLIC, 'stock', 'carousel'), file)).replace(/\.webp$/i, '.jpg')
            : join(DIST, rel).replace(/\.jpe?g$/i, '.webp');
          const src = statSync(file);
          jpgBytes += src.size;
          if (existsSync(out) && statSync(out).mtimeMs >= src.mtimeMs) {
            skipped += 1;
            webpBytes += statSync(out).size;
            continue;
          }
          try {
            mkdirSync(dirname(out), { recursive: true });
            const info = kind === 'ebay'
              ? await sharp(file).jpeg({ quality: QUALITY.ebay }).toFile(out)
              : await sharp(file).webp({ quality: QUALITY[kind], effort: 4 }).toFile(out);
            webpBytes += info.size;
            written += 1;
          } catch (err) {
            errors.push(`${posix(rel)}: ${err.message}`);
          }
        }
      };
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      const mb = (b) => `${(b / 1048576).toFixed(1)} MB`;
      console.log(
        `${C.dim}   ${written} written · ${skipped} up to date · ${((Date.now() - t0) / 1000).toFixed(1)} s${C.off}`
      );
      console.log(
        `${C.dim}   JPEG ${mb(jpgBytes)} → WebP ${mb(webpBytes)} (${jpgBytes ? Math.round((1 - webpBytes / jpgBytes) * 100) : 0} % smaller; both ship, the browser fetches one)${C.off}`
      );
    }
  }

  /* ---- report ---- */
  if (warnings.length) {
    console.log(`\n${C.yellow}⚠ ${warnings.length} warning(s)${C.off}`);
    warnings.forEach((w) => console.log(`   ${w}`));
  }
  if (errors.length) {
    console.log(`\n${C.red}✖ ${errors.length} problem(s)${C.off}`);
    errors.forEach((e) => console.log(`   ${e}`));
    console.log('');
    process.exitCode = 1;
    return;
  }
  console.log(`\n${C.green}✔ ${CHECK_ONLY ? 'image sizes agree with media.js' : 'WebP siblings in dist/'}${C.off}\n`);
}
