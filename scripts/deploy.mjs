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

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
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
    for (const secret of ['EBAY_CLIENT_SECRET', 'DEPOP_API_KEY', 'ROBOT_PASSWORD', 'service_role', 'STRIPE_SECRET_KEY', 'sk_test_', 'sk_live_', 'buy.stripe.com/test_']) {
      if (src.includes(secret)) errors.push(`${file} references ${secret} — secrets must stay off the site`);
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
 * paths, so a copy of the SPA shell is what stops every deep link from
 * erroring on direct load or refresh. This is the single most common way a
 * client-routed site ships broken.
 *
 * Since the prerender, index.html is the HOME page (filled outlet, home
 * metadata), so the two are no longer byte-identical: 404.html must be the
 * pristine shell — empty outlet, no data-prerendered stamp — pointing at the
 * same hashed bundles as the pages, or a fresh route would boot stale code.
 */
if (existsSync(DIST)) {
  const fallback = join(DIST, '404.html');
  check(existsSync(fallback), 'dist/404.html is missing — deep links would 404 on GitHub Pages');
  if (existsSync(fallback) && existsSync(join(DIST, 'index.html'))) {
    const fb = readFileSync(fallback, 'utf8');
    const idx = readFileSync(join(DIST, 'index.html'), 'utf8');
    check(!fb.includes(' data-prerendered='), 'dist/404.html is a prerendered page — the SPA fallback must be the empty shell');
    check(fb.includes('<main id="main" data-outlet tabindex="-1"></main>'), 'dist/404.html has a filled outlet — the fallback must boot the router into an empty page');
    const bundles = (html) => (html.match(/\/assets\/index-[\w-]+\.(?:js|css)/g) || []).sort().join(',');
    check(bundles(fb) === bundles(idx), 'dist/404.html references different bundles than index.html — the SPA fallback would serve stale code');
  }
}

/* ---------------- 2b. prerendered routes, sitemap, robots ---------------- */

/*
 * scripts/prerender.mjs writes real HTML for every indexable route so Pages
 * answers them with 200 instead of the 404 fallback. What ships must be
 * complete and consistent: every sitemap URL a file, every file in the
 * sitemap, no test-mode checkout on any page, one <h1> per item page.
 */
if (existsSync(DIST)) {
  const sitemapPath = join(DIST, 'sitemap.xml');
  const robotsPath = join(DIST, 'robots.txt');
  check(existsSync(join(DIST, 'archive', 'index.html')), 'dist/archive/index.html is missing — run `npm run build:pages` (the prerender writes it)');
  check(existsSync(sitemapPath), 'dist/sitemap.xml is missing — the prerender writes it');
  check(existsSync(robotsPath), 'dist/robots.txt is missing — the prerender writes it');

  // every prerendered page on disk
  const pages = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name === 'index.html' && readFileSync(p, 'utf8').includes(' data-prerendered=')) pages.push(p);
    }
  };
  walk(DIST);

  let itemPages = 0;
  for (const p of pages) {
    const html = readFileSync(p, 'utf8');
    const rel = relative(DIST, p).split(sep).join('/');
    if (html.includes('buy.stripe.com/test_'))
      errors.push(`${rel} carries a TEST-mode Stripe link — a prerendered page would put play-money checkout in front of a buyer`);
    if (!/<link rel="canonical" href="https:\/\/tourarchive\.us(\/[^"]*)?" \/>/.test(html))
      errors.push(`${rel} has no canonical link on the tourarchive.us origin`);
    if (html.includes('href="https://www.tourarchive.us'))
      errors.push(`${rel} emits a www URL — the canonical origin is https://tourarchive.us`);
    if (rel.startsWith('item/')) {
      itemPages += 1;
      const h1 = (html.match(/<h1[\s>]/g) || []).length;
      if (h1 !== 1) errors.push(`${rel} has ${h1} <h1> elements — an item page needs exactly one`);
    }
  }

  if (existsSync(sitemapPath)) {
    const xml = readFileSync(sitemapPath, 'utf8');
    check(xml.startsWith('<?xml') && xml.includes('<urlset') && xml.trimEnd().endsWith('</urlset>'), 'dist/sitemap.xml is not a sitemap');
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    check(locs.length === pages.length, `sitemap lists ${locs.length} URL(s) but ${pages.length} page(s) were prerendered`);
    check(new Set(locs).size === locs.length, 'sitemap repeats a URL');
    for (const loc of locs) {
      if (!loc.startsWith('https://tourarchive.us/')) {
        errors.push(`sitemap URL ${loc} is off the canonical origin`);
        continue;
      }
      const route = loc.slice('https://tourarchive.us'.length).replace(/\/+$/, '');
      const file = route ? join(DIST, ...route.split('/').filter(Boolean), 'index.html') : join(DIST, 'index.html');
      if (!existsSync(file)) errors.push(`sitemap URL ${loc} has no prerendered file`);
    }
    notes.push(`prerender: ${pages.length} page(s), ${itemPages} item page(s), ${locs.length} sitemap URL(s)`);
  }

  if (existsSync(robotsPath)) {
    const robots = readFileSync(robotsPath, 'utf8');
    check(/^Sitemap: https:\/\/tourarchive\.us\/sitemap\.xml$/m.test(robots), 'robots.txt does not point at https://tourarchive.us/sitemap.xml');
    check(/^Disallow: \/curate$/m.test(robots), 'robots.txt does not keep crawlers out of /curate');
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
    const raw = readFileSync(snapshot, 'utf8');
    // A TEST-mode payment link in the shipped snapshot would put a play-money
    // checkout in front of a real buyer. Hard stop, before any other check.
    check(
      !raw.includes('buy.stripe.com/test_'),
      'the inventory snapshot carries TEST-mode Stripe links — mint against the live key before deploying'
    );
    const data = JSON.parse(raw);
    check(Array.isArray(data.items) && data.items.length > 0, 'the inventory snapshot has no items');
    check(Array.isArray(data.collections) && data.collections.length > 0, 'the inventory snapshot has no collections');

    for (const item of data.items) {
      if (item.syndicated && !item.sold && !item.upcoming && !/^https:\/\//.test(item.market?.url || '')) {
        errors.push(`snapshot item ${item.id} is buyable but has no https checkout link`);
        break;
      }
    }

    // Canary: the featured event's collection must exist in what ships. A stale
    // editor buffer once reverted collections.js between commits and `git add -A`
    // swept it into an unrelated commit — deleting the flagship Tour Championship
    // page while every routing and render check stayed green.
    try {
      const { featuredEvent } = await import('../src/data/events.js');
      const ev = featuredEvent();
      if (ev && !data.collections.some((c) => c.id === ev.collection)) {
        errors.push(
          `the featured event's collection "${ev.collection}" is missing from the snapshot — data file reverted?`
        );
      }
    } catch (err) {
      warnings.push(`could not verify featured collection: ${err.message}`);
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
check(/^\.env\*?$/m.test(gitignore), '.env is not gitignored — real credentials could be committed');
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
