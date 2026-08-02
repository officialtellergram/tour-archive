/**
 * Deploy check — the fifth leg of the loop.
 *
 * Catches the class of failure that passes every other check and then breaks in
 * production: a missing SPA fallback (every route but "/" 404s on refresh), a
 * function that doesn't load, a secret about to be committed, or a build that
 * points at localhost.
 *
 * Runs against the built output, so `npm run build` first.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');

const errors = [];
const warnings = [];
const notes = [];

const check = (cond, msg) => { if (!cond) errors.push(msg); };

/* ---------------- 1. build output ---------------- */

if (!existsSync(DIST)) {
  errors.push('dist/ does not exist — run `npm run build` first');
} else {
  const indexPath = join(DIST, 'index.html');
  check(existsSync(indexPath), 'dist/index.html is missing');

  if (existsSync(indexPath)) {
    const html = readFileSync(indexPath, 'utf8');
    check(/<script[^>]+type="module"/.test(html), 'dist/index.html has no module script');
    check(/\/assets\/index-[\w-]+\.js/.test(html), 'dist/index.html does not reference a hashed JS bundle');
    check(/\/assets\/index-[\w-]+\.css/.test(html), 'dist/index.html does not reference a hashed CSS bundle');
    check(!html.includes('localhost:518'), 'dist/index.html hard-codes a localhost URL');
  }

  const assets = existsSync(join(DIST, 'assets')) ? readdirSync(join(DIST, 'assets')) : [];
  check(assets.length > 0, 'dist/assets/ is empty');

  // The bundle must not carry a dev-only API host, or the deploy calls a machine
  // that isn't there and silently falls back to the seed catalogue.
  const js = assets.filter((f) => f.endsWith('.js'));
  for (const file of js) {
    const src = readFileSync(join(DIST, 'assets', file), 'utf8');
    if (src.includes('localhost:5181')) {
      errors.push(`${file} hard-codes http://localhost:5181 — the deploy would call a dev machine`);
    }
    for (const secret of ['EBAY_CLIENT_SECRET', 'DEPOP_API_KEY']) {
      if (src.includes(secret)) errors.push(`${file} references ${secret} — secrets must stay server-side`);
    }

    // The snapshot URL must be a clean path join. A base without a trailing
    // slash once shipped "/repo-nameapi/inventory.json" — a 404 that degrades
    // silently to the seed catalogue, so nothing else catches it.
    const snapRef = src.match(/[`"']([^`"']*api\/inventory\.json)[`"']/)?.[1];
    const isDynamicJoin = snapRef && /[{}]/.test(snapRef); // `${base}api/…` — normalized at runtime
    if (snapRef && !isDynamicJoin && !/(^|\/)api\/inventory\.json$/.test(snapRef)) {
      errors.push(`${file} fetches a malformed snapshot URL "${snapRef}" — base path joined without a slash`);
    }
  }
  notes.push(`dist: ${assets.length} asset(s), ${js.length} script bundle(s)`);
}

/* ---------------- 2. SPA fallback ---------------- */

/*
 * GitHub Pages has no redirect rules. It does serve 404.html for unmatched
 * paths, so an identical copy of index.html is what stops every deep link from
 * erroring on direct load or refresh. This is the single most common way a
 * client-routed site ships broken.
 */
if (existsSync(DIST)) {
  const fallback = join(DIST, '404.html');
  check(existsSync(fallback), 'dist/404.html is missing — deep links would 404 on GitHub Pages');
  if (existsSync(fallback) && existsSync(join(DIST, 'index.html'))) {
    const same =
      readFileSync(fallback, 'utf8') === readFileSync(join(DIST, 'index.html'), 'utf8');
    check(same, 'dist/404.html differs from index.html — the SPA fallback would serve stale markup');
  }
}

/* ---------------- 3. base path consistency ---------------- */

if (existsSync(join(DIST, 'index.html'))) {
  const html = readFileSync(join(DIST, 'index.html'), 'utf8');
  const assetHref = html.match(/(?:src|href)="([^"]*\/assets\/index-[\w-]+\.js)"/)?.[1] || '';
  const base = process.env.BASE_PATH || '/';
  if (base !== '/' && !assetHref.startsWith(base)) {
    errors.push(
      `BASE_PATH is "${base}" but assets resolve to "${assetHref}" — a project-page deploy would 404 on every asset`
    );
  }
  notes.push(`base path: ${base} (assets at ${assetHref || '?'})`);
}

/* ---------------- 4. inventory snapshot ---------------- */

/*
 * GitHub Pages can't run the API, so stock ships as a build-time snapshot. If
 * it's missing the site silently falls back to the curated catalogue — which
 * looks fine and quietly drops every marketplace listing.
 */
const snapshot = join(DIST, 'api', 'inventory.json');
if (!existsSync(snapshot)) {
  warnings.push('dist/api/inventory.json is missing — run `npm run build:pages`; the site would fall back to the catalogue');
} else {
  try {
    const data = JSON.parse(readFileSync(snapshot, 'utf8'));
    check(Array.isArray(data.items) && data.items.length > 0, 'the inventory snapshot has no items');
    check(Array.isArray(data.collections) && data.collections.length > 0, 'the inventory snapshot has no collections');

    for (const item of data.items) {
      if (item.syndicated && !item.sold && !item.upcoming && !/^https:\/\//.test(item.market?.url || '')) {
        errors.push(`snapshot item ${item.id} is buyable but has no https checkout link`);
        break;
      }
    }

    const kb = (readFileSync(snapshot).length / 1024).toFixed(0);
    notes.push(
      `snapshot: ${data.items.length} items, ${data.counts?.syndicated ?? 0} syndicated, ${kb} KB`
    );
    if (data.sources?.some((s) => s.mock)) {
      warnings.push('the snapshot holds demo fixtures (MOCK_CHANNELS=1), not live marketplace stock');
    }
  } catch (err) {
    errors.push(`the inventory snapshot is unreadable: ${err.message}`);
  }
}

/* ---------------- 5. secrets ---------------- */

const gitignore = existsSync(join(ROOT, '.gitignore'))
  ? readFileSync(join(ROOT, '.gitignore'), 'utf8')
  : '';
check(/^\.env$/m.test(gitignore), '.env is not gitignored — real credentials could be committed');
check(/^dist\/?$/m.test(gitignore), 'dist/ is not gitignored');

if (existsSync(join(ROOT, '.env'))) {
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  if (/EBAY_CLIENT_SECRET=\S/.test(env) || /DEPOP_API_KEY=\S/.test(env)) {
    warnings.push('.env holds real credentials — confirm it is gitignored before pushing (it is)');
  }
  if (/MOCK_CHANNELS=1/.test(env)) {
    notes.push('MOCK_CHANNELS=1 locally — set it on Netlify too if you want the demo stock there');
  }
}

check(existsSync(join(ROOT, '.env.example')), '.env.example is missing — nobody can configure a deploy');

/* ---------------- report ---------------- */

const C = { red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', dim: '\x1b[2m', off: '\x1b[0m' };
console.log(`\n${C.dim}── Tour Archive · deploy check ──${C.off}`);
notes.forEach((n) => console.log(`${C.dim}   ${n}${C.off}`));

if (warnings.length) {
  console.log(`\n${C.yellow}⚠ ${warnings.length} warning(s)${C.off}`);
  warnings.forEach((w) => console.log(`   ${w}`));
}
if (errors.length) {
  console.log(`\n${C.red}✖ ${errors.length} problem(s)${C.off}`);
  errors.forEach((e) => console.log(`   ${e}`));
  console.log('');
  process.exit(1);
}
console.log(`\n${C.green}✔ ready to deploy${C.off}\n`);
