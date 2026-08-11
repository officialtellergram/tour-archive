/**
 * Render smoke test.
 *
 * The audit proves links point at real routes; this proves the routes actually
 * render. Every page function is invoked in Node against a minimal DOM shim and
 * checked for: throwing, empty output, unresolved template literals, and
 * accidental `undefined`/`[object Object]` leaking into the markup.
 */

/* ---------------- minimal DOM shim ---------------- */

const noop = () => {};
const fakeEl = {
  innerHTML: '',
  textContent: '',
  style: {},
  dataset: {},
  classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  addEventListener: noop,
  removeEventListener: noop,
  setAttribute: noop,
  getAttribute: () => null,
  removeAttribute: noop,
  querySelector: () => null,
  querySelectorAll: () => [],
  closest: () => null,
  appendChild: noop,
  insertAdjacentHTML: noop,
  getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0 }),
};

globalThis.window = {
  matchMedia: () => ({ matches: false, addEventListener: noop }),
  addEventListener: noop,
  location: { pathname: '/', search: '', hash: '', origin: 'http://localhost' },
  scrollY: 0,
  innerWidth: 1440,
  innerHeight: 900,
  requestAnimationFrame: noop,
  open: noop,
};
globalThis.document = {
  ...fakeEl,
  createElement: () => ({ ...fakeEl }),
  body: { ...fakeEl },
  documentElement: { ...fakeEl },
};
globalThis.history = { pushState: noop, replaceState: noop };
globalThis.matchMedia = window.matchMedia;
// anime.js sniffs for a browser via `window`; once it finds one it expects the
// full rAF pair to exist.
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = noop;
window.requestAnimationFrame = globalThis.requestAnimationFrame;
window.cancelAnimationFrame = noop;

/* ---------------- render every route ---------------- */

const { collections, items, journal } = await import('../src/data/collections.js');
const { home } = await import('../src/pages/home.js');
const { collectionsIndex, collectionDetail } = await import('../src/pages/collections.js');
const { archive } = await import('../src/pages/archive.js');
const { product, pdpMedia } = await import('../src/pages/product.js');
const { journalIndex, journalEntry } = await import('../src/pages/journal.js');
const { mission, sell, sizing, notFound } = await import('../src/pages/house.js');
const { mosaicMedia, collectionTile, productCard } = await import('../src/components/ui.js');
const { curate, curateReview, deskHTML, verdictHTML, reviewCardHTML } = await import(
  '../src/pages/curate.js'
);

const cases = [
  ['/', () => home()],
  ['/collections', () => collectionsIndex()],
  ['/archive', () => archive()],
  ['/journal', () => journalIndex()],
  ['/mission', () => mission()],
  ['/sell', () => sell()],
  ['/sizing', () => sizing()],
  ['/curate', () => curate()],
  ['/curate/review', () => curateReview()],
  ['/404', () => notFound('/no-such-page')],
  ['/collections/:bad', () => collectionDetail({ id: 'does-not-exist' })],
  ['/item/:bad', () => product({ id: 'does-not-exist' })],
  ['/journal/:bad', () => journalEntry({ id: 'does-not-exist' })],
  ...collections.map((c) => [`/collections/${c.id}`, () => collectionDetail({ id: c.id })]),
  ...items.map((i) => [`/item/${i.id}`, () => product({ id: i.id })]),
  ...journal.map((j) => [`/journal/${j.id}`, () => journalEntry({ id: j.id })]),
];

const errors = [];
let rendered = 0;
let bytes = 0;

for (const [label, fn] of cases) {
  let html;
  try {
    html = fn();
  } catch (err) {
    errors.push(`${label}: threw — ${err.message}`);
    continue;
  }
  if (typeof html !== 'string' || html.trim().length < 100) {
    errors.push(`${label}: rendered ${html?.length ?? 0} bytes (looks empty)`);
    continue;
  }
  if (html.includes('${')) errors.push(`${label}: unresolved template literal in output`);
  if (/>\s*undefined\s*</.test(html) || html.includes('undefined,'))
    errors.push(`${label}: "undefined" leaked into the markup`);
  if (html.includes('[object Object]'))
    errors.push(`${label}: "[object Object]" leaked into the markup`);
  if (html.includes('NaN')) errors.push(`${label}: "NaN" leaked into the markup`);

  // every route should offer a way back out
  if (!html.includes('href="/')) errors.push(`${label}: renders no internal links (dead end)`);

  rendered += 1;
  bytes += html.length;
}

/* ------------------------------------------------------------------ */
/* Desk renderers — mount-time templates the routes never exercise.    */
/* These are where a merge ships a ReferenceError behind a green CI:   */
/* the route shells render, the desk blanks. No dead-end check here —  */
/* reviewCardHTML legitimately emits only external hrefs.              */
/* ------------------------------------------------------------------ */

