import './styles/fonts.css';
import './styles/app.css';

import { route, setNotFound, hooks, start, routeTable } from './lib/router.js';
import {
  initScrollRail,
  initHeaderBehaviour,
  initCursor,
  initMarquee,
  initCardCycle,
  mountPageMotion,
  mountHeroBackdrop,
  veilIn,
  veilOut,
  playIntro,
} from './lib/motion.js';
import { mountChrome, syncNav } from './components/chrome.js';
import { installErrorBeacon } from './lib/errors.js';

import { home } from './pages/home.js';
import { collectionsIndex, collectionDetail } from './pages/collections.js';
import { archive, mountArchive } from './pages/archive.js';
import { product, mountProduct } from './pages/product.js';
import { journalIndex, journalEntry } from './pages/journal.js';
import { mission, sell, mountSell, sizing, privacy, terms, notFound } from './pages/house.js';
import { curate, mountCurate, curateReview, mountCurateReview } from './pages/curate.js';

import { getCollection, getItem, getJournal, init as initStore, status as storeStatus } from './data/store.js';
import { pageTitle } from './data/seo.js';

/* ----------------------------- routes ----------------------------- */

/* Static titles live in src/data/seo.js so the build-time prerender
   (scripts/prerender.mjs) writes the same <title> the router sets at boot. */
route('/', home, { title: pageTitle('/') });
route('/collections', collectionsIndex, { title: pageTitle('/collections') });
route('/collections/:id', collectionDetail, {
  title: ({ id }) => getCollection(id)?.name || 'Collection',
});
route('/archive', archive, { title: pageTitle('/archive') });
route('/item/:id', product, { title: ({ id }) => getItem(id)?.name || 'Piece' });
route('/journal', journalIndex, { title: pageTitle('/journal') });
route('/journal/:id', journalEntry, {
  title: ({ id }) => getJournal(id)?.title || 'Journal',
});
route('/mission', mission, { title: pageTitle('/mission') });
route('/sell', sell, { title: pageTitle('/sell') });
route('/sizing', sizing, { title: pageTitle('/sizing') });
route('/privacy', privacy, { title: pageTitle('/privacy') });
route('/terms', terms, { title: pageTitle('/terms') });
route('/curate', curate, { title: pageTitle('/curate') });
route('/curate/review', curateReview, { title: pageTitle('/curate/review') });

setNotFound(notFound);

/* --------------------- per-route mount behaviours ------------------ */

const MOUNTS = [
  [/^\/$/, mountHeroBackdrop],
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
    // A prerendered document ships an inline style holding the first-view
    // elements at opacity 0 (scripts/prerender.mjs), so the page paints
    // exactly as the empty shell would — nothing shows, then hides, then
    // animates. Page motion has now claimed those elements with inline
    // styles of its own (or is holding them under the intro plate), so the
    // sheet has done its job; dropping it leaves the page as the SPA has
    // always left it.
    document.querySelector('style[data-prerender-motion]')?.remove();
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
  // First, so a store failure is caught too. Inert unless ERRORS_ENABLED.
  installErrorBeacon();

  // The intro plate plays while stock loads; page motion waits on it.
  playIntro();

  await initStore();

  mountChrome();
  initScrollRail();
  initHeaderBehaviour();
  initCursor();
  initMarquee();
  initCardCycle();

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
