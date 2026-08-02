/**
 * /archive — the full searchable inventory.
 * Filter state lives in the query string so every view is linkable and the
 * back button behaves. Chips re-render only the grid.
 */

import {
  items,
  collections,
  categories,
  eras,
  eraOf,
  isAvailable,
  getCollection,
} from '../data/store.js';
import { productCard, breadcrumb, marquee } from '../components/ui.js';
import { initGridStagger } from '../lib/motion.js';

const AVAIL = [
  { id: 'all', label: 'Everything' },
  { id: 'available', label: 'Available' },
  { id: 'upcoming', label: 'Opening soon' },
  { id: 'sold', label: 'Archived' },
];

function readState() {
  const q = new URLSearchParams(window.location.search);
  return {
    filter: q.get('filter') || 'all',
    collection: q.get('collection') || 'all',
    category: q.get('category') || 'all',
    era: q.get('era') || 'all',
    sort: q.get('sort') || 'default',
  };
}

function applyFilters(state) {
  let out = items().filter((i) => {
    if (state.filter === 'available' && !isAvailable(i)) return false;
    if (state.filter === 'sold' && !i.sold) return false;
    if (state.filter === 'upcoming' && !i.upcoming) return false;
    if (state.collection !== 'all' && i.collection !== state.collection) return false;
    if (state.category !== 'all' && i.category !== state.category) return false;
    if (state.era !== 'all' && eraOf(i) !== state.era) return false;
    return true;
  });
  if (state.sort === 'price-asc') out = [...out].sort((a, b) => a.price - b.price);
  if (state.sort === 'price-desc') out = [...out].sort((a, b) => b.price - a.price);
  if (state.sort === 'year-asc') out = [...out].sort((a, b) => Number(a.year) - Number(b.year));
  if (state.sort === 'year-desc') out = [...out].sort((a, b) => Number(b.year) - Number(a.year));
  return out;
}

function chip(group, value, label, active) {
  return `<button class="chip" data-filter-group="${group}" data-filter-value="${value}"
    aria-pressed="${active ? 'true' : 'false'}">${label}</button>`;
}

/**
 * Only offer filters that can match something — a chip whose answer is always
 * "No pieces" is navigation that lies. Each group keeps its "All", and a group
 * with fewer than two real options disappears entirely.
 */
function filterBar(state, count) {
  const all = items();
  const statusChips = AVAIL.filter(
    (a) =>
      a.id === 'all' ||
      (a.id === 'available' && all.some(isAvailable)) ||
      (a.id === 'upcoming' && all.some((i) => i.upcoming)) ||
      (a.id === 'sold' && all.some((i) => i.sold))
  );
  const collChips = collections().filter((c) => all.some((i) => i.collection === c.id));
  const eraChips = eras.filter((e) => all.some((i) => eraOf(i) === e));

  const group = (label, chips) =>
    chips.trim() ? `<span class="label">${label}</span>${chips}` : '';

  return `
  <div class="filters" data-filters>
    ${group(
      'Status',
      statusChips.length > 1
        ? statusChips.map((a) => chip('filter', a.id, a.label, state.filter === a.id)).join('')
        : ''
    )}
    ${group(
      'Collection',
      collChips.length > 1
        ? chip('collection', 'all', 'All', state.collection === 'all') +
            collChips.map((c) => chip('collection', c.id, c.name, state.collection === c.id)).join('')
        : ''
    )}
    ${group(
      'Type',
      categories().length > 1
        ? chip('category', 'all', 'All', state.category === 'all') +
            categories().map((c) => chip('category', c, c, state.category === c)).join('')
        : ''
    )}
    ${group(
      'Era',
      eraChips.length > 1
        ? chip('era', 'all', 'All', state.era === 'all') +
            eraChips.map((e) => chip('era', e, e, state.era === e)).join('')
        : ''
    )}
    <span class="count" data-result-count>${count} ${count === 1 ? 'piece' : 'pieces'}</span>
  </div>`;
}

