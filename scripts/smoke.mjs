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
const { product } = await import('../src/pages/product.js');
const { journalIndex, journalEntry } = await import('../src/pages/journal.js');
const { method, sell, sizing, notFound } = await import('../src/pages/house.js');

const cases = [
  ['/', () => home()],
  ['/collections', () => collectionsIndex()],
  ['/archive', () => archive()],
  ['/journal', () => journalIndex()],
  ['/method', () => method()],
  ['/sell', () => sell()],
  ['/sizing', () => sizing()],
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

const C = { red: '\x1b[31m', green: '\x1b[32m', dim: '\x1b[2m', off: '\x1b[0m' };
console.log(`\n${C.dim}── Tour Archive · render smoke ──${C.off}`);
console.log(`${C.dim}   ${rendered}/${cases.length} views rendered · ${(bytes / 1024).toFixed(0)} KB markup${C.off}`);

if (errors.length) {
  console.log(`\n${C.red}✖ ${errors.length} render error(s)${C.off}`);
  errors.forEach((e) => console.log(`   ${e}`));
  console.log('');
  process.exit(1);
}
console.log(`\n${C.green}✔ every route renders${C.off}\n`);
