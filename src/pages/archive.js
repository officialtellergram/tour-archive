/**
 * /archive — the full searchable inventory.
 *
 * Filter state lives in the query string so every view is linkable and the
 * back button behaves. The bar (Karen, 13 Nov 2026 — "clean and functional"):
 * collection chips on the left; Brand, Color, Price and Sort as four quiet
 * menus on the right; the count and a Clear link. Era, type, status and
 * condition chips are gone. `filter=available` is still honoured because the
 * drawer and the footer link to it — it shows in the count line, not as a
 * chip. Search arrives from the header strip (src/components/chrome.js) as a
 * `ta:search` event while this page is mounted, or as `?q=` from any other.
 *
 * Params: q, collection, brand, color, min, max, sort, filter=available.
 */

import { items, collections, isAvailable, getCollection, soldLast } from '../data/store.js';
import { COLOR_FAMILIES, colorLabel } from '../data/colors.js';
import { matchesQuery, normalizeQuery } from '../lib/search.js';
import { productCard, breadcrumb, marquee, escapeHtml, money } from '../components/ui.js';
import { initGridStagger } from '../lib/motion.js';

const SORTS = [
  { id: 'featured', label: 'Featured' },
  { id: 'newest', label: 'Newest' },
  { id: 'price-asc', label: 'Price, low to high' },
  { id: 'price-desc', label: 'Price, high to low' },
];
const PRICE_STEP = 5;
/* Brands that are no brand: never offered in the menu, still searchable. */
const UNBRANDED = new Set(['', 'unattributed', 'unbranded', 'unknown', '—']);
const isBranded = (b) => !UNBRANDED.has(String(b ?? '').trim().toLowerCase());

/** The slider's ends: the catalogue's cheapest and dearest, to a $5 step. */
function priceBounds(list) {
  const p = list.map((i) => Number(i.price)).filter((n) => Number.isFinite(n) && n > 0);
  if (!p.length) return { min: 0, max: 0 };
  return {
    min: Math.floor(Math.min(...p) / PRICE_STEP) * PRICE_STEP,
    max: Math.ceil(Math.max(...p) / PRICE_STEP) * PRICE_STEP,
  };
}

function readState() {
  const q = new URLSearchParams(window.location.search);
  const bounds = priceBounds(items());
  const num = (k, fallback) => {
    const n = Number(q.get(k));
    return q.has(k) && Number.isFinite(n) ? n : fallback;
  };
  const sort = q.get('sort');
  return {
    q: normalizeQuery(q.get('q')),
    filter: q.get('filter') === 'available' ? 'available' : 'all',
    collection: q.get('collection') || 'all',
    brand: q.get('brand') || 'all',
    color: q.get('color') || 'all',
    min: Math.min(bounds.max, Math.max(bounds.min, num('min', bounds.min))),
    max: Math.max(bounds.min, Math.min(bounds.max, num('max', bounds.max))),
    sort: SORTS.some((s) => s.id === sort) ? sort : 'featured',
    bounds,
  };
}

const priced = (s) => s.min > s.bounds.min || s.max < s.bounds.max;
const anyActive = (s) =>
  Boolean(s.q) || s.filter !== 'all' || s.collection !== 'all' || s.brand !== 'all' || s.color !== 'all' || priced(s);

/** The pieces under everything but one group — what that group's menu may offer. */
function poolFor(state, except) {
  return items().filter((i) => {
    if (state.filter === 'available' && !isAvailable(i)) return false;
    if (except !== 'collection' && state.collection !== 'all' && i.collection !== state.collection) return false;
    if (except !== 'brand' && state.brand !== 'all' && i.brand !== state.brand) return false;
    if (except !== 'color' && state.color !== 'all' && i.colorFamily !== state.color) return false;
    if (except !== 'price' && priced(state) && (i.price < state.min || i.price > state.max)) return false;
    return matchesQuery(i, state.q);
  });
}

