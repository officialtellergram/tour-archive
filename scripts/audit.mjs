/**
 * Navigation & data audit.
 *
 * The iteration loop for this build: every pass, run `npm run audit`. It reads
 * the route table out of main.js, harvests every internal href written anywhere
 * in src/, and proves that each one resolves — including dynamic segments,
 * which are checked against the actual inventory data.
 *
 * Exit code 1 on any error, so it can gate a build.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isSafeStockPath } from '../server/inventory.mjs';
import { MAX_BYTES as MAX_PHOTO_BYTES } from './lib/stock-constants.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');

const errors = [];
const warnings = [];
const notes = [];

/* ------------------------------------------------------------------ */
/* Gather files                                                        */
/* ------------------------------------------------------------------ */

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|html)$/.test(p)) out.push(p);
  }
  return out;
}

const files = [...walk(SRC), join(ROOT, 'index.html')];

/* ------------------------------------------------------------------ */
/* 1. Route table                                                      */
/* ------------------------------------------------------------------ */

const mainSrc = readFileSync(join(SRC, 'main.js'), 'utf8');
const routePatterns = [...mainSrc.matchAll(/^\s*route\(\s*'([^']+)'/gm)].map((m) => m[1]);

if (!routePatterns.length) errors.push('No routes found in src/main.js');

const compiled = routePatterns.map((pattern) => {
  const keys = [];
  const rx = pattern
    .split('/')
    .map((seg) => {
      if (seg.startsWith(':')) {
        keys.push(seg.slice(1));
        return '([^/]+)';
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { pattern, keys, rx: new RegExp(`^${rx || ''}/?$`) };
});

function resolve(path) {
  const clean = path.replace(/\/+$/, '') || '/';
  for (const r of compiled) {
    const m = clean.match(r.rx);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return { pattern: r.pattern, params };
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* 2. Inventory data                                                   */
/* ------------------------------------------------------------------ */

const data = await import(new URL('../src/data/collections.js', import.meta.url));
const { collections, items, journal } = data;

const collectionIds = new Set(collections.map((c) => c.id));
const itemIds = new Set(items.map((i) => i.id));
const journalIds = new Set(journal.map((j) => j.id));

const KNOWN_GARMENTS = new Set([
  'sweater', 'cardigan', 'vest', 'polo', 'rugby', 'windshirt', 'jacket', 'trousers', 'cap',
]);

/* data integrity */
for (const item of items) {
  const where = `item ${item.id}`;
  if (!collectionIds.has(item.collection))
    errors.push(`${where}: references unknown collection "${item.collection}"`);
  if (!KNOWN_GARMENTS.has(item.garment))
    errors.push(`${where}: garment "${item.garment}" has no silhouette in garment.js`);
  if (!Array.isArray(item.colorway) || item.colorway.length !== 3)
    errors.push(`${where}: colorway must be exactly 3 colours`);
  if (!item.market?.url) errors.push(`${where}: missing market comparable link`);
  else if (!/^https:\/\//.test(item.market.url))
    errors.push(`${where}: market link is not https — ${item.market.url}`);
  if (!item.measurements || !Object.keys(item.measurements).length)
    warnings.push(`${where}: no flat measurements`);
  if (item.sold && item.upcoming) errors.push(`${where}: cannot be both sold and upcoming`);
  if (typeof item.price !== 'number' || item.price <= 0)
    errors.push(`${where}: price must be a positive number`);
}

/*
 * Collections are research files and the items in collections.js are catalogue
 * RECORDS (enrichment for real listings), not displayed stock — displayed stock
 * comes from the photo manifest and the marketplaces at runtime. So the audit
 * checks editorial integrity here, not stock consistency.
 */
for (const c of collections) {
  if (!['live', 'archived', 'upcoming'].includes(c.status))
    errors.push(`collection ${c.id}: unknown status "${c.status}"`);
  if (!Array.isArray(c.palette) || c.palette.length !== 3)
    errors.push(`collection ${c.id}: palette must be exactly 3 colours`);
  if (!c.essay?.length) warnings.push(`collection ${c.id}: no essay copy`);
  if (!c.sources?.length) warnings.push(`collection ${c.id}: no cited sources`);
}

/* The photo manifest is displayed stock — hold it to the item standard. */
{
  const manifestPath = join(ROOT, 'public', 'stock', 'manifest.json');
  // Mirrors IMAGES_PROBE's slice(0, 8) in scripts/ebay-peek.mjs — the probe is
  // where the cap originates; it can't be imported out of a browser-injected string.
  const MAX_PHOTOS = 8;
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    for (const s of manifest.items || []) {
      const where = `stock ${s.id}`;
      if (s._missing) { warnings.push(`${where}: photo file is missing`); continue; }
      if (!s.file && !s.listingUrl)
        errors.push(`${where}: needs a photo file or a listingUrl — otherwise there is nothing to show or sell`);
      if (!Array.isArray(s.colorway) || s.colorway.length !== 3)
        errors.push(`${where}: colorway must be exactly 3 colours`);
      if (typeof s.price !== 'number' || s.price <= 0)
        errors.push(`${where}: price must be a positive number`);
      if (!KNOWN_GARMENTS.has(s.garment))
        errors.push(`${where}: garment "${s.garment}" has no silhouette in garment.js`);

      // The archived carousel: local files only, present on disk, capped like
      // the pull. ingest's oversize warner scans public/stock/ non-recursively
      // and cannot see carousel/ — so the warner for carousel frames lives here.
      if (s.photos !== undefined) {
        if (!Array.isArray(s.photos) || s.photos.some((p) => typeof p !== 'string')) {
          errors.push(`${where}: photos must be an array of stock-relative path strings`);
        } else {
          if (s.photos.length > MAX_PHOTOS)
            errors.push(`${where}: ${s.photos.length} carousel frames — the cap is ${MAX_PHOTOS}, same as the pull`);
          const seen = new Set();
          s.photos.forEach((p, i) => {
            if (!isSafeStockPath(p)) {
              errors.push(`${where}: photos[${i}] "${p}" must be a plain relative path under public/stock/ — hotlinked or absolute URLs die on relist`);
              return; // do not statSync a hostile path
            }
            if (seen.has(p)) warnings.push(`${where}: photos repeats "${p}" — prune the duplicate frame`);
            seen.add(p);
            try {
              // join() output is for the disk probe ONLY — every message uses
              // the manifest's own forward-slash string.
              const st = statSync(join(ROOT, 'public', 'stock', p));
              if (st.size > MAX_PHOTO_BYTES)
                warnings.push(`${where}: ${p} is ${(st.size / 1048576).toFixed(1)} MB — compress it; carousel frames ship with the site`);
            } catch {
              errors.push(`${where}: photos[${i}] "${p}" is not on disk under public/stock/ — that ships a broken image on a live product page`);
            }
          });
        }
      }
      const hasEbayListing =
        (s.channel === 'ebay' && s.listingUrl) ||
        (Array.isArray(s.listings) && s.listings.some((l) => l?.channel === 'ebay' && l.url));
      if (hasEbayListing && !(Array.isArray(s.photos) && s.photos.length))
        warnings.push(`${where}: eBay listing but no carousel yet — npm run photos archives its frames`);
    }
  } catch {
    warnings.push('public/stock/manifest.json missing or unreadable');
  }
}

/* ------------------------------------------------------------------ */
/* 3. Harvest every internal link                                      */
/* ------------------------------------------------------------------ */

const HREF_RX = /href=["']([^"']+)["']/g;
const linksSeen = new Map(); // path -> Set(sourceFile)

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const rel = relative(ROOT, file);
  for (const m of src.matchAll(HREF_RX)) {
    let href = m[1];
    if (!href || href.startsWith('#')) continue;
    if (/^(mailto:|tel:|data:)/i.test(href)) continue;
    // Vite build-time placeholders (asset paths, not routes)
    if (href.startsWith('%BASE_URL%')) continue;
    if (/^(https?:)?\/\//i.test(href)) {
      if (!/^https:/i.test(href) && !href.startsWith('//'))
        warnings.push(`${rel}: non-https external link — ${href}`);
      continue;
    }
    // Template-literal hrefs. Classify by the *shape* of the expression so new
    // call sites don't need the audit taught about them one at a time:
    //   ...url        → an external URL, skip
    //   ...href       → an already-audited internal nav href, skip
    //   <var>.id      → a dynamic id we can enumerate from the data
    if (href.includes('${')) {
      href = href
        .replace(/\$\{[^}]*\burl\b[^}]*\}/g, '__EXTERNAL__')
        .replace(/\$\{[^}]*\bhref\b[^}]*\}/g, '__NAVHREF__')
        .replace(/\$\{\s*(?:c|coll|collection)\.id\s*\}/g, '__COLLECTION__')
        .replace(/\$\{\s*(?:item|i)\.id\s*\}/g, '__ITEM__')
        .replace(/\$\{\s*j(?:ournal)?\.id\s*\}/g, '__JOURNAL__')
        .replace(/\$\{[^}]+\}/g, '__DYNAMIC__');
    }
    // These resolve at runtime to values audited at their own definition site.
    if (href.includes('__EXTERNAL__') || href.includes('__NAVHREF__')) continue;
    if (!href.startsWith('/')) {
      errors.push(`${rel}: relative href "${m[1]}" — routes must be absolute`);
      continue;
    }
    const path = href.split('#')[0].split('?')[0];
    if (!linksSeen.has(path)) linksSeen.set(path, new Set());
    linksSeen.get(path).add(rel);
  }
}

