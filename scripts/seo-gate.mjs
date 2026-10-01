/**
 * SEO structure gate.
 *
 * Renders every public view the way scripts/smoke.mjs does — the page
 * functions under the tiny DOM shim, no browser — but with the store loaded
 * from the real stock (the same mapper and merge the build snapshot uses, so
 * /item/ and /collections/ routes render the pages a crawler will see), and
 * with the chrome (header, drawer, footer) composed around each page in
 * document order. Then it holds each composed document to the structure a
 * search engine and a screen reader both read:
 *
 *   - exactly one <h1>
 *   - heading levels never skip (walking the sequence: h2 may follow h1,
 *     h4 may not follow h2; going back up is always fine)
 *   - every <img> carries an alt attribute (decorative ones an explicit alt="")
 *   - every internal href (/path, never //host) resolves to a declared route
 *     in src/main.js — with the dynamic segment checked against the stock —
 *     or to a file under public/
 *   - no href points at an eBay or Depop page (the marketplace exit)
 *   - every <a> has an accessible name (text, an image alt, or aria-label)
 *   - every route in src/main.js declares a title in its meta
 *   - public/stock/manifest.json names (and ids) are unique — a duplicate
 *     name is a duplicate <title>
 *
 * Prints one table row per view and exits 1 on any failure. Nothing here
 * fetches the network: external hrefs are pattern-checked, not requested.
 *
 *   node scripts/seo-gate.mjs            every view
 *   node scripts/seo-gate.mjs item/x     only views whose path contains "item/x"
 *                                         (no leading slash — Git Bash rewrites
 *                                         /x into a Windows path)
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import installDomShim, { makeEl } from './lib/dom-shim.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');
const PUBLIC = join(ROOT, 'public');

const C = { red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', dim: '\x1b[2m', bold: '\x1b[1m', off: '\x1b[0m' };
const only = (process.argv[2] || '').replace(/^\/+/, '');

const errors = [];
const warnings = [];

/* ------------------------------------------------------------------ */
/* 0. Shim, then stock, then the page modules                          */
/* ------------------------------------------------------------------ */

const { document } = installDomShim();

// The store fetches its inventory; feed it the same payload the build
// snapshot writes, minus the marketplace channels (both disabled since the
// Stripe pivot; the merge with no channels is the manifest in display order).
const { manifestStock } = await import('../server/inventory.mjs');
const { mergeInventory } = await import('../server/normalize.mjs');
const { collections: seedCollections } = await import('../src/data/collections.js');
const stock = manifestStock();
const payload = {
  generatedAt: new Date().toISOString(),
  sources: [{ channel: 'site', ok: true, count: stock.length }],
  collections: seedCollections,
  items: mergeInventory({ seed: stock, channels: [] }),
};

const store = await import('../src/data/store.js');
{
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => payload });
  try {
    await store.init();
  } finally {
    globalThis.fetch = realFetch;
  }
}
if (store.status().source !== 'live' || !store.items().length) {
  errors.push(`store did not take the stock payload (source=${store.status().source}, error=${store.status().error}) — the gate would be measuring an empty shop`);
}

const pageModules = await Promise.all([
  import('../src/pages/home.js'),
  import('../src/pages/collections.js'),
  import('../src/pages/archive.js'),
  import('../src/pages/product.js'),
  import('../src/pages/journal.js'),
  import('../src/pages/house.js'),
  import('../src/pages/curate.js'),
]);
const handlers = Object.assign({}, ...pageModules);
const { mountChrome } = await import('../src/components/chrome.js');

/* ------------------------------------------------------------------ */
/* 1. Route table, read out of src/main.js                            */
/* ------------------------------------------------------------------ */

const mainSrc = readFileSync(join(SRC, 'main.js'), 'utf8');
const routes = [...mainSrc.matchAll(/^\s*route\(\s*'([^']+)'\s*,\s*(\w+)\s*(?:,([\s\S]*?))?\)\s*;/gm)].map((m) => ({
  pattern: m[1],
  handlerName: m[2],
  meta: m[3] || '',
}));
if (!routes.length) errors.push('src/main.js: no route() declarations found');

for (const r of routes) {
  if (!/\btitle\s*:/.test(r.meta))
    errors.push(`route ${r.pattern}: no title in its meta — every route needs a <title>`);
  if (typeof handlers[r.handlerName] !== 'function')
    errors.push(`route ${r.pattern}: handler "${r.handlerName}" is not exported by any src/pages module — the gate cannot render it`);
}