function applyFilters(state) {
  let out = poolFor(state, null);
  if (state.sort === 'newest')
    out = [...out].sort((a, b) => String(b.added || '').localeCompare(String(a.added || '')));
  if (state.sort === 'price-asc') out = [...out].sort((a, b) => a.price - b.price);
  if (state.sort === 'price-desc') out = [...out].sort((a, b) => b.price - a.price);
  return soldLast(out); // whatever the sort, sold pieces close the list
}

/* ---------------- the bar ---------------- */

function chip(group, value, label, active) {
  return `<button class="chip" data-filter-group="${group}" data-filter-value="${escapeHtml(value)}"
    aria-pressed="${active ? 'true' : 'false'}">${escapeHtml(label)}</button>`;
}

function option(group, value, label, count, active, swatch = '') {
  return `<li><button type="button" data-filter-group="${group}" data-filter-value="${escapeHtml(value)}"
    aria-pressed="${active ? 'true' : 'false'}">${swatch}<span>${escapeHtml(label)}</span><span class="n">${count}</span></button></li>`;
}

function collectionChips(state) {
  const all = items();
  const colls = collections().filter((c) => all.some((i) => i.collection === c.id));
  if (colls.length < 2) return '';
  return (
    chip('collection', 'all', 'All', state.collection === 'all') +
    colls.map((c) => chip('collection', c.id, c.name, state.collection === c.id)).join('')
  );
}

/* Menus offer only what can match something under the other filters, with
   counts — a menu entry that always answers "No pieces" is navigation that lies. */
function brandList(state) {
  const pool = poolFor(state, 'brand');
  const brands = [...new Set(pool.map((i) => i.brand).filter(isBranded))].sort((a, b) => a.localeCompare(b));
  const n = (b) => pool.filter((i) => i.brand === b).length;
  return (
    option('brand', 'all', 'All brands', pool.length, state.brand === 'all') +
    brands.map((b) => option('brand', b, b, n(b), state.brand === b)).join('')
  );
}

function colorList(state) {
  const pool = poolFor(state, 'color');
  const fams = COLOR_FAMILIES.filter((f) => pool.some((i) => i.colorFamily === f.id));
  const n = (id) => pool.filter((i) => i.colorFamily === id).length;
  return (
    option('color', 'all', 'All colors', pool.length, state.color === 'all') +
    fams
      .map((f) =>
        option('color', f.id, f.label, n(f.id), state.color === f.id, `<i class="swatch" style="background:${f.swatch}"></i>`)
      )
      .join('')
  );
}

function sortList(state) {
  return SORTS.map(
    (s) =>
      `<li><button type="button" data-filter-group="sort" data-filter-value="${s.id}" aria-pressed="${
        state.sort === s.id ? 'true' : 'false'
      }"><span>${s.label}</span></button></li>`
  ).join('');
}

function countHTML(state, n) {
  const noun = n === 1 ? 'piece' : 'pieces';
  const avail = state.filter === 'available' ? ' available' : '';
  const q = state.q ? ` for <q>${escapeHtml(state.q)}</q>` : '';
  const clear = anyActive(state) ? `<button type="button" data-filter-reset>Clear</button>` : '';
  return `<span>${n}${avail} ${noun}${q}</span>${clear}`;
}

const menu = (id, label, inner, extraClass = '') => `
    <details class="fmenu ${extraClass}" data-menu="${id}">
      <summary>${label} <span class="fmenu-val" data-menu-val></span></summary>
      <div class="fmenu-pop">${inner}</div>
    </details>`;

