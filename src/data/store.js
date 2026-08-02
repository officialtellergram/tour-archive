/**
 * Inventory store.
 *
 * The site reads stock from here rather than importing the catalogue directly,
 * so live marketplace inventory and the curated seed are interchangeable.
 *
 * Boot order:
 *   1. Start from the curated catalogue — the site is never empty.
 *   2. Try the inventory API. If it answers, replace stock with the merged
 *      live set (eBay + Depop + site-only drops).
 *   3. If it doesn't, stay on the seed and record why. The shop stays up; the
 *      reason is visible at /api/health and in `store.status()`.
 *
 * Everything downstream is synchronous, so pages don't each need to be async.
 */

import {
  BRAND,
  collections as seedCollections,
  journal,
  getJournal,
  eras,
  eraOf,
} from './collections.js';
import { featuredEvent, eventPhase, daysUntil, dateRange } from './events.js';

/**
 * Where stock comes from, in order of preference:
 *
 *   1. `VITE_API_BASE` — a hosted, live API. Set this and the site does a real
 *      per-request fetch.
 *   2. In dev — the local API process on :5181.
 *   3. Otherwise — the static snapshot written at build time by
 *      `scripts/snapshot.mjs`. This is what GitHub Pages serves: no server, but
 *      the full merged inventory, because the data is read-only and was already
 *      being cached identically for every visitor.
 *
 * `BASE_URL` is Vite's build-time base (`/` for a user site, `/repo-name/` for
 * a project page), so the snapshot resolves correctly either way.
 */
// Belt and braces on the trailing slash — a base of "/repo-name" (no slash)
// once produced "/repo-nameapi/inventory.json" in production.
const BASE_URL = (import.meta.env?.BASE_URL || '/').replace(/\/*$/, '/');
const LIVE_API = import.meta.env?.VITE_API_BASE || (import.meta.env?.DEV ? 'http://localhost:5181' : '');
const INVENTORY_URL = LIVE_API
  ? `${LIVE_API.replace(/\/+$/, '')}/api/inventory`
  : `${BASE_URL}api/inventory.json`;
const BASIC_STOCK = 'basic-stock';

/** The catch-all collection for marketplace stock with no catalogue number. */
const basicStockCollection = {
  id: BASIC_STOCK,
  drop: 'Open stock',
  name: 'Basic Stock',
  place: 'Photographed in house',
  years: 'Mixed',
  status: 'live',
  statusLabel: 'Now open',
  releaseNote: 'Listed continuously',
  heroLine: 'Everything that isn’t tied to a championship — sold as we find it.',
  summary:
    'Open stock, photographed in house and syndicated to eBay and Depop as it is listed. Good pieces that don’t belong to a drop, catalogued as they come in.',
  palette: ['#B9AE93', '#8C8570', '#3F3B31'],
  accent: '#8C8570',
  essay: [
    'Not everything we buy belongs to a championship. A clean lambswool crew with no story attached is still a clean lambswool crew, and it goes up here rather than being forced into a collection it has no claim to.',
    'Pieces are photographed in house and listed here first; as each goes up on eBay or Depop, the listing takes over price and availability and checkout completes on the marketplace.',
  ],
  facts: [
    { k: 'Photographed', v: 'In house, as found' },
    { k: 'Grouping', v: 'None — open stock' },
    { k: 'Syndication', v: 'eBay & Depop as listed' },
  ],
  sources: [],
};

let state = {
  // No stock until the snapshot/API answers — the curated records in
  // collections.js are enrichment, not listings, so nothing fake is ever shown.
  items: [],
  collections: seedCollections,
  source: 'seed',
  generatedAt: null,
  channels: [],
  cache: null,
  error: null,
};

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

export async function init({ timeout = 4000 } = {}) {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeout);
    const res = await fetch(INVENTORY_URL, { signal: ctl.signal });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`inventory returned ${res.status} from ${INVENTORY_URL}`);
    const payload = await res.json();
    if (!Array.isArray(payload.items) || !payload.items.length) {
      throw new Error('inventory API returned no items');
    }

    const items = payload.items;
    const collections = [...(payload.collections || seedCollections)];

    // Only surface Basic Stock once something is actually in it.
    if (items.some((i) => i.collection === BASIC_STOCK)) {
      collections.push(basicStockCollection);
    }

    // Boot comment above predates the pivot: the fallback is now an EMPTY
    // shop, never fake stock.

    state = {
      items,
      collections,
      source: 'live',
      generatedAt: payload.generatedAt || null,
      channels: payload.sources || [],
      cache: payload.cache || null,
      error: null,
    };
  } catch (err) {
    // Expected whenever the API isn't running — the mockup still works.
    state = { ...state, source: 'seed', error: err.message };
    if (import.meta.env?.DEV) {
      console.info(`[store] using curated catalogue — live inventory unavailable (${err.message})`);
    }
  }
  return state;
}

export const status = () => ({
  source: state.source,
  generatedAt: state.generatedAt,
  channels: state.channels,
  cache: state.cache,
  error: state.error,
});

/* ------------------------------------------------------------------ */
/* Accessors — same surface the pages already used                     */
/* ------------------------------------------------------------------ */

export const items = () => state.items;
export const collections = () => state.collections;

export const getCollection = (id) => state.collections.find((c) => c.id === id) || null;
export const getItem = (id) => state.items.find((i) => i.id === id) || null;
export const itemsIn = (collectionId) =>
  state.items.filter((i) => i.collection === collectionId);

export const isAvailable = (item) => !item.sold && !item.upcoming;
export const itemStatus = (item) =>
  item.sold
    ? 'Sold'
    : item.upcoming
    ? 'Reserved for the drop'
    : item.syndicated
    ? `Available on ${item.channel === 'depop' ? 'Depop' : 'eBay'}`
    : 'Available — 1 of 1';

export const categories = () => [...new Set(state.items.map((i) => i.category))].sort();

export { BRAND, journal, getJournal, eras, eraOf, BASIC_STOCK };
export { featuredEvent, eventPhase, daysUntil, dateRange };

/** The collection record backing the currently featured event. */
export function featuredCollection(now = Date.now()) {
  const ev = featuredEvent(now);
  return ev ? { event: ev, collection: getCollection(ev.collection) } : null;
}