const smokeUser = { name: 'Smoke', email: '' };
const dressed = {
  id: 'sm-1', url: 'https://www.ebay.com/itm/1', title: 'Dressed find', note: 'A note.',
  price: 55, source: 'eBay', photo: 'stock/x.jpg', collection: '', submitted_by: 'Smoke',
  status: 'new', decided_by: '', created_at: '2026-08-01T12:00:00', decided_at: null,
  show_anyway: false, dress_tries: 0, looked_at: null,
};
const bare = { ...dressed, id: 'sm-2', url: 'https://www.depop.com/products/x/', title: '', photo: '', price: null };
const listed = { ...dressed, id: 'sm-3', status: 'shortlist', decided_by: 'Smoke' };

/* PDP media fragment — smoke's store is never init()ed, so composed /item/
   routes only ever render missingItem; the fragment is the render coverage. */
const pdpCarousel = {
  id: 'stock-sm-carousel', name: 'Fixture Wind Shirt', brand: 'Slazenger', year: '1990s',
  garment: 'windshirt', colorway: ['#2E6E63', '#1C4640', '#22252A'],
  photo: 'stock/x.jpg',
  photos: Array.from({ length: 8 }, (_, i) => `stock/carousel/x/0${i + 1}.jpg`),
  sold: false, upcoming: false, syndicated: true, channel: 'ebay',
  listings: [{ channel: 'ebay', url: 'https://www.ebay.com/itm/1', label: 'View on eBay' }],
};
const pdpSingle = { ...pdpCarousel, id: 'stock-sm-single', photos: [] };
const pdpDrawn = { ...pdpCarousel, id: 'stock-sm-drawn', photo: '', photos: [] };

/* Mosaic fixtures — the route cases only ever exercise the EMPTY store path
   (collectionsIndex under the never-init()ed shim), so the filled grid is
   mount-template blind without these. One sold (must be displaced by the four
   available), one listing-only photo:'' (must be filtered), four available. */
const mosaicItems = [
  { id: 'sm-m-sold', photo: 'stock/m-sold.jpg', sold: true, upcoming: false },
  { id: 'sm-m-a', photo: 'stock/m-a.jpg', sold: false, upcoming: false },
  { id: 'sm-m-b', photo: 'stock/m-b.jpg', sold: false, upcoming: false },
  { id: 'sm-m-c', photo: 'stock/m-c.jpg', sold: false, upcoming: false },
  { id: 'sm-m-d', photo: 'stock/m-d.jpg', sold: false, upcoming: false },
  { id: 'sm-m-bare', photo: '', sold: false, upcoming: false },
];
const basicStock = collections.find((c) => c.id === 'basic-stock');

const deskCases = [
  ['deskHTML (with shortlist)', () => deskHTML(smokeUser, [dressed, bare, listed])],
  ['deskHTML (no shortlist)', () => deskHTML(smokeUser, [dressed, bare])],
  ['verdictHTML (shortlisted + waiting)', () => verdictHTML([{ card: dressed, dir: 'right' }, { card: bare, dir: 'left' }], [bare], 1)],
  ['verdictHTML (nothing listed)', () => verdictHTML([{ card: bare, dir: 'left' }], [], 0)],
  ['reviewCardHTML (photo)', () => reviewCardHTML(dressed)],
  ['reviewCardHTML (text-only)', () => reviewCardHTML(bare)],
  ['pdpMedia (carousel)', () => pdpMedia(pdpCarousel)],
  ['pdpMedia (single photo)', () => pdpMedia(pdpSingle)],
  ['pdpMedia (drawn views)', () => pdpMedia(pdpDrawn)],
  ['mosaicMedia (photo grid)', () => mosaicMedia(mosaicItems)],
  ['collectionTile (basic-stock, empty store)', () => collectionTile(basicStock)],
];

for (const [label, fn] of deskCases) {
  let html;
  try {
    html = fn();
  } catch (err) {
    errors.push(`${label}: threw — ${err.message}`);
    continue;
  }
  if (typeof html !== 'string' || html.trim().length < 100) {
    errors.push(`${label}: rendered ${html?.length ?? 0} bytes (looks empty)`);
    continue;
  }
  if (html.includes('${')) errors.push(`${label}: unresolved template literal in output`);
  if (/>\s*undefined\s*</.test(html) || html.includes('undefined,'))
    errors.push(`${label}: "undefined" leaked into the markup`);
  if (html.includes('[object Object]')) errors.push(`${label}: "[object Object]" leaked into the markup`);
  if (html.includes('NaN')) errors.push(`${label}: "NaN" leaked into the markup`);
  rendered += 1;
}