function filterBar(state, count) {
  const chips = collectionChips(state);
  const hasPrices = state.bounds.max > state.bounds.min;
  const priceMenu = hasPrices
    ? menu(
        'price',
        'Price',
        `<div class="price-pop">
          <div class="price-read">
            <span><small>From</small><span data-price-lo>${money(state.min)}</span></span>
            <span class="price-read-hi"><small>To</small><span data-price-hi>${money(state.max)}</span></span>
          </div>
          <div class="range">
            <div class="range-track"></div><div class="range-fill" data-range-fill></div>
            <input type="range" data-range-lo aria-label="Minimum price" min="${state.bounds.min}" max="${state.bounds.max}" step="${PRICE_STEP}" value="${state.min}" />
            <input type="range" data-range-hi aria-label="Maximum price" min="${state.bounds.min}" max="${state.bounds.max}" step="${PRICE_STEP}" value="${state.max}" />
          </div>
          <button type="button" class="price-reset" data-price-reset>Any price</button>
        </div>`
      )
    : '';

  return `
  <div class="filters" data-filters>
    ${chips ? `<span class="label">Collection</span><span class="filter-chips" data-coll-chips>${chips}</span>` : ''}
    <span class="filter-spacer"></span>
    ${menu('brand', 'Brand', `<ul data-brand-list>${brandList(state)}</ul>`)}
    ${menu('color', 'Color', `<ul data-color-list>${colorList(state)}</ul>`)}
    ${priceMenu}
    ${menu('sort', 'Sort', `<ul data-sort-list>${sortList(state)}</ul>`, 'fmenu--end')}
    <span class="count" data-result-count>${countHTML(state, count)}</span>
  </div>`;
}

