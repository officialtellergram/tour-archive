/**
 * Minimal DOM shim for rendering the site's page functions in Node.
 *
 * Shared by scripts/smoke.mjs, scripts/seo-gate.mjs and scripts/prerender.mjs (and anything else that
 * wants to call a page function without a browser). It is deliberately tiny:
 * every element is the same inert object, queries find nothing, listeners are
 * swallowed. Page functions return HTML strings and only touch the DOM at
 * mount time, so this is enough to render every route.
 *
 * Install it BEFORE importing any src/ module — anime.js and motion.js sniff
 * for `window` at import time and expect the rAF pair once they find one.
 *
 *   import installDomShim from './lib/dom-shim.mjs';
 *   installDomShim();
 *   const { home } = await import('../src/pages/home.js');
 */

const noop = () => {};

export const fakeEl = {
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

/** A fresh inert element (own innerHTML, so callers can read back writes). */
export const makeEl = () => ({ ...fakeEl, style: {}, dataset: {} });

/**
 * Install the shim on globalThis. Returns the window/document it installed so
 * a caller can override a query or two (the SEO gate captures the chrome's
 * innerHTML this way). `pathname` seeds window.location for pages that read it.
 */
export function installDomShim({ pathname = '/', search = '', origin = 'http://localhost' } = {}) {
  globalThis.window = {
    matchMedia: () => ({ matches: false, addEventListener: noop }),
    addEventListener: noop,
    removeEventListener: noop,
    location: { pathname, search, hash: '', origin },
    scrollY: 0,
    innerWidth: 1440,
    innerHeight: 900,
    requestAnimationFrame: noop,
    open: noop,
  };
  globalThis.document = {
    ...fakeEl,
    createElement: () => makeEl(),
    body: makeEl(),
    documentElement: makeEl(),
  };
  globalThis.history = { pushState: noop, replaceState: noop };
  globalThis.matchMedia = window.matchMedia;
  // anime.js sniffs for a browser via `window`; once it finds one it expects the
  // full rAF pair to exist.
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = noop;
  window.requestAnimationFrame = globalThis.requestAnimationFrame;
  window.cancelAnimationFrame = noop;

  return { window: globalThis.window, document: globalThis.document };
}

export default installDomShim;

/** Move the shimmed location between renders (the prerender walks every route). */
export function setShimLocation(pathname, search = '') {
  if (!globalThis.window?.location) throw new Error('installDomShim() first');
  globalThis.window.location.pathname = pathname;
  globalThis.window.location.search = search;
}
