import './styles/app.css';

import { route, setNotFound, hooks, start, routeTable } from './lib/router.js';
import {
  initScrollRail,
  initHeaderBehaviour,
  initCursor,
  initMarquee,
  mountPageMotion,
  veilIn,
  veilOut,
} from './lib/motion.js';
import { mountChrome, syncNav } from './components/chrome.js';

import { home } from './pages/home.js';
import { collectionsIndex, collectionDetail } from './pages/collections.js';
import { archive, mountArchive } from './pages/archive.js';
import { product, mountProduct } from './pages/product.js';
import { journalIndex, journalEntry } from './pages/journal.js';
import { method, sell, mountSell, sizing, notFound } from './pages/house.js';
import { curate, mountCurate, curateReview, mountCurateReview } from './pages/curate.js';

import { getCollection, getItem, getJournal, init as initStore, status as storeStatus } from './data/store.js';

/* ----------------------------- routes ----------------------------- */

route('/', home, { title: 'Vintage golf, sourced by tournament' });
route('/collections', collectionsIndex, { title: 'Collections' });
route('/collections/:id', collectionDetail, {
  title: ({ id }) => getCollection(id)?.name || 'Collection',
});
route('/archive', archive, { title: 'The Archive' });
route('/item/:id', product, { title: ({ id }) => getItem(id)?.name || 'Piece' });
route('/journal', journalIndex, { title: 'Journal' });
route('/journal/:id', journalEntry, {
  title: ({ id }) => getJournal(id)?.title || 'Journal',
});
route('/method', method, { title: 'Our Method' });
route('/sell', sell, { title: 'Sell to Us' });
route('/sizing', sizing, { title: 'Sizing & Condition' });
route('/curate', curate, { title: 'Procurement Desk' });
route('/curate/review', curateReview, { title: 'Review Session' });

setNotFound(notFound);

/* --------------------- per-route mount behaviours ------------------ */

const MOUNTS = [
  [/^\/archive$/, mountArchive],
  [/^\/item\//, mountProduct],
  [/^\/sell$/, mountSell],
  [/^\/curate$/, mountCurate],
  [/^\/curate\/review$/, mountCurateReview],
];

/* --------------------------- lifecycle ---------------------------- */

let booted = false;

hooks({
  before: async ({ isPop }) => {
    if (booted && !isPop) await veilIn();
  },
  after: async ({ path, outlet, isPop }) => {
    syncNav();
    mountPageMotion(outlet);
    MOUNTS.forEach(([rx, fn]) => {
      if (rx.test(path)) fn(outlet);
    });
    if (booted && !isPop) await veilOut();
    booted = true;
  },
});

/* ----------------------------- boot ------------------------------- */

/**
 * Boot.
 *
 * Stock resolves first: the store fetches live marketplace inventory, or falls
 * back to the curated catalogue if the inventory API isn't reachable. Chrome
 * and pages both read from it, so nothing renders until it has settled.
 *
 * Deliberately an async function rather than top-level await — TLA keeps the
 * entry module pending, which holds back the window `load` event and breaks
 * anything that waits on it (headless DOM dumps, the layout check, and some
 * analytics). Same ordering, without stalling the document lifecycle.
 */
async function boot() {
  await initStore();

  mountChrome();
  initScrollRail();
  initHeaderBehaviour();
  initCursor();
  initMarquee();

  await start();

  if (import.meta.env?.DEV) {
    const s = storeStatus();
    console.info(
      `[store] inventory source: ${s.source}${s.error ? ` (${s.error})` : ''}`,
      s.channels?.length ? s.channels : ''
    );
  }
}

boot();

// Exposed for the nav audit (scripts/audit.mjs reads this in a headless run).
if (typeof window !== 'undefined') window.__ROUTES__ = routeTable();

/**
 * `?diag=1` — layout diagnostic. Reports any element wider than the viewport
 * into <title>, so a headless DOM dump can name the source of a horizontal
 * overflow instead of us guessing at it.
 */
if (new URLSearchParams(window.location.search).get('diag') === '1') {
  setTimeout(() => {
    const vw = document.documentElement.clientWidth;
    const offenders = [];
    document.querySelectorAll('*').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > vw + 1 || r.right > vw + 1) {
        const id = `${el.tagName.toLowerCase()}${
          el.className && typeof el.className === 'string'
            ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
            : ''
        }`;
        offenders.push(`${id}[w=${Math.round(r.width)},r=${Math.round(r.right)}]`);
      }
    });
    document.title = `DIAG vw=${vw} :: ${offenders.slice(0, 14).join(' | ') || 'none'}`;
  }, 1200);
}