/* placeholder → real sample paths, so dynamic links get properly checked */
const SAMPLES = {
  __COLLECTION__: collections.map((c) => c.id),
  __ITEM__: items.map((i) => i.id),
  __JOURNAL__: journal.map((j) => j.id),
};

const reachable = new Set();

for (const [path, sources] of linksSeen) {
  const where = [...sources].join(', ');
  const placeholder = Object.keys(SAMPLES).find((k) => path.includes(k));

  const candidates = placeholder
    ? SAMPLES[placeholder].map((v) => path.replace(placeholder, v))
    : [path];

  for (const candidate of candidates) {
    if (candidate.includes('__DYNAMIC__')) {
      // can't statically prove the id; at least prove the shape routes
      const shape = candidate.replace(/__DYNAMIC__/g, 'sample-id');
      const hit = resolve(shape);
      if (!hit) errors.push(`${where}: link shape "${candidate}" matches no route`);
      else reachable.add(hit.pattern);
      continue;
    }
    const hit = resolve(candidate);
    if (!hit) {
      errors.push(`${where}: dead link "${candidate}" — no route matches`);
      continue;
    }
    reachable.add(hit.pattern);

    // dynamic segments must exist in the data
    if (hit.pattern === '/collections/:id' && !collectionIds.has(hit.params.id))
      errors.push(`${where}: link to unknown collection "${hit.params.id}"`);
    if (hit.pattern === '/item/:id' && !itemIds.has(hit.params.id))
      errors.push(`${where}: link to unknown item "${hit.params.id}"`);
    if (hit.pattern === '/journal/:id' && !journalIds.has(hit.params.id))
      errors.push(`${where}: link to unknown journal entry "${hit.params.id}"`);
  }
}