function gridHTML(list) {
  if (!list.length) {
    return `
    <div class="empty-state">
      <p class="eyebrow">Nothing matches</p>
      <h2 class="display" style="font-size:clamp(1.7rem,3vw,2.8rem);line-height:1.02">No pieces under those filters</h2>
      <p class="lede" style="text-align:center">Loosen a filter, or reset and start again.</p>
      <button class="btn btn--ghost" data-filter-reset>Reset filters</button>
    </div>`;
  }
  // Cards sit straight under the page h1 here — h2, not the h3 they take under a section head.
  return `<div class="grid-products" data-stagger>${list.map((i, n) => productCard(i, { level: 2, index: n })).join('')}</div>`;
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
            Everything we hold, across every drop. Search, or filter by collection, brand, color and price.
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

/* ---------------- mount ---------------- */

/* The header search speaks to whichever archive is mounted. One listener at
   a time: a new mount retires the last, so a page left behind never answers. */
let searchLink = null;

/** Wire up the bar after render. */
export function mountArchive(outlet) {
  const bar = outlet.querySelector('[data-filters]');
  const gridWrap = outlet.querySelector('[data-archive-grid]');
  if (!bar || !gridWrap) return;

  const $ = (sel, root = bar) => root.querySelector(sel);
  const menus = () => [...bar.querySelectorAll('details[data-menu]')];
  const closeMenus = (except = null) =>
    menus().forEach((d) => {
      if (d !== except && d.open) d.open = false;
    });

  const paintPrice = (state) => {
    const lo = $('[data-range-lo]');
    const hi = $('[data-range-hi]');
    if (!lo || !hi) return;
    const { min, max } = state.bounds;
    lo.value = state.min;
    hi.value = state.max;
    $('[data-price-lo]').textContent = money(state.min);
    $('[data-price-hi]').textContent = money(state.max);
    const span = Math.max(1, max - min);
    const a = ((state.min - min) / span) * 100;
    const b = ((state.max - min) / span) * 100;
    const fill = $('[data-range-fill]');
    fill.style.left = `${a}%`;
    fill.style.width = `${b - a}%`;
    // the low thumb must stay reachable when both sit at the top end
    lo.style.zIndex = state.min >= max - PRICE_STEP ? 3 : 2;
  };

  const setMenuVal = (id, on, val) => {
    const d = $(`[data-menu="${id}"]`);
    if (!d) return;
    d.classList.toggle('is-set', on);
    $('[data-menu-val]', d).textContent = on ? val : '';
  };

  const rerender = ({ grid = true } = {}) => {
    const state = readState();
    const list = applyFilters(state);
    if (grid) {
      gridWrap.innerHTML = gridHTML(list);
      initGridStagger(gridWrap);
    }
    bar.querySelectorAll('.chip').forEach((c) => {
      c.setAttribute('aria-pressed', state[c.dataset.filterGroup] === c.dataset.filterValue ? 'true' : 'false');
    });
    const brands = $('[data-brand-list]');
    if (brands) brands.innerHTML = brandList(state);
    const colors = $('[data-color-list]');
    if (colors) colors.innerHTML = colorList(state);
    const sorts = $('[data-sort-list]');
    if (sorts) sorts.innerHTML = sortList(state);
    setMenuVal('brand', state.brand !== 'all', state.brand);
    setMenuVal('color', state.color !== 'all', colorLabel(state.color) || state.color);
    setMenuVal('price', priced(state), `${money(state.min)} – ${money(state.max)}`);
    setMenuVal('sort', state.sort !== 'featured', SORTS.find((s) => s.id === state.sort)?.label || '');
    paintPrice(state);
    const count = $('[data-result-count]');
    if (count) count.innerHTML = countHTML(state, list.length);
  };

  /* Defaults leave the URL (no `?brand=all`), so a clean view is a clean link. */
  const setParams = (patch, opts) => {
    const q = new URLSearchParams(window.location.search);
    const { bounds } = readState();
    for (const [key, raw] of Object.entries(patch)) {
      const value = raw == null ? '' : String(raw);
      const isDefault =
        value === '' ||
        value === 'all' ||
        (key === 'sort' && value === 'featured') ||
        (key === 'min' && Number(value) <= bounds.min) ||
        (key === 'max' && Number(value) >= bounds.max);
      if (isDefault) q.delete(key);
      else q.set(key, value);
    }
    const qs = q.toString();
    history.replaceState(history.state, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
    rerender(opts);
  };

  const headerInput = () => document.querySelector('[data-search-input]');

  const resetAll = () => {
    history.replaceState(history.state, '', window.location.pathname);
    const input = headerInput();
    if (input) input.value = '';
    closeMenus();
    rerender();
  };

  bar.addEventListener('click', (e) => {
    const pick = e.target.closest('[data-filter-group]');
    if (pick) {
      const group = pick.dataset.filterGroup;
      setParams({ [group]: pick.dataset.filterValue });
      if (!pick.classList.contains('chip')) closeMenus();
      return;
    }
    if (e.target.closest('[data-filter-reset]')) resetAll();
    if (e.target.closest('[data-price-reset]')) setParams({ min: '', max: '' });
  });

  gridWrap.addEventListener('click', (e) => {
    if (e.target.closest('[data-filter-reset]')) resetAll();
  });

  // One menu open at a time; a click elsewhere, or Escape, shuts it.
  menus().forEach((d) => d.addEventListener('toggle', () => d.open && closeMenus(d)));
  const onDocClick = (e) => {
    if (!document.contains(bar)) return;
    if (!e.target.closest('details[data-menu]')) closeMenus();
  };
  const onKey = (e) => {
    if (e.key === 'Escape' && document.contains(bar)) closeMenus();
  };

  // The price slider: paint as the thumb moves, filter a breath later.
  const lo = $('[data-range-lo]');
  const hi = $('[data-range-hi]');
  if (lo && hi) {
    let t = 0;
    const onRange = (which) => () => {
      let a = Number(lo.value);
      let b = Number(hi.value);
      if (a > b - PRICE_STEP) {
        if (which === 'lo') a = b - PRICE_STEP;
        else b = a + PRICE_STEP;
      }
      const { bounds } = readState();
      a = Math.max(bounds.min, a);
      b = Math.min(bounds.max, b);
      lo.value = a;
      hi.value = b;
      $('[data-price-lo]').textContent = money(a);
      $('[data-price-hi]').textContent = money(b);
      clearTimeout(t);
      t = setTimeout(() => setParams({ min: a, max: b }), 90);
    };
    lo.addEventListener('input', onRange('lo'));
    hi.addEventListener('input', onRange('hi'));
  }

  // The header strip: live while this page is up.
  searchLink?.abort();
  searchLink = new AbortController();
  const { signal } = searchLink;
  document.addEventListener(
    'ta:search',
    (e) => {
      if (!document.contains(bar)) return searchLink?.abort();
      setParams({ q: normalizeQuery(e.detail?.q) });
    },
    { signal }
  );
  document.addEventListener('click', onDocClick, { signal });
  document.addEventListener('keydown', onKey, { signal });

  // Arriving with ?q= (from another page's search): the strip's field agrees.
  const state = readState();
  const input = headerInput();
  if (input && input.value !== state.q) input.value = state.q;
  paintPrice(state);
}
