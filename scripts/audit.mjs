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
import {
  MAX_BYTES as MAX_PHOTO_BYTES,
  BUYBOX_KEY_RX,
  CONTAMINATION_RX,
  SPEC_KEY_MAX,
  SPEC_VALUE_MAX,
} from './lib/stock-constants.mjs';

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
  'memorabilia', // non-garment stock (framed pieces, programmes) — TC26 drop
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
    const skuSeen = new Map(); // canonical form -> first entry id
    const anySku = (manifest.items || []).some((e) => typeof e.sku === 'string' && e.sku.trim());
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

      // Listing description: robot-owned plain text. '<' is the loud tripwire
      // for the plain-text-only contract — reduction happens at pull, escaping
      // at render.
      if (s.description !== undefined) {
        if (!Array.isArray(s.description) || s.description.some((d) => typeof d !== 'string' || !d.trim())) {
          errors.push(`${where}: description must be an array of non-empty strings — plain-text paragraphs only`);
        } else {
          s.description.forEach((d, i) => {
            if (d.includes('<'))
              errors.push(`${where}: description[${i}] contains '<' — the manifest holds plain text only; HTML dies at pull time, entities are escaped at render`);
          });
        }
      }
      if (hasEbayListing && !(Array.isArray(s.description) && s.description.length))
        warnings.push(`${where}: eBay listing but no description yet — npm run descriptions archives the cofounder's copy`);

      // Item specifics: robot-owned mirror of eBay's About this item. Same
      // plain-text contract as description; buybox keys mean the pull scoped
      // the wrong module.
      if (s.specifics !== undefined) {
        if (!s.specifics || typeof s.specifics !== 'object' || Array.isArray(s.specifics)) {
          errors.push(`${where}: specifics must be a plain object of label → value strings`);
        } else {
          const rows = Object.entries(s.specifics);
          if (rows.length > 30)
            warnings.push(`${where}: ${rows.length} specifics rows — that reads like a page-wide harvest, not About this item`);
          rows.forEach(([k, v]) => {
            if (!k.trim() || typeof v !== 'string' || !v.trim()) {
              errors.push(`${where}: specifics["${k}"] must be a non-empty string — plain-text rows only`);
              return;
            }
            if (k.includes('<') || v.includes('<'))
              errors.push(`${where}: specifics["${k}"] contains '<' — the manifest holds plain text only`);
            if (BUYBOX_KEY_RX.test(k.trim()))
              errors.push(`${where}: specifics["${k}"] is buybox data (Shipping/Returns/Payments), not an item specific — the pull scoped the wrong module`);
            if (CONTAMINATION_RX.test(v))
              errors.push(`${where}: specifics["${k}"] carries eBay chrome ('Read more' / condition definitions) — the pull's junk-strip failed`);
            if (k.length > SPEC_KEY_MAX)
              errors.push(`${where}: specifics key "${k.slice(0, SPEC_KEY_MAX)}…" is over ${SPEC_KEY_MAX} chars — labels are short; that is harvested prose`);
            if (v.length > SPEC_VALUE_MAX)
              errors.push(`${where}: specifics["${k}"] is over ${SPEC_VALUE_MAX} chars — values are facts; that is harvested prose`);
          });
          // Hand-recorded editorial vs the listing's own facts: hand wins by
          // contract, but a disagreement is worth a human look.
          const specSize = s.specifics.Size;
          if (
            typeof s.size === 'string' && s.size.trim() && typeof specSize === 'string' &&
            !['see listing', 'see photos', '—', ''].includes(s.size.trim().toLowerCase()) &&
            s.size.trim().toLowerCase() !== specSize.trim().toLowerCase()
          )
            warnings.push(`${where}: hand size "${s.size}" disagrees with the eBay listing's "${specSize}" — reconcile by hand`);
        }
      }
      if (hasEbayListing && !(s.specifics && typeof s.specifics === 'object' && Object.keys(s.specifics).length))
        warnings.push(`${where}: eBay listing but no item specifics yet — npm run descriptions pulls them with the copy`);

      // sku: cofounder-owned, recorded VERBATIM from Seller Hub. Never normalized.
      if (s.sku !== undefined) {
        if (typeof s.sku !== 'string' || !s.sku.trim()) {
          errors.push(`${where}: sku must be a non-empty string — recorded verbatim from Seller Hub`);
        } else {
          // TA_<SERIES>_NN — series is letters plus optional digits (GS general
          // stock, TC26 the Tour Championship drop). Anything else (TS_GA_08
          // typo class) still warns.
          if (!/^TA[\s._-]?[A-Z]{2}\d{0,2}[\s._-]?\d{2}$/i.test(s.sku))
            warnings.push(`${where}: sku "${s.sku}" is off the TA-<SERIES>-NN pattern — kept verbatim by design; fix the label on eBay first, then hand-edit here`);
          const key = s.sku.toUpperCase().replace(/[\s._-]/g, '');
          if (skuSeen.has(key))
            errors.push(`${where}: sku "${s.sku}" duplicates ${skuSeen.get(key)} — two pieces cannot share a Seller Hub label`);
          else skuSeen.set(key, s.id);
        }
      }
      if (anySku && hasEbayListing && !s.sku)
        warnings.push(`${where}: eBay listing but no sku — the Seller Hub mapping is seeded; record this one`);
    }
  } catch {
    warnings.push('public/stock/manifest.json missing or unreadable');
  }
}

/* Hero backdrop plates — audit harvests hrefs, never img srcs, so a typo'd
   or deleted plate would otherwise ship a blank slide green. */
{
  const homeSrc = readFileSync(join(SRC, 'pages', 'home.js'), 'utf8');
  const m = homeSrc.match(/const HERO_BACKDROPS\s*=\s*\[([\s\S]*?)\]/);
  if (!m) {
    errors.push('home.js: HERO_BACKDROPS is not defined — home() would throw');
  } else {
    const plates = [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]);
    if (plates.length !== 4)
      errors.push(`home.js: HERO_BACKDROPS lists ${plates.length} plates — the rotation is built for 4`);
    for (const p of plates) {
      const clean = p.split('?')[0];
      if (!clean.startsWith('hero/')) {
        errors.push(`HERO_BACKDROPS "${p}" must be a hero/-relative path under public/`);
        continue;
      }
      if (!/\?v=\d+$/.test(p))
        warnings.push(`HERO_BACKDROPS "${p}" carries no ?v — Pages serves public/ unhashed behind a 600s cache; a re-encode would ship stale`);
      try {
        const st = statSync(join(ROOT, 'public', ...clean.split('/')));
        if (st.size > 200 * 1024)
          warnings.push(`${clean} is ${(st.size / 1024).toFixed(0)} KB — the plate budget is 200 KB; re-encode before it ships`);
      } catch {
        errors.push(`HERO_BACKDROPS "${clean}" is not on disk under public/ — that ships a blank slide behind the hero`);
      }
    }
    const idxSrc = readFileSync(join(ROOT, 'index.html'), 'utf8');
    if (plates[0] && !idxSrc.includes(plates[0]))
      errors.push(`index.html does not reference HERO_BACKDROPS[0] "${plates[0]}" — the preload and slide 1 have drifted apart`);
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
