/**
 * Tiny History-API router.
 *
 * Routes are declared as `/collections/:id` style patterns. Every internal
 * <a href> is intercepted globally, so pages never have to wire navigation by
 * hand — which is also what keeps the nav audit honest (see scripts/audit.mjs).
 */

const routes = [];
let notFound = () => '<h1>Not found</h1>';
let onBefore = null;
let onAfter = null;
let current = null;

/**
 * Where the app is mounted. "/" for a user site or custom domain,
 * "/repo-name/" for a GitHub Pages project site. Routes are always declared
 * from the app root, so the base is stripped on read and re-applied on write —
 * no page needs to know the site isn't at the domain root.
 */
const BASE = (import.meta.env?.BASE_URL || '/').replace(/\/+$/, '');

/** Strip the deploy base off a browser path. */
function toAppPath(pathname) {
  const p = BASE && pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname;
  return p.replace(/\/+$/, '') || '/';
}

/**
 * Re-apply the deploy base to an app path. IDEMPOTENT — hrefs in the DOM have
 * already been prefixed by applyBaseToLinks, and the click handler feeds them
 * straight back through navigate(). Prefixing twice produced
 * /tour-archive/tour-archive → "Out of bounds" on every clicked link in
 * production, while every direct-URL test passed. Clicks and loads must go
 * through the same normalisation.
 */
export function withBase(appPath) {
  if (!BASE) return appPath;
  if (/^(https?:)?\/\//i.test(appPath)) return appPath;
  if (appPath === BASE || appPath.startsWith(`${BASE}/`)) return appPath;
  return `${BASE}${appPath.startsWith('/') ? '' : '/'}${appPath}`;
}

/** Strip the deploy base off an href, for comparing against route paths. */
export const stripBase = (href) => toAppPath(String(href).split(/[?#]/)[0]);

/**
 * FNV-1a over a markup string, as 8 hex characters. Not security — identity.
 * scripts/prerender.mjs stamps each filled slot (`data-prerender-hash`) with
 * the hash of the exact string it baked; at boot the same function over the
 * freshly rendered string says whether the DOM already holds this markup.
 * Runs identically in Node and the browser, which is the whole point.
 */
export function hashHTML(html) {
  let h = 0x811c9dc5;
  const s = String(html);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Rewrite internal hrefs in the DOM to include the deploy base.
 *
 * The click handler already routes correctly without this, but the `href`
 * attribute is what the browser uses for middle-click, open-in-new-tab, copy
 * link, and the status-bar preview. Leaving those un-prefixed would 404 on a
 * project-page deploy — working links that break only when opened a slightly
 * different way, which is a miserable bug to be told about second-hand.
 */
export function applyBaseToLinks(root = document) {
  if (!BASE || !root?.querySelectorAll) return;
  root.querySelectorAll('a[href^="/"]').forEach((a) => {
    const href = a.getAttribute('href');
    if (href.startsWith(`${BASE}/`) || href === BASE) return;
    a.setAttribute('href', withBase(href));
  });
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

export function route(pattern, handler, meta = {}) {
  const { rx, keys } = compile(pattern);
  routes.push({ pattern, rx, keys, handler, meta });
}

export function setNotFound(handler) {
  notFound = handler;
}

export function hooks({ before, after }) {
  onBefore = before;
  onAfter = after;
}

export function match(path) {
  const clean = path.replace(/\/+$/, '') || '/';
  for (const r of routes) {
    const m = clean.match(r.rx);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return { route: r, params };
    }
  }
  return null;
}

/** All declared route patterns — consumed by the audit script. */
export function routeTable() {
  return routes.map((r) => r.pattern);
}

export function currentPath() {
  return toAppPath(window.location.pathname);
}

export async function navigate(to, { replace = false, scroll = true } = {}) {
  // `to` is an app path (e.g. /collections/x); the browser needs it base-prefixed.
  const url = new URL(withBase(to), window.location.origin);
  if (url.origin !== window.location.origin) {
    window.open(url.href, '_blank', 'noopener');
    return;
  }
  const samePath = url.pathname === window.location.pathname;
  if (samePath && url.hash) {
    document.querySelector(url.hash)?.scrollIntoView({ behavior: 'smooth' });
    return;
  }
  if (samePath && url.search === window.location.search) return;

  history[replace ? 'replaceState' : 'pushState']({}, '', url.pathname + url.search + url.hash);
  await render({ scroll });
}

export async function render({ scroll = true, isPop = false } = {}) {
  const path = currentPath();
  const found = match(path);
  const outlet = document.querySelector('[data-outlet]');
  if (!outlet) return;

  const view = found
    ? { html: found.route.handler(found.params), meta: found.route.meta, params: found.params }
    : { html: notFound(path), meta: { title: 'Not found' }, params: {} };

  const resolved = await view.html;
  if (onBefore) await onBefore({ path, isPop });

  /*
   * Prerender hydration. On a document scripts/prerender.mjs wrote, the
   * outlet already holds this route's markup and carries the hash of the
   * exact string that was baked. If the fresh render hashes the same, the
   * DOM is left as it is: assigning identical innerHTML would tear down and
   * re-parse the page (and re-decode the hero plate) for no visible change.
   * Any difference — stock changed since the build, a date-driven line
   * moved on, a project-page base — re-renders exactly as before. The stamp
   * is dropped after the first render, so every later route change assigns.
   * The first-view motion state on a prerendered page is handled by the
   * inline <style data-prerender-motion> the prerender writes (main.js
   * removes it once page motion has claimed its elements).
   */
  const html = typeof resolved === 'string' ? resolved : '';
  const prerendered =
    !current &&
    document.documentElement.dataset.prerendered === path &&
    outlet.dataset.prerenderHash === hashHTML(html);
  if (!prerendered) outlet.innerHTML = html;
  // Diagnostic for the probes: on a prerendered document, was the baked
  // markup kept or replaced? Set once, on the first render only.
  if (!current && document.documentElement.dataset.prerendered)
    outlet.dataset.hydration = prerendered ? 'kept' : 'rendered';
  delete outlet.dataset.prerenderHash;
  applyBaseToLinks(outlet);
  current = { path, params: view.params, meta: view.meta };

  document.title = view.meta?.title
    ? `${typeof view.meta.title === 'function' ? view.meta.title(view.params) : view.meta.title} — Tour Archive`
    : 'Tour Archive';

  if (scroll && !isPop) window.scrollTo({ top: 0, behavior: 'instant' });

  if (onAfter) await onAfter({ path, params: view.params, outlet, isPop });
}

export function getCurrent() {
  return current;
}

export function start() {
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
      return;
    const a = e.target.closest('a[href]');
    if (!a) return;

    const href = a.getAttribute('href');
    if (!href || a.target === '_blank' || a.hasAttribute('download')) return;
    if (/^(https?:)?\/\//i.test(href) || /^(mailto:|tel:)/i.test(href)) return;

    if (href.startsWith('#')) {
      e.preventDefault();
      document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    e.preventDefault();
    navigate(href);
  });

  window.addEventListener('popstate', () => render({ isPop: true }));
  return render({ scroll: false });
}
