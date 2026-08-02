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

for (const c of collections) {
  const stock = items.filter((i) => i.collection === c.id);
  if (!stock.length) errors.push(`collection ${c.id}: has no inventory`);
  if (!['live', 'archived', 'upcoming'].includes(c.status))
    errors.push(`collection ${c.id}: unknown status "${c.status}"`);
  if (!Array.isArray(c.palette) || c.palette.length !== 3)
    errors.push(`collection ${c.id}: palette must be exactly 3 colours`);
  if (!c.essay?.length) warnings.push(`collection ${c.id}: no essay copy`);
  if (!c.sources?.length) warnings.push(`collection ${c.id}: no cited sources`);
  // status vs inventory consistency
  const available = stock.filter((i) => !i.sold && !i.upcoming).length;
  if (c.status === 'archived' && available)
    errors.push(`collection ${c.id}: marked archived but ${available} piece(s) still available`);
  if (c.status === 'upcoming' && stock.some((i) => !i.upcoming))
    errors.push(`collection ${c.id}: marked upcoming but has non-upcoming pieces`);
  if (c.status === 'live' && !available)
    errors.push(`collection ${c.id}: marked live but nothing is available`);
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