/* ------------------------------------------------------------------ */
/* 4. Orphan routes — declared but nothing links to them               */
/* ------------------------------------------------------------------ */

for (const p of routePatterns) {
  if (!reachable.has(p)) warnings.push(`route "${p}" is declared but nothing links to it`);
}

/* ------------------------------------------------------------------ */
/* 5. Every item and collection must be reachable by navigation        */
/* ------------------------------------------------------------------ */

const collectionLinked = [...linksSeen.keys()].some((p) => p.includes('__COLLECTION__'));
const itemLinked = [...linksSeen.keys()].some((p) => p.includes('__ITEM__'));
if (!collectionLinked) errors.push('No page generates links to individual collections');
if (!itemLinked) errors.push('No page generates links to individual items');

/* ------------------------------------------------------------------ */
/* 6. Page modules must export what main.js imports                    */
/* ------------------------------------------------------------------ */

const importRx = /import\s+\{([^}]+)\}\s+from\s+'(\.\/[^']+)'/g;
for (const m of mainSrc.matchAll(importRx)) {
  const names = m[1].split(',').map((s) => s.trim()).filter(Boolean);
  const modPath = join(SRC, m[2]);
  let modSrc;
  try {
    modSrc = readFileSync(modPath, 'utf8');
  } catch {
    errors.push(`main.js imports missing module ${m[2]}`);
    continue;
  }
  for (const spec of names) {
    // `init as initStore` — the module must export the left-hand name.
    const name = spec.split(/\s+as\s+/)[0].trim();
    const declared = new RegExp(
      `export\\s+(?:async\\s+)?(?:function|const|let|var|class)\\s+${name}\\b`
    );
    // `export { a, b as c }` re-export lists, including `export { x } from '…'`.
    const listed = new RegExp(`export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`, 's');
    if (!declared.test(modSrc) && !listed.test(modSrc)) {
      errors.push(`${m[2]} does not export "${name}"`);
    }
  }
}

/* ------------------------------------------------------------------ */
/* 7. Secret names must never appear under src/ — the robot's password  */
/* and the Supabase master key belong to .env and the robot script only */
/* ------------------------------------------------------------------ */

for (const file of files) {
  if (!file.includes('src')) continue;
  const src = readFileSync(file, 'utf8');
  const rel = relative(ROOT, file);
  for (const name of ['ROBOT_PASSWORD', 'service_role', 'SERVICE_ROLE']) {
    if (src.includes(name)) errors.push(`${rel}: references ${name} — that credential must never reach the bundle`);
  }
  if (src.includes('signInWithPassword') && !rel.endsWith(join('curate', 'data.js'))) {
    errors.push(`${rel}: signInWithPassword outside src/curate/data.js — auth has one home`);
  }
}

/* ------------------------------------------------------------------ */
/* Report                                                              */
/* ------------------------------------------------------------------ */

notes.push(`${routePatterns.length} routes · ${collections.length} collections · ${items.length} items · ${journal.length} journal entries`);
notes.push(`${linksSeen.size} distinct internal link targets checked`);

const C = { red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', dim: '\x1b[2m', off: '\x1b[0m' };

console.log(`\n${C.dim}── Tour Archive · navigation audit ──${C.off}`);
notes.forEach((n) => console.log(`${C.dim}   ${n}${C.off}`));

if (warnings.length) {
  console.log(`\n${C.yellow}⚠ ${warnings.length} warning(s)${C.off}`);
  warnings.forEach((w) => console.log(`   ${w}`));
}

if (errors.length) {
  console.log(`\n${C.red}✖ ${errors.length} error(s)${C.off}`);
  errors.forEach((e) => console.log(`   ${e}`));
  console.log('');
  process.exit(1);
}

console.log(`\n${C.green}✔ navigation clean — every internal link resolves${C.off}\n`);
