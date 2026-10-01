/**
 * Prerender — real HTML for every indexable route.
 *
 * GitHub Pages serves a client-routed site through 404.html, with HTTP 404,
 * for every path but "/". A crawler that respects status codes (all of them)
 * therefore never indexes /archive, a collection or a piece. This script,
 * run by `npm run build:pages` after the Vite build and the inventory
 * snapshot, writes dist/<route>/index.html for every route worth indexing,
 * so Pages answers each with 200 and the page's own markup.
 *
 * Each file is the built dist/index.html shell with:
 *   - the header, outlet and footer filled with exactly the strings the SPA
 *     renders at boot (same page functions, same chrome, fed the same
 *     snapshot through store.hydrate()) — each slot stamped with the hash of
 *     its string so the router leaves the DOM alone when it matches
 *     (src/lib/router.js render(), src/components/chrome.js mountChrome());
 *   - <title>, description, canonical, Open Graph, Twitter card;
 *   - JSON-LD (Organization + WebSite, Product, CollectionPage, WebPage,
 *     BreadcrumbList), every block parsed back before it is written;
 *   - an inline <style data-prerender-motion> holding the first-view
 *     elements at opacity 0 so a JS-rendering crawler sees the page the way a
 *     visitor does (nothing flashes visible → hidden → animated), and a
 *     <noscript> restore so a no-JS fetch sees everything;
 *   - <html data-prerendered="<route>">.
 * Plus dist/sitemap.xml and dist/robots.txt.
 *
 * Not prerendered: /curate and /curate/review (team only), /journal* (display-
 * stripped), and the 404. Those keep the SPA fallback, 404 status and all.
 *
 * Runs in Node under the same DOM shim as the render smoke. Stand-alone:
 *   node scripts/prerender.mjs                 every route
 *   node scripts/prerender.mjs item/stock-x    just that route (no sitemap);
 *                                              a leading slash is optional
 *                                              (Git Bash rewrites "/x")
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installDomShim, setShimLocation } from './lib/dom-shim.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const C = { red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', dim: '\x1b[2m', off: '\x1b[0m' };

const errors = [];
const warnings = [];

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

/* Deploy base, normalised exactly as vite.config.js does. The site lives at
   "/" on the custom domain; the rewrite below only exists so a project-page
   build ("/repo/") is not silently wrong. */
const BASE = `/${(process.env.BASE_PATH || '/').replace(/^\/+|\/+$/g, '')}/`.replace('//', '/');

const only = process.argv
  .slice(2)
  .filter((a) => !a.startsWith('-'))
  .map((a) => `/${a.replace(/^\/+/, '')}`.replace(/\/+$/, '') || '/');

const indexPath = join(DIST, 'index.html');
const fallbackPath = join(DIST, '404.html');
if (!existsSync(indexPath)) {
  console.log(`${C.red}✖ dist/index.html is missing — run \`vite build\` first${C.off}`);
  process.exitCode = 1;
} else {
  await main();
}