function gridHTML(list) {
  if (!list.length) {
    return `
    <div class="empty-state">
      <p class="eyebrow">Nothing matches</p>
      <h3 class="display">No pieces under those filters</h3>
      <p class="lede" style="text-align:center">Loosen a filter, or reset and start again.</p>
      <button class="btn btn--ghost" data-filter-reset>Reset filters</button>
    </div>`;
  }
  return `<div class="grid-products" data-stagger>${list.map(productCard).join('')}</div>`;
}

export function archive() {
  const state = readState();
  const list = applyFilters(state);
  const activeColl = state.collection !== 'all' ? getCollection(state.collection) : null;

  return `
  <section class="section--tight section" style="padding-top:calc(var(--header-h) + 3.5rem)">
    <div class="wrap">
      ${breadcrumb([
        { label: 'Home', href: '/' },
        { label: 'The Archive' },
        ...(activeColl ? [{ label: activeColl.name }] : []),
      ])}
      <div class="coll-hero-grid" data-hero>
        <div>
          <p class="eyebrow" data-hero-meta><span>${items().length} pieces catalogued</span></p>
          <h1 class="display" style="margin:.6rem 0 1.2rem;font-size:clamp(2.8rem,7vw,6.5rem)">
            <span class="line-mask"><span>The Archive</span></span>
          </h1>
          <p class="lede" data-hero-cta>
            Everything we hold, across every drop. Filter by status, championship, garment type or era.
          </p>
        </div>
        <div data-hero-cta>
          <ul class="facts">
            <li><span>Available now</span><b>${items().filter(isAvailable).length} pieces</b></li>
            <li><span>Reserved for drops</span><b>${items().filter((i) => i.upcoming).length} pieces</b></li>
            <li><span>Sold &amp; archived</span><b>${items().filter((i) => i.sold).length} pieces</b></li>
            <li><span>Collections</span><b>${collections().length}</b></li>
            ${(() => {
              // Dated pieces only — "1990s" is honest, but it isn't a number.
              const years = items()
                .map((i) => Number(i.year))
                .filter((y) => Number.isFinite(y));
              return years.length
                ? `<li><span>Earliest piece</span><b>${Math.min(...years)}</b></li>
                   <li><span>Latest piece</span><b>${Math.max(...years)}</b></li>`
                : `<li><span>Photography</span><b>In house, as found</b></li>`;
            })()}
          </ul>
        </div>
      </div>
    </div>
  </section>

  ${marquee(['One of one', 'No restocks', 'Photographed in house', 'Condition graded', 'Submissions welcome'])}

  <div class="wrap">
    ${filterBar(state, list.length)}
  </div>

  <section class="section" style="padding-top:clamp(2rem,4vw,3.5rem)">
    <div class="wrap" data-archive-grid>
      ${gridHTML(list)}
    </div>
  </section>`;
}

/** Wire up the filter chips after render. */
export function mountArchive(outlet) {
  const bar = outlet.querySelector('[data-filters]');
  const gridWrap = outlet.querySelector('[data-archive-grid]');
  if (!bar || !gridWrap) return;

  const rerender = () => {
    const state = readState();
    const list = applyFilters(state);
    gridWrap.innerHTML = gridHTML(list);
    bar.querySelectorAll('.chip').forEach((c) => {
      const group = c.dataset.filterGroup;
      c.setAttribute(
        'aria-pressed',
        state[group] === c.dataset.filterValue ? 'true' : 'false'
      );
    });
    const count = bar.querySelector('[data-result-count]');
    if (count) count.textContent = `${list.length} ${list.length === 1 ? 'piece' : 'pieces'}`;
    initGridStagger(gridWrap);
  };

  const setParam = (key, value) => {
    const q = new URLSearchParams(window.location.search);
    if (value === 'all' || !value) q.delete(key);
    else q.set(key, value);
    const qs = q.toString();
    history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
    rerender();
  };

  bar.addEventListener('click', (e) => {
    const c = e.target.closest('.chip');
    if (!c) return;
    setParam(c.dataset.filterGroup, c.dataset.filterValue);
  });

  gridWrap.addEventListener('click', (e) => {
    if (!e.target.closest('[data-filter-reset]')) return;
    history.replaceState({}, '', window.location.pathname);
    rerender();
  });
}