function compile(pattern) {
  const keys = [];
  const rx = pattern
    .replace(/\/+$/, '')
    .split('/')
    .map((seg) => {
      if (seg.startsWith(':')) {
        keys.push(seg.slice(1));
        return '([^/]+)';
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { rx: new RegExp(`^${rx || ''}/?$`), keys };
}
const compiled = routes.map((r) => ({ ...r, ...compile(r.pattern) }));

/** The ids a dynamic segment may take, straight from the store. */
const PARAM_IDS = {
  '/collections/:id': () => store.collections().map((c) => c.id),
  '/item/:id': () => store.items().map((i) => i.id),
  '/journal/:id': () => store.journal.map((j) => j.id),
};

/** Resolve an app path to a route, and a dynamic id to a record. */
function resolveRoute(path) {
  const clean = path.replace(/\/+$/, '') || '/';
  for (const r of compiled) {
    const m = clean.match(r.rx);
    if (!m) continue;
    if (!r.keys.length) return { ok: true, route: r };
    const ids = PARAM_IDS[r.pattern];
    const id = decodeURIComponent(m[1]);
    if (!ids) return { ok: true, route: r, unchecked: true };
    return ids().includes(id)
      ? { ok: true, route: r }
      : { ok: false, reason: `matches ${r.pattern} but "${id}" is not in the stock` };
  }
  return null;
}

function publicFileExists(path) {
  const segs = path.split('/').filter(Boolean);
  if (!segs.length || segs.some((s) => s === '..')) return false;
  const p = join(PUBLIC, ...segs);
  try {
    return existsSync(p) && statSync(p).isFile();
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* 2. Views: every route, expanded over the stock, plus the 404        */
/* ------------------------------------------------------------------ */

const views = [];
for (const r of compiled) {
  const fn = handlers[r.handlerName];
  if (typeof fn !== 'function') continue;
  if (!r.keys.length) {
    views.push({ path: r.pattern, render: () => fn({}) });
    continue;
  }
  const ids = PARAM_IDS[r.pattern];
  if (!ids) {
    errors.push(`route ${r.pattern}: the gate has no id source for this dynamic route — add it to PARAM_IDS`);
    continue;
  }
  for (const id of ids()) {
    views.push({ path: r.pattern.replace(/:\w+/, id), render: () => fn({ id }) });
  }
}
if (typeof handlers.notFound === 'function') {
  views.push({ path: '/404 (not found)', render: () => handlers.notFound('/no-such-page') });
}

/* ------------------------------------------------------------------ */
/* 3. Chrome — rendered once at boot, composed around every page       */
/* ------------------------------------------------------------------ */

const headerEl = makeEl();
const footerEl = makeEl();
document.querySelector = (sel) =>
  sel === '[data-site-header]' ? headerEl : sel === '[data-site-footer]' ? footerEl : null;
mountChrome();
document.querySelector = () => null;
if (!headerEl.innerHTML.trim() || !footerEl.innerHTML.trim())
  errors.push('mountChrome rendered no header/footer markup — the composed document is missing its chrome');

/* ------------------------------------------------------------------ */
/* 4. A small HTML tokenizer                                           */
/* ------------------------------------------------------------------ */

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style']);

function decode(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

function parseAttrs(s) {
  const attrs = {};
  const rx = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+)))?/g;
  let m;
  while ((m = rx.exec(s))) attrs[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? '');
  return attrs;
}

/** → [{ type: 'open'|'close'|'text', name, attrs, text }] */
function tokenize(html) {
  const out = [];
  let i = 0;
  const n = html.length;
  while (i < n) {
    const lt = html.indexOf('<', i);
    if (lt === -1) {
      out.push({ type: 'text', text: html.slice(i) });
      break;
    }
    if (lt > i) out.push({ type: 'text', text: html.slice(i, lt) });
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      i = end === -1 ? n : end + 3;
      continue;
    }
    if (html[lt + 1] === '!' || html[lt + 1] === '?') {
      const end = html.indexOf('>', lt);
      i = end === -1 ? n : end + 1;
      continue;
    }
    const closing = html[lt + 1] === '/';
    const nameM = html.slice(lt + (closing ? 2 : 1)).match(/^[a-zA-Z][\w:-]*/);
    if (!nameM) {
      out.push({ type: 'text', text: '<' });
      i = lt + 1;
      continue;
    }
    const name = nameM[0].toLowerCase();
    // find the end of the tag, honouring quoted attribute values
    let j = lt + (closing ? 2 : 1) + nameM[0].length;
    let quote = null;
    while (j < n) {
      const ch = html[j];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '>') break;
      j += 1;
    }
    const inner = html.slice(lt + (closing ? 2 : 1) + nameM[0].length, j);
    if (closing) out.push({ type: 'close', name });
    else {
      const selfClosing = /\/\s*$/.test(inner) || VOID.has(name);
      out.push({ type: 'open', name, attrs: parseAttrs(inner.replace(/\/\s*$/, '')), selfClosing });
    }
    i = j + 1;
    if (!closing && RAW.has(name)) {
      const end = html.indexOf(`</${name}`, i);
      i = end === -1 ? n : end;
    }
  }
  return out;
}

const clip = (s, max) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
const tidy = (s) => decode(s).replace(/\s+/g, ' ').trim();

/* ------------------------------------------------------------------ */
/* 5. The checks, per composed view                                    */
/* ------------------------------------------------------------------ */

/*
 * The marketplace exit. Listing, seller and shop pages are the hard rule: the
 * shop left eBay (7 Sep 2026) and never sold on Depop, so a link there is a
 * customer sent to a dead storefront. An eBay SEARCH ("Comparables", the
 * research link non-syndicated pieces keep in secondaryAction and the
 * Provenance panel) is not a listing; it is reported as a warning so the
 * decision to drop it stays a visible, deliberate one.
 */
const MARKETPLACE_HOST = /^(?:https?:)?\/\/(?:[\w-]+\.)*(ebay\.[a-z.]+|depop\.com)(?=[/?#]|$)/i;
const LISTING_PATH_RX = /^\/(?:itm|usr|str|p|sch\/[^/]+\/m\.html|b)(?:[/?#]|$)|^\/products\/|^\/[\w.-]+\/?$/i;

function marketplaceKind(href) {
  const m = href.match(MARKETPLACE_HOST);
  if (!m) return null;
  const rest = href.slice(m[0].length) || '/';
  if (m[1].toLowerCase() === 'depop.com') return 'listing';
  return LISTING_PATH_RX.test(rest) ? 'listing' : 'search';
}

function inspect(view, html) {
  const toks = tokenize(html);
  const problems = [];
  const headings = [];
  let imgs = 0;
  let imgsNoAlt = 0;
  let links = 0;
  let internal = 0;
  let broken = 0;
  const searchLinks = new Set();

  for (let t = 0; t < toks.length; t += 1) {
    const tok = toks[t];
    if (tok.type !== 'open') continue;

    // headings
    const h = tok.name.match(/^h([1-6])$/);
    if (h) {
      let text = '';
      for (let k = t + 1; k < toks.length; k += 1) {
        if (toks[k].type === 'close' && toks[k].name === tok.name) break;
        if (toks[k].type === 'text') text += toks[k].text;
        else if (toks[k].type === 'open' && toks[k].name === 'img') text += ` ${toks[k].attrs.alt || ''} `;
      }
      headings.push({ level: Number(h[1]), text: tidy(text) });
    }

    // images
    if (tok.name === 'img') {
      imgs += 1;
      if (!('alt' in tok.attrs)) {
        imgsNoAlt += 1;
        problems.push(`<img src="${clip(tok.attrs.src || tok.attrs['data-src'] || '?', 60)}"> has no alt attribute (decorative images need an explicit alt="")`);
      }
    }

    // anchors
    if (tok.name === 'a') {
      links += 1;
      const href = tok.attrs.href;
      let text = '';
      for (let k = t + 1; k < toks.length; k += 1) {
        if (toks[k].type === 'close' && toks[k].name === 'a') break;
        if (toks[k].type === 'text') text += toks[k].text;
        else if (toks[k].type === 'open' && toks[k].name === 'img') text += ` ${toks[k].attrs.alt || ''} `;
      }
      const name = tidy(text) || (tok.attrs['aria-label'] || '').trim() || (tok.attrs['aria-labelledby'] || '').trim();
      if (!name)
        problems.push(`<a href="${clip(href || '', 60)}"> has no text and no aria-label`);

      if (href == null) continue;
      const kind = marketplaceKind(href);
      if (kind === 'listing')
        problems.push(`<a href="${clip(href, 80)}"> points at a marketplace listing — the shop sells direct; the eBay/Depop exit is final`);
      else if (kind === 'search') searchLinks.add(href);
      if (href.startsWith('/') && !href.startsWith('//')) {
        internal += 1;
        const path = href.split(/[?#]/)[0];
        const r = resolveRoute(path);
        if (r?.ok) continue;
        if (publicFileExists(path)) continue;
        broken += 1;
        problems.push(`<a href="${clip(href, 80)}"> ${r ? r.reason : 'matches no route in src/main.js and no file under public/'}`);
      }
    }
  }

  const h1s = headings.filter((h) => h.level === 1);
  if (h1s.length !== 1)
    problems.push(
      h1s.length === 0
        ? 'no <h1>'
        : `${h1s.length} <h1>s: ${h1s.map((h) => `"${clip(h.text, 40)}"`).join(', ')} — exactly one`
    );
  for (let k = 1; k < headings.length; k += 1) {
    const prev = headings[k - 1];
    const cur = headings[k];
    if (cur.level > prev.level + 1)
      problems.push(`heading skips h${prev.level} "${clip(prev.text, 36)}" → h${cur.level} "${clip(cur.text, 36)}"`);
  }

  // heading path, run-length compressed: h2×2 › h1 › h2 › h3×4
  const path = [];
  for (const h of headings) {
    const last = path[path.length - 1];
    if (last && last.level === h.level) last.n += 1;
    else path.push({ level: h.level, n: 1 });
  }
  const headingPath = path.map((p) => `h${p.level}${p.n > 1 ? `×${p.n}` : ''}`).join(' › ') || '(none)';

  if (searchLinks.size)
    warnings.push(
      `${view.path}: ${searchLinks.size} link${searchLinks.size === 1 ? '' : 's'} to a marketplace search (${[...searchLinks].map((h) => clip(h, 56)).join(', ')}) — the "Comparables" research link on a non-syndicated piece; dropping it is a visible change, so it is your call, not the gate's`
    );

  return { problems, h1: h1s.length, headingPath, imgs, imgsNoAlt, links, internal, broken };
}

/* ------------------------------------------------------------------ */
/* 5b. Self-check — every rule must fire on a fixture that breaks it.  */
/* A gate that went blind on a refactor is worse than no gate: this    */
/* proves each check is live before the real views are trusted to it. */
/* ------------------------------------------------------------------ */

{
  const fixture = `
    <h1>One</h1><h1>Two</h1>
    <h2>Section</h2><h4>Skipped</h4>
    <img src="/stock/x.jpg">
    <img src="/stock/y.jpg" alt="">
    <a href="/no-such-route">dead route</a>
    <a href="/item/not-a-piece">dead id</a>
    <a href="/brand/logo.png">a real public file</a>
    <a href="/archive?filter=available">query stripped</a>
    <a href="https://www.ebay.com/itm/407115489714">old listing</a>
    <a href="https://www.depop.com/products/x/">depop</a>
    <a href="https://www.ebay.com/sch/i.html?_nkw=x">search</a>
    <a href="/"><img src="/brand/logo.png" alt="Tour Archive" /></a>
    <a href="/" aria-label="Home"></a>
    <a href="/">   </a>
    <a href="https://stripe.com/privacy" target="_blank">external, not fetched</a>
    <svg><title>drawn</title></svg>
    <!-- <h1>commented out</h1> -->
    <script>const s = '<h1>in a script</h1>';</script>`;
  const before = warnings.length;
  const r = inspect({ path: 'self-check' }, fixture);
  const expect = [
    ['two h1s', (p) => /^2 <h1>s/.test(p)],
    ['h2 → h4 skip', (p) => p.startsWith('heading skips h2')],
    ['img without alt', (p) => p.includes('src="/stock/x.jpg"') && p.includes('no alt')],
    ['unknown route', (p) => p.includes('/no-such-route') && p.includes('matches no route')],
    ['unknown id', (p) => p.includes('/item/not-a-piece') && p.includes('not in the stock')],
    ['eBay listing', (p) => p.includes('ebay.com/itm/') && p.includes('marketplace listing')],
    ['Depop page', (p) => p.includes('depop.com') && p.includes('marketplace listing')],
    ['nameless anchor', (p) => p === '<a href="/"> has no text and no aria-label'],
  ];
  for (const [label, test] of expect) {
    if (!r.problems.some(test)) errors.push(`self-check: the "${label}" rule did not fire on its fixture — the gate is blind to it`);
  }
  const unexpected = r.problems.filter((p) => !expect.some(([, t]) => t(p)));
  if (unexpected.length)
    errors.push(`self-check: rules fired where they should not have — ${unexpected.join(' | ')}`);
  if (r.h1 !== 2 || r.imgs !== 3 || r.imgsNoAlt !== 1 || r.links !== 11 || r.internal !== 7 || r.broken !== 2)
    errors.push(`self-check: counts drifted (h1=${r.h1} imgs=${r.imgs} noAlt=${r.imgsNoAlt} links=${r.links} internal=${r.internal} broken=${r.broken})`);
  if (r.headingPath !== 'h1×2 › h2 › h4')
    errors.push(`self-check: heading path reads "${r.headingPath}", expected "h1×2 › h2 › h4"`);
  if (warnings.length !== before + 1 || !warnings[before].includes('ebay.com/sch/'))
    errors.push('self-check: a marketplace search did not warn');
  warnings.length = before; // the fixture's warning is not a finding
}

/* ------------------------------------------------------------------ */
/* 6. Manifest names                                                   */
/* ------------------------------------------------------------------ */

{
  const manifestPath = join(PUBLIC, 'stock', 'manifest.json');
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const byName = new Map();
    const byId = new Map();
    for (const s of manifest.items || []) {
      const name = String(s.name || '').trim().toLowerCase();
      if (!name) {
        errors.push(`manifest ${s.id}: no name — its page would have no title`);
        continue;
      }
      if (byName.has(name))
        errors.push(`manifest ${s.id}: name "${s.name}" duplicates ${byName.get(name)} — two pages with the same <title>`);
      else byName.set(name, s.id);
      if (byId.has(s.id)) errors.push(`manifest ${s.id}: duplicate id`);
      else byId.set(s.id, true);
    }
  } catch (err) {
    errors.push(`public/stock/manifest.json unreadable: ${err.message}`);
  }
}

/* ------------------------------------------------------------------ */
/* 7. Render and report                                                */
/* ------------------------------------------------------------------ */

const rows = [];
const selected = views.filter((v) => !only || v.path.includes(only));
if (only && !selected.length) errors.push(`no view path contains "${only}"`);

for (const view of selected) {
  let page;
  try {
    page = view.render();
  } catch (err) {
    errors.push(`${view.path}: threw — ${err.message}`);
    continue;
  }
  if (typeof page !== 'string') {
    errors.push(`${view.path}: rendered a ${typeof page}, not HTML`);
    continue;
  }
  const html = `${headerEl.innerHTML}<main id="main">${page}</main>${footerEl.innerHTML}`;
  const r = inspect(view, html);
  rows.push({ view: view.path, ...r });
  for (const p of r.problems) errors.push(`${view.path}: ${p}`);
}

console.log(`\n${C.dim}── Tour Archive · SEO structure gate ──${C.off}`);
console.log(`${C.dim}   ${rows.length} view${rows.length === 1 ? '' : 's'} composed (header + page + footer) · ${store.items().length} pieces in stock · ${routes.length} routes${C.off}\n`);

const W = { view: 46, h1: 3, path: 30, imgs: 10, links: 14 };
const line = (a, b, c, d, e) =>
  `   ${a.padEnd(W.view)} ${b.padStart(W.h1)}  ${c.padEnd(W.path)} ${d.padEnd(W.imgs)} ${e}`;
console.log(`${C.dim}${line('view', 'h1', 'headings', 'imgs (alt-)', 'links (int/broken)')}${C.off}`);
for (const r of rows) {
  const bad = r.problems.length > 0;
  const text = line(
    clip(r.view, W.view),
    String(r.h1),
    clip(r.headingPath, W.path),
    `${r.imgs}${r.imgsNoAlt ? ` (${r.imgsNoAlt}-)` : ''}`,
    `${r.links} (${r.internal}/${r.broken})`
  );
  console.log(bad ? `${C.red}${text}${C.off}` : text);
}

if (warnings.length) {
  console.log(`\n${C.yellow}⚠ ${warnings.length} warning(s)${C.off}`);
  warnings.forEach((w) => console.log(`   ${w}`));
}

if (errors.length) {
  console.log(`\n${C.red}✖ ${errors.length} structure error(s)${C.off}`);
  errors.forEach((e) => console.log(`   ${e}`));
  console.log('');
  process.exitCode = 1;
} else {
  console.log(`\n${C.green}✔ one h1, ordered headings, alt on every image, no broken internal links${C.off}\n`);
}