async function main() {
  /* The shell is the pristine Vite output. A second run finds dist/index.html
     already prerendered as the home page, so fall back to 404.html, which is
     the same shell and is never touched here. */
  let shell = readFileSync(indexPath, 'utf8');
  if (shell.includes(' data-prerendered=')) {
    if (!existsSync(fallbackPath) || readFileSync(fallbackPath, 'utf8').includes(' data-prerendered=')) {
      console.log(`${C.red}✖ no pristine shell in dist/ — rebuild (npm run build:pages)${C.off}`);
      process.exitCode = 1;
      return;
    }
    shell = readFileSync(fallbackPath, 'utf8');
  }

  const snapshotPath = join(DIST, 'api', 'inventory.json');
  if (!existsSync(snapshotPath)) {
    console.log(`${C.red}✖ dist/api/inventory.json is missing — run scripts/snapshot.mjs first${C.off}`);
    process.exitCode = 1;
    return;
  }
  const payload = JSON.parse(readFileSync(snapshotPath, 'utf8'));

  /* Photo pull dates for <lastmod>: the mapper strips the underscored stamps
     from the snapshot, so they are read off the manifest itself. */
  const pulled = new Map();
  try {
    const manifest = JSON.parse(readFileSync(join(ROOT, 'public', 'stock', 'manifest.json'), 'utf8'));
    for (const e of manifest.items || []) if (e.id && e._photosPulled) pulled.set(e.id, e._photosPulled);
  } catch {
    warnings.push('public/stock/manifest.json unreadable — item <lastmod> falls back to the build date');
  }

  /* -------------------------------------------------------------- */
  /* The site's own modules, under the DOM shim                      */
  /* -------------------------------------------------------------- */

  installDomShim({ origin: 'https://tourarchive.us' });

  const store = await import('../src/data/store.js');
  const { hashHTML } = await import('../src/lib/router.js');
  const { headerHTML, footerHTML } = await import('../src/components/chrome.js');
  const { home } = await import('../src/pages/home.js');
  const { collectionsIndex, collectionDetail } = await import('../src/pages/collections.js');
  const { archive } = await import('../src/pages/archive.js');
  const { product } = await import('../src/pages/product.js');
  const { mission, sell, sizing, privacy, terms } = await import('../src/pages/house.js');
  const seo = await import('../src/data/seo.js');

  store.hydrate(payload);
  const { SITE } = seo;
  const ORIGIN = SITE.origin;
  const builtAt = new Date().toISOString();
  const buildDay = builtAt.slice(0, 10);

  /* -------------------------------------------------------------- */
  /* Route table                                                     */
  /* -------------------------------------------------------------- */

  const staticPage = (route, render) => ({
    route,
    render,
    title: seo.pageTitle(route),
    description: seo.describe(route),
    kind: route === '/' ? 'home' : 'page',
    lastmod: builtAt,
  });

  const pages = [
    staticPage('/', home),
    staticPage('/collections', collectionsIndex),
    staticPage('/archive', archive),
    staticPage('/mission', mission),
    staticPage('/sell', sell),
    staticPage('/sizing', sizing),
    staticPage('/privacy', privacy),
    staticPage('/terms', terms),
    ...store.collections().map((c) => ({
      route: `/collections/${c.id}`,
      render: () => collectionDetail({ id: c.id }),
      title: c.name,
      description: seo.describe(`/collections/${c.id}`, c),
      kind: 'collection',
      record: c,
      lastmod: builtAt,
    })),
    // Every item the snapshot ships, sold ones included — a sold page is the
    // archive record, and the URL was shared while it was for sale.
    ...store.items().map((i) => ({
      route: `/item/${i.id}`,
      render: () => product({ id: i.id }),
      title: i.name,
      description: seo.describe(`/item/${i.id}`, i),
      kind: 'item',
      record: i,
      lastmod: pulled.get(i.id) || buildDay,
    })),
  ];

  const selected = only.length ? pages.filter((p) => only.includes(p.route)) : pages;
  for (const r of only) {
    if (!pages.some((p) => p.route === r)) errors.push(`"${r}" is not a prerendered route`);
  }

  /* -------------------------------------------------------------- */
  /* Render                                                          */
  /* -------------------------------------------------------------- */

  const written = [];
  for (const page of selected) {
    try {
      const html = renderPage(page);
      const out = page.route === '/' ? indexPath : join(DIST, ...page.route.split('/').filter(Boolean), 'index.html');
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, html, 'utf8');
      written.push(page);
    } catch (err) {
      errors.push(`${page.route}: ${err.message}`);
    }
  }

  if (!only.length) {
    writeFileSync(join(DIST, 'sitemap.xml'), sitemapXML(written), 'utf8');
    writeFileSync(join(DIST, 'robots.txt'), robotsTXT(), 'utf8');
  }

  /* -------------------------------------------------------------- */
  /* Page assembly                                                   */
  /* -------------------------------------------------------------- */

  function renderPage(page) {
    setShimLocation(page.route, '');
    // The exact strings the SPA renders — hashed before any base rewrite of
    // hrefs, because the router hashes the handler's string, not the DOM.
    const header = withAssetBase(headerHTML());
    const footer = withAssetBase(footerHTML());
    const body = withAssetBase(page.render());
    if (typeof body !== 'string' || body.trim().length < 100) throw new Error('rendered an empty view');
    if (body.includes('${') || body.includes('undefined,') || />\s*undefined\s*</.test(body))
      throw new Error('template leak in the rendered view');

    const desc = page.description;
    if (desc.length < seo.DESC_MIN || desc.length > seo.DESC_MAX)
      warnings.push(`${page.route}: description is ${desc.length} chars (window ${seo.DESC_MIN}–${seo.DESC_MAX})`);
    if (desc.includes('—')) errors.push(`${page.route}: description carries an em dash`);

    const title = `${page.title} — ${SITE.name}`;
    const canonical = page.route === '/' ? `${ORIGIN}/` : `${ORIGIN}${page.route}`;
    const item = page.kind === 'item' ? page.record : null;
    const image = item?.photo ? assetURL(item.photo) : assetURL(SITE.ogImage);
    const dims = item?.photo ? imageSize(join(ROOT, 'public', ...item.photo.split('/'))) : null;

    const meta = [
      `<title>${esc(title)}</title>`,
      `<meta name="description" content="${esc(desc)}" />`,
      `<link rel="canonical" href="${esc(canonical)}" />`,
      `<meta property="og:site_name" content="${esc(SITE.name)}" />`,
      `<meta property="og:title" content="${esc(title)}" />`,
      `<meta property="og:description" content="${esc(desc)}" />`,
      `<meta property="og:url" content="${esc(canonical)}" />`,
      `<meta property="og:type" content="${item ? 'product' : 'website'}" />`,
      `<meta property="og:image" content="${esc(image)}" />`,
      ...(dims
        ? [
            `<meta property="og:image:width" content="${dims.width}" />`,
            `<meta property="og:image:height" content="${dims.height}" />`,
          ]
        : []),
      `<meta property="og:image:alt" content="${esc(item ? item.name : SITE.name)}" />`,
      ...(item && !item.sold && Number.isFinite(item.price)
        ? [
            `<meta property="product:price:amount" content="${item.price.toFixed(2)}" />`,
            `<meta property="product:price:currency" content="USD" />`,
          ]
        : []),
      `<meta name="twitter:card" content="summary_large_image" />`,
      ...jsonLd(page, canonical, desc, image).map(
        (block) => `<script type="application/ld+json">${block}</script>`
      ),
    ].join('\n    ');

    /* First-view elements the page motion animates in (heroSequence,
       initReveals, initGridStagger in src/lib/motion.js). Held at opacity 0
       from the first paint — the shell paints nothing either — and released
       by main.js once motion has claimed them. No JS: the <noscript> sheet
       shows everything. Both sit after the built stylesheet so they win the
       cascade at equal specificity. */
    const MOTION_SEL = '.line-mask > span, [data-hero-lead] > *, [data-hero-meta] > *, [data-hero-cta], [data-reveal], [data-stagger] > *';
    const motion = [
      `<style data-prerender-motion>${MOTION_SEL} { opacity: 0; }</style>`,
      `<noscript><style>${MOTION_SEL} { opacity: 1 !important; transform: none !important; }</style></noscript>`,
    ].join('\n    ');

    let doc = shell;
    doc = replaceOnce(doc, '<html lang="en">', `<html lang="en" data-prerendered="${esc(page.route)}">`);
    // The shell's own metadata goes; the page's replaces it in the same spot.
    doc = doc.replace(/<meta\s[^>]*name="description"[^>]*>\s*/s, '');
    doc = doc.replace(/<meta\s[^>]*property="og:[^"]*"[^>]*>\s*/gs, '');
    doc = doc.replace(/<meta\s[^>]*name="twitter:[^"]*"[^>]*>\s*/gs, '');
    if (!/<title>[^<]*<\/title>/.test(doc)) throw new Error('shell has no <title>');
    doc = doc.replace(/<title>[^<]*<\/title>/, meta);
    if (/property="og:|name="twitter:|name="description"/.test(doc.replace(meta, '')))
      throw new Error('shell metadata survived the strip');
    doc = replaceOnce(doc, '</head>', `${motion}\n  </head>`);
    doc = replaceOnce(
      doc,
      '<header data-site-header></header>',
      `<header data-site-header data-prerender-hash="${hashHTML(header)}">${withLinkBase(header)}</header>`
    );
    doc = replaceOnce(
      doc,
      '<main id="main" data-outlet tabindex="-1"></main>',
      `<main id="main" data-outlet tabindex="-1" data-prerender-hash="${hashHTML(body)}">${withLinkBase(body)}</main>`
    );
    doc = replaceOnce(
      doc,
      '<footer data-site-footer></footer>',
      `<footer data-site-footer data-prerender-hash="${hashHTML(footer)}">${withLinkBase(footer)}</footer>`
    );

    if (doc.includes('buy.stripe.com/test_')) throw new Error('a TEST-mode Stripe link reached the page');
    if (item && (doc.match(/<h1[\s>]/g) || []).length !== 1) throw new Error('item page must have exactly one <h1>');
    return doc;
  }

  /* -------------------------------------------------------------- */
  /* Structured data                                                 */
  /* -------------------------------------------------------------- */

  function jsonLd(page, canonical, desc, image) {
    const crumbs = (trail) => ({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: trail.map(([name, url], i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name,
        ...(url ? { item: url } : {}),
      })),
    });
    const site = { '@type': 'WebSite', name: SITE.name, url: `${ORIGIN}/` };
    const blocks = [];

    if (page.kind === 'home') {
      blocks.push({
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: SITE.name,
        url: `${ORIGIN}/`,
        logo: assetURL(SITE.logo),
      });
      blocks.push({ '@context': 'https://schema.org', ...site, description: desc });
    } else if (page.kind === 'item') {
      const item = page.record;
      const coll = store.getCollection(item.collection);
      const images = [...new Set([item.photo, ...(item.photos || [])].filter(Boolean))].map(assetURL);
      const availability = item.sold
        ? 'https://schema.org/SoldOut'
        : item.upcoming
          ? 'https://schema.org/PreOrder'
          : 'https://schema.org/InStock';
      const real = (v) => !['see listing', 'see photos', '—', ''].includes(String(v ?? '').trim().toLowerCase());
      blocks.push({
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: item.name,
        image: images,
        description: desc,
        ...(real(item.brand) ? { brand: { '@type': 'Brand', name: item.brand } } : {}),
        ...(typeof item.sku === 'string' && item.sku.trim() ? { sku: item.sku.trim() } : {}),
        ...(item.category ? { category: item.category } : {}),
        offers: {
          '@type': 'Offer',
          price: Number(item.price).toFixed(2),
          priceCurrency: 'USD',
          availability,
          itemCondition: 'https://schema.org/UsedCondition',
          url: canonical,
        },
      });
      blocks.push(
        crumbs([
          ['Home', `${ORIGIN}/`],
          ['Collections', `${ORIGIN}/collections`],
          ...(coll ? [[coll.name, `${ORIGIN}/collections/${coll.id}`]] : []),
          [item.name, null],
        ])
      );
    } else if (page.kind === 'collection') {
      const c = page.record;
      blocks.push({
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: c.name,
        url: canonical,
        description: desc,
        isPartOf: site,
      });
      blocks.push(crumbs([['Home', `${ORIGIN}/`], ['Collections', `${ORIGIN}/collections`], [c.name, null]]));
    } else {
      blocks.push({
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: page.title,
        url: canonical,
        description: desc,
        primaryImageOfPage: image,
        isPartOf: site,
      });
      blocks.push(crumbs([['Home', `${ORIGIN}/`], [page.title, null]]));
    }

    return blocks.map((b) => {
      // "</" must not end the <script> early. Parse the result back, so what
      // ships is exactly what a validator will read.
      const json = JSON.stringify(b).replace(/<\//g, '<\\/');
      const back = JSON.parse(json);
      if (!back['@context'] || !back['@type']) throw new Error('JSON-LD block lacks @context/@type');
      return json;
    });
  }

  /* -------------------------------------------------------------- */
  /* Sitemap + robots                                                */
  /* -------------------------------------------------------------- */

  function sitemapXML(list) {
    const rows = list.map((p) => {
      const loc = p.route === '/' ? `${ORIGIN}/` : `${ORIGIN}${p.route}`;
      return `  <url>\n    <loc>${esc(loc)}</loc>\n    <lastmod>${esc(p.lastmod)}</lastmod>\n  </url>`;
    });
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join('\n')}\n</urlset>\n`;
  }

  function robotsTXT() {
    return ['User-agent: *', 'Allow: /', 'Disallow: /curate', '', `Sitemap: ${ORIGIN}/sitemap.xml`, ''].join('\n');
  }

  /* -------------------------------------------------------------- */
  /* Helpers                                                         */
  /* -------------------------------------------------------------- */

  /** Absolute URL of a public/-relative asset: origin + deploy base, once. */
  function assetURL(publicPath) {
    return `${ORIGIN}${BASE}${String(publicPath).replace(/^\/+/, '')}`;
  }

  /* The page modules read Vite's BASE_URL, which Node cannot see, so their
     asset paths come out rooted at "/". Under a project-page base the SPA
     would have emitted "/repo/stock/…" — mirror that BEFORE hashing so the
     router's comparison holds. Internal hrefs stay app-rooted in the string
     (that is how the SPA hashes them) and get the base only in the file,
     as applyBaseToLinks does in the DOM. */
  function withAssetBase(html) {
    if (BASE === '/') return html;
    return html
      .replace(/\b(src|data-src)="\/(?!\/)/g, `$1="${BASE}`)
      .replace(/data-cycle="([^"]*)"/g, (m, list) => `data-cycle="${list.replace(/(^|\|)\/(?!\/)/g, `$1${BASE}`)}"`);
  }
  function withLinkBase(html) {
    if (BASE === '/') return html;
    return html.replace(/\bhref="\/(?!\/)/g, `href="${BASE}`);
  }

  function replaceOnce(doc, needle, replacement) {
    const first = doc.indexOf(needle);
    if (first === -1) throw new Error(`shell anchor not found: ${needle}`);
    if (doc.indexOf(needle, first + needle.length) !== -1) throw new Error(`shell anchor is not unique: ${needle}`);
    return doc.slice(0, first) + replacement + doc.slice(first + needle.length);
  }

  /* -------------------------------------------------------------- */
  /* Report                                                          */
  /* -------------------------------------------------------------- */

  console.log(`\n${C.dim}── Tour Archive · prerender ──${C.off}`);
  const byKind = written.reduce((a, p) => ((a[p.kind] = (a[p.kind] || 0) + 1), a), {});
  console.log(
    `${C.dim}   ${written.length} page(s) written · ${Object.entries(byKind)
      .map(([k, n]) => `${n} ${k}`)
      .join(' · ')}${only.length ? ' (selected routes only — sitemap untouched)' : ' · sitemap.xml · robots.txt'}${C.off}`
  );
  if (BASE !== '/') console.log(`${C.dim}   deploy base ${BASE}${C.off}`);

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
  console.log(`\n${C.green}✔ every indexable route has real HTML${C.off}\n`);
}

/* ------------------------------------------------------------------ */
/* Module-level helpers                                                */
/* ------------------------------------------------------------------ */

function esc(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Pixel size of a JPEG or PNG on disk, or null. Enough for og:image. */
function imageSize(path) {
  try {
    const buf = readFileSync(path);
    if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
      let off = 2;
      while (off + 9 < buf.length) {
        if (buf[off] !== 0xff) return null;
        const marker = buf[off + 1];
        if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01 || marker === 0xff) {
          off += marker === 0xff ? 1 : 2;
          continue;
        }
        const len = buf.readUInt16BE(off + 2);
        const isSOF = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
        if (isSOF) return { height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7) };
        off += 2 + len;
      }
    }
  } catch {
    /* no dimensions is fine — the tag is simply omitted */
  }
  return null;
}
