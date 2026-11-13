/**
 * Persistent chrome: header, collections drawer, footer.
 * Rendered once at boot; `syncNav` re-runs on every route change.
 */

import { BRAND, launchCollections, items, isAvailable } from '../data/store.js';
import { openDrawer, closeDrawer, toast } from '../lib/motion.js';
import { joinList } from '../lib/list.js';
import { matchesQuery, normalizeQuery } from '../lib/search.js';
import { currentPath, applyBaseToLinks, stripBase, hashHTML, navigate } from '../lib/router.js';

const SEARCH_ICON =
  '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="6.8" cy="6.8" r="5.2"/><path d="M10.6 10.6 15 15"/></svg>';
const SEARCH_HINT = 'Brand, piece, color, size, club or championship';

const BASE_URL = (import.meta.env?.BASE_URL || '/').replace(/\/*$/, '/');

export const NAV_PRIMARY = [
  { label: 'Collections', href: '/collections' },
  { label: 'Shop the Archive', href: '/archive' },
];

export const NAV_SECONDARY = [
  { label: 'Our Mission', href: '/mission' },
  { label: 'Sell to Us', href: '/sell' },
];

/* headerHTML/footerHTML are exported for scripts/prerender.mjs, which bakes
   the same chrome into every prerendered page. */
export function headerHTML() {
  return `
  <div class="site-header">
    <div class="wrap header-inner">
      <nav class="nav nav--left" aria-label="Primary">
        ${NAV_PRIMARY.map((n) => `<a href="${n.href}">${n.label}</a>`).join('')}
      </nav>
      <button class="nav-toggle" data-drawer-open aria-expanded="false" aria-controls="site-drawer">
        Menu
      </button>
      <a class="wordmark" href="/" aria-label="${BRAND.name} — home">
        ${BRAND.mark}
        <small>${BRAND.since}</small>
      </a>
      <nav class="nav nav--right" aria-label="Secondary">
        ${NAV_SECONDARY.map(
          (n) => `<a href="${n.href}" class="nav-hide-sm">${n.label}</a>`
        ).join('')}
        <button class="nav-search" type="button" data-search-open aria-expanded="false" aria-controls="site-search">
          ${SEARCH_ICON}<span>Search</span>
        </button>
      </nav>
    </div>
    <!-- The search strip drops from the header (Karen, 13 Nov 2026). Shut, it
         is inert like the drawer, so a Tab never lands in a hidden field. On
         /archive it filters the grid as you type; anywhere else, Enter takes
         you to /archive?q=. -->
    <div class="search-strip" id="site-search" data-search-strip aria-hidden="true" inert>
      <div class="wrap">
        <form class="search-form" data-search-form role="search">
          ${SEARCH_ICON}
          <input type="search" name="q" autocomplete="off" autocapitalize="off" spellcheck="false"
            placeholder="Search the archive" aria-label="Search the archive" data-search-input />
          <button type="button" data-search-close>Close</button>
        </form>
        <p class="search-hint" data-search-hint>${SEARCH_HINT}</p>
      </div>
    </div>
  </div>

  <div class="drawer" id="site-drawer" data-drawer aria-hidden="true" inert>
    <div style="display:flex;align-items:center;justify-content:flex-end">
      <button class="drawer-close" data-drawer-close>Close</button>
    </div>
    <div class="drawer-body">
      <div>
        <h2>Collections</h2>
        <ul class="drawer-list">
          ${launchCollections()
            .map(
              (c) => `<li><a href="/collections/${c.id}">
                <span>${c.name}</span>
                <span class="meta">${c.drop} · ${c.statusLabel}</span>
              </a></li>`
            )
            .join('')}
        </ul>
      </div>
      <div>
        <h2>Browse</h2>
        <ul class="drawer-list">
          ${[...NAV_PRIMARY, ...NAV_SECONDARY]
            .map((n) => `<li><a href="${n.href}"><span>${n.label}</span></a></li>`)
            .join('')}
          <li><a href="/archive?filter=available"><span>Available Now</span><span class="meta">${
            items().filter(isAvailable).length
          } pieces</span></a></li>
        </ul>
      </div>
    </div>
  </div>`;
}

export function footerHTML() {
  return `
  <div class="site-footer">
    <div class="wrap">
      <div class="footer-grid">
        <div>
          <p class="footer-word">${BRAND.mark}</p>
          <p class="footer-note">${BRAND.blurb}</p>
          <form class="signup" data-signup>
            <input type="email" required placeholder="Email for drop notices" aria-label="Email address" />
            <button type="submit">Join</button>
          </form>
        </div>
        <div>
          <h2>Collections</h2>
          <ul>
            ${launchCollections()
              .map((c) => `<li><a href="/collections/${c.id}">${c.name}</a></li>`)
              .join('')}
          </ul>
        </div>
        <div>
          <h2>Browse</h2>
          <ul>
            <li><a href="/collections">All Collections</a></li>
            <li><a href="/archive">The Archive</a></li>
            <li><a href="/archive?filter=available">Available Now</a></li>
          </ul>
        </div>
        <div>
          <h2>House</h2>
          <ul>
            <li><a href="/mission">Our Mission</a></li>
            <li><a href="/sell">Sell to Us</a></li>
            <li><a href="/sizing">Sizing &amp; Condition</a></li>
            <li><a href="/terms">Terms of Sale</a></li>
            <li><a href="/privacy">Privacy</a></li>
            <li><a href="/curate">Procurement Desk</a></li>
            <li><a href="mailto:tourarchive.help@gmail.com">Contact</a></li>
          </ul>
        </div>
      </div>
      <div class="footer-base">
        <span>© ${new Date().getFullYear()} ${BRAND.name}. Prototype.</span>
        <span>${BRAND.tagline}</span>
        <span>One of one, always.</span>
      </div>
    </div>
  </div>`;
}

export function mountChrome() {
  const header = document.querySelector('[data-site-header]');
  const footer = document.querySelector('[data-site-footer]');
  // A prerendered document already holds this markup (scripts/prerender.mjs
  // stamps each slot with the hash of the string it baked). When the fresh
  // render hashes the same, the DOM is left alone — same content, no
  // re-parse, no repaint. Any difference (stock changed since the build)
  // re-renders as before. See router.js render() for the outlet's twin.
  const fill = (el, html) => {
    if (!el) return;
    if (el.dataset.prerenderHash !== hashHTML(html)) el.innerHTML = html;
    delete el.dataset.prerenderHash;
  };
  fill(header, headerHTML());
  fill(footer, footerHTML());
  // Chrome renders once, outside the router, so it needs the base applied here.
  applyBaseToLinks(header);
  applyBaseToLinks(footer);

  const drawer = document.querySelector('[data-drawer]');
  const openBtn = document.querySelector('[data-drawer-open]');

  // The shut drawer is clip-path'd, not display:none, so without `inert` a Tab
  // would still land on its links (invisible, and behind the page). inert
  // travels with aria-hidden; the keyboard is handed to Close on open and
  // back to the toggle on close, and :focus-visible keeps that silent for a
  // mouse.
  const close = () => {
    if (!drawer?.classList.contains('is-open')) return;
    const hadFocus = drawer.contains(document.activeElement);
    closeDrawer(drawer);
    drawer.setAttribute('aria-hidden', 'true');
    drawer.setAttribute('inert', '');
    openBtn?.setAttribute('aria-expanded', 'false');
    if (hadFocus) openBtn?.focus({ preventScroll: true });
  };

  openBtn?.addEventListener('click', () => {
    if (!drawer) return;
    openDrawer(drawer);
    drawer.setAttribute('aria-hidden', 'false');
    drawer.removeAttribute('inert');
    openBtn.setAttribute('aria-expanded', 'true');
    drawer.querySelector('[data-drawer-close]')?.focus({ preventScroll: true });
  });
  document.querySelector('[data-drawer-close]')?.addEventListener('click', close);
  drawer?.addEventListener('click', (e) => {
    if (e.target.closest('a')) close();
  });
  /* ---- the search strip ---- */
  const strip = document.querySelector('[data-search-strip]');
  const searchBtn = document.querySelector('[data-search-open]');
  const searchInput = document.querySelector('[data-search-input]');
  const searchHint = document.querySelector('[data-search-hint]');
  const onArchive = () => currentPath() === '/archive';
  const searchOpen = () => strip?.classList.contains('is-open');
  const openSearch = () => {
    if (!strip) return;
    strip.classList.add('is-open');
    strip.setAttribute('aria-hidden', 'false');
    strip.removeAttribute('inert');
    searchBtn?.setAttribute('aria-expanded', 'true');
    setTimeout(() => searchInput?.focus({ preventScroll: true }), 60);
  };
  const closeSearch = () => {
    if (!searchOpen()) return;
    const hadFocus = strip.contains(document.activeElement);
    strip.classList.remove('is-open');
    strip.setAttribute('aria-hidden', 'true');
    strip.setAttribute('inert', '');
    searchBtn?.setAttribute('aria-expanded', 'false');
    if (hadFocus) searchBtn?.focus({ preventScroll: true });
  };
  const hint = () => {
    if (!searchHint) return;
    const q = normalizeQuery(searchInput?.value);
    if (!q) {
      searchHint.textContent = SEARCH_HINT;
      return;
    }
    const n = items().filter((i) => matchesQuery(i, q)).length;
    const noun = n === 1 ? 'piece' : 'pieces';
    searchHint.innerHTML = onArchive()
      ? `<b>${n} ${noun}</b>`
      : `<b>${n} ${noun}</b> — press Enter to see them`;
  };
  searchBtn?.addEventListener('click', () => (searchOpen() ? closeSearch() : openSearch()));
  document.querySelector('[data-search-close]')?.addEventListener('click', closeSearch);
  let searchTimer = 0;
  searchInput?.addEventListener('input', () => {
    hint();
    if (!onArchive()) return;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      document.dispatchEvent(new CustomEvent('ta:search', { detail: { q: normalizeQuery(searchInput.value) } }));
    }, 120);
  });
  document.querySelector('[data-search-form]')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = normalizeQuery(searchInput?.value);
    if (onArchive()) {
      clearTimeout(searchTimer);
      document.dispatchEvent(new CustomEvent('ta:search', { detail: { q } }));
      closeSearch();
      return;
    }
    closeSearch();
    navigate(q ? `/archive?q=${encodeURIComponent(q)}` : '/archive');
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      close();
      closeSearch();
    }
  });
  // While the drawer is open it is the whole page for the keyboard: Tab past
  // its last link wraps to Close, Shift+Tab before Close wraps to the last
  // link. Without this a Tab walks out into the page behind the overlay.
  drawer?.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || !drawer.classList.contains('is-open')) return;
    const f = [...drawer.querySelectorAll('a[href], button')];
    if (!f.length) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus({ preventScroll: true });
    }
  });

  document.querySelector('[data-signup]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.querySelector('input[type="email"]');
    const button = form.querySelector('button');
    const email = input.value.trim();
    // The list lives on the Worker (docs/MAILING-LIST.md); the welcome mail
    // carries a one-use 10% code. If the Worker cannot be reached, fall back
    // to the prefilled mail the visitor sends themselves.
    button.disabled = true;
    const r = await joinList(email, 'footer');
    button.disabled = false;
    if (r.ok) {
      toast(r.again ? 'You are already on the list' : 'You are on the list — your code is on its way by email');
      input.value = '';
    } else if (r.error === 'email') {
      toast('That address does not look right');
    } else if (r.error === 'network') {
      const body = encodeURIComponent(`Please add ${email} to the drop list.`);
      window.location.href = `mailto:tourarchive.help@gmail.com?subject=${encodeURIComponent('Drop notices')}&body=${body}`;
      toast('Opening your mail app — send it and you are on the list');
    } else {
      toast('Something went wrong — try again in a moment');
    }
  });
}

/** Mark the active nav item after each render. */
export function syncNav() {
  const path = currentPath();
  document.querySelectorAll('[data-site-header] .nav a').forEach((a) => {
    // hrefs may carry the deploy base by now; compare on app paths.
    const href = stripBase(a.getAttribute('href'));
    const active =
      href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}