/* Shape pins for the PDP media states. Byte-equality is safe ONLY on the photo
   path — garmentSVG mints unique DOM ids per call, so never on the drawn path. */
{
  const rail = pdpMedia(pdpCarousel);
  const idx = (rail.match(/data-idx="/g) || []).length;
  if (idx !== 8) errors.push(`pdpMedia carousel: expected 8 thumb buttons, got ${idx}`);
  if ((rail.match(/loading="lazy"/g) || []).length !== 8)
    errors.push('pdpMedia carousel: every thumb must lazy-load');
  if (!rail.includes('data-pdp-stage') || !rail.includes('view 1 of 8'))
    errors.push('pdpMedia carousel: stage or its frame-count alt is missing');

  const single = pdpMedia(pdpSingle);
  if (single.includes('data-pdp-thumbs'))
    errors.push('pdpMedia single photo: thumb rail leaked into the hero state');
  if (pdpMedia({ ...pdpSingle, photos: ['stock/x.jpg'] }) !== single)
    errors.push('pdpMedia: a one-frame carousel must collapse to the hero state byte-for-byte');

  const drawn = pdpMedia(pdpDrawn);
  if ((drawn.match(/data-view="/g) || []).length !== 3)
    errors.push('pdpMedia drawn: expected the 3 drawn views');
  if (drawn.includes('data-idx'))
    errors.push('pdpMedia drawn: photo thumbs leaked into the drawn state');
}

/* Mosaic shape pins — filled grid vs empty-store fallback. Never byte-pin the
   fallback tile: its lead-item path goes through collectionMark's nextId(). */
{
  if (!basicStock) errors.push('collections.js: basic-stock missing from the seed — the mosaic tile has no collection record');
  const grid = mosaicMedia(mosaicItems);
  const imgs = (grid.match(/<img /g) || []).length;
  if (imgs !== 4) errors.push(`mosaicMedia: expected 4 cells, got ${imgs}`);
  if ((grid.match(/loading="lazy"/g) || []).length !== 4)
    errors.push('mosaicMedia: every cell must lazy-load');
  if (grid.includes('data-src'))
    errors.push('mosaicMedia: data-src leaked — deferral is the hero rotation\'s contract, not the mosaic\'s');
  if (grid.includes('m-sold.jpg'))
    errors.push('mosaicMedia: a sold piece displaced an available one — availability-first ordering broke');
  if (grid.indexOf('m-a.jpg') > grid.indexOf('m-b.jpg'))
    errors.push('mosaicMedia: manifest order not preserved — the layout probe cannot reproduce the grid');
  if (mosaicMedia([]) !== '')
    errors.push('mosaicMedia: empty stock must yield the empty string so the drawn canvas shows');

  const tile = basicStock ? collectionTile(basicStock) : '';
  if (tile.includes('tile-mosaic') || tile.includes('<img'))
    errors.push('collectionTile basic-stock: mosaic leaked into the empty-store fallback');
  if (!tile.includes('class="swatches"'))
    errors.push('collectionTile basic-stock: swatch strip missing from the fallback canvas');
}

/* Hover-cycle pins — cards with an archived carousel carry the reel. */
{
  const withReel = productCard({
    id: 'stock-sm-cycle', name: 'Cycle Fixture', brand: 'B', year: '—', category: 'Shirting',
    collection: 'basic-stock', garment: 'polo', size: 'L', condition: 'VG', price: 10,
    colorway: ['#111', '#222', '#333'], colorName: 'X', photo: 'stock/c.jpg',
    photos: ['stock/carousel/c/01.jpg', 'stock/carousel/c/02.jpg'],
    sold: false, upcoming: false, market: { label: 'x', url: 'https://x.example' },
  });
  if (!withReel.includes('data-cycle="'))
    errors.push('productCard: a carousel-bearing item must carry data-cycle');
  const without = productCard({
    id: 'stock-sm-plain', name: 'Plain Fixture', brand: 'B', year: '—', category: 'Shirting',
    collection: 'basic-stock', garment: 'polo', size: 'L', condition: 'VG', price: 10,
    colorway: ['#111', '#222', '#333'], colorName: 'X', photo: 'stock/p.jpg', photos: [],
    sold: false, upcoming: false, market: { label: 'x', url: 'https://x.example' },
  });
  if (without.includes('data-cycle'))
    errors.push('productCard: data-cycle leaked onto an item with no carousel');
}

/* Hero backdrop pins — the rotation's markup contract. */
{
  const hero = home();
  const n = (hero.match(/class="hero-slide/g) || []).length;
  if (n !== 4) errors.push(`home: expected 4 hero slides, got ${n}`);
  if (!hero.includes('hero-slide is-on'))
    errors.push('home: no slide marked is-on — first paint would be bare parchment');
  if (/hero-slide[^>]*loading="lazy"/.test(hero))
    errors.push('home: hero slides must not use loading="lazy" — in-viewport lazy fetches immediately; deferral is data-src + the loader');
  if ((hero.match(/data-src="/g) || []).length !== 3)
    errors.push('home: slides 2-4 must defer via data-src (exactly 3)');
}

const C = { red: '\x1b[31m', green: '\x1b[32m', dim: '\x1b[2m', off: '\x1b[0m' };
console.log(`\n${C.dim}── Tour Archive · render smoke ──${C.off}`);
console.log(`${C.dim}   ${rendered}/${cases.length + deskCases.length} views rendered · ${(bytes / 1024).toFixed(0)} KB markup${C.off}`);

if (errors.length) {
  console.log(`\n${C.red}✖ ${errors.length} render error(s)${C.off}`);
  errors.forEach((e) => console.log(`   ${e}`));
  console.log('');
  process.exit(1);
}
console.log(`\n${C.green}✔ every route renders${C.off}\n`);
