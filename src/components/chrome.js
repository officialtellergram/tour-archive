/**
 * Persistent chrome: header, collections drawer, footer.
 * Rendered once at boot; `syncNav` re-runs on every route change.
 */

import { BRAND, collections, items, isAvailable } from '../data/store.js';
import { openDrawer, closeDrawer, toast } from '../lib/motion.js';
import { currentPath, applyBaseToLinks, stripBase } from '../lib/router.js';

const BASE_URL = (import.meta.env?.BASE_URL || '/').replace(/\/*$/, '/');

export const NAV_PRIMARY = [
  { label: 'Collections', href: '/collections' },
  { label: 'The Archive', href: '/archive' },
  { label: 'Journal', href: '/journal' },
];

export const NAV_SECONDARY = [
  { label: 'Our Method', href: '/method' },
  { label: 'Sell to Us', href: '/sell' },
];

function headerHTML() {
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
        <a href="/archive?filter=available" data-cursor-text="Browse">Shop</a>
      </nav>
    </div>
  </div>

  <div class="drawer" id="site-drawer" data-drawer aria-hidden="true">
    <div style="display:flex;align-items:center;justify-content:flex-end">
      <button class="drawer-close" data-drawer-close>Close</button>
    </div>
    <div class="drawer-body">
      <div>
        <h4>Collections</h4>
        <ul class="drawer-list">
          ${collections()
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
        <h4>Browse</h4>
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

function footerHTML() {
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
          <h4>Collections</h4>
          <ul>
            ${collections()
              .map((c) => `<li><a href="/collections/${c.id}">${c.name}</a></li>`)
              .join('')}
          </ul>
        </div>
        <div>
          <h4>Browse</h4>
          <ul>
            <li><a href="/collections">All Collections</a></li>
            <li><a href="/archive">The Archive</a></li>
            <li><a href="/archive?filter=available">Available Now</a></li>
            <li><a href="/journal">Journal</a></li>
          </ul>
        </div>
        <div>
          <h4>House</h4>
          <ul>
            <li><a href="/method">Our Method</a></li>
            <li><a href="/sell">Sell to Us</a></li>
            <li><a href="/sizing">Sizing &amp; Condition</a></li>
            <li><a href="mailto:officialtellergram@gmail.com">Contact</a></li>
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
  if (header) header.innerHTML = headerHTML();
  if (footer) footer.innerHTML = footerHTML();
  // Chrome renders once, outside the router, so it needs the base applied here.
  applyBaseToLinks(header);
  applyBaseToLinks(footer);

  const drawer = document.querySelector('[data-drawer]');
  const openBtn = document.querySelector('[data-drawer-open]');

  const close = () => {
    if (!drawer?.classList.contains('is-open')) return;
    closeDrawer(drawer);
    drawer.setAttribute('aria-hidden', 'true');
    openBtn?.setAttribute('aria-expanded', 'false');
  };

  openBtn?.addEventListener('click', () => {
    if (!drawer) return;
    openDrawer(drawer);
    drawer.setAttribute('aria-hidden', 'false');
    openBtn.setAttribute('aria-expanded', 'true');
  });
  document.querySelector('[data-drawer-close]')?.addEventListener('click', close);
  drawer?.addEventListener('click', (e) => {
    if (e.target.closest('a')) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  document.querySelector('[data-signup]')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = e.currentTarget.querySelector('input');
    toast(`Added ${input.value} to the drop list`);
    input.value = '';
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
