/**
 * Minimal DOM shim for rendering the site's views in Node.
 *
 * The page modules are pure string renderers, but the modules they import
 * (motion.js, router.js, chrome.js) touch `window` and `document` at load
 * time — matchMedia, location, requestAnimationFrame. This installs just
 * enough of a browser for those to load; nothing here renders.
 *
 * Shared by scripts/smoke.mjs (which still carries its own inline copy — the
 * two must stay equivalent) and scripts/prerender.mjs. Install BEFORE the
 * first `import()` of anything under src/.
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

/**
 * Install the shim on globalThis. `pathname` and `search` seed
 * window.location so routes that read the URL (the archive's filter state)
 * render the canonical, unfiltered view.
 */
export function installDomShim({ pathname = '/', search = '', origin = 'http://localhost' } = {}) {
  globalThis.window = {
    matchMedia: () => ({ matches: false, addEventListener: noop }),
    addEventListener: noop,
    location: { pathname, search, hash: '', origin },
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
  return globalThis.window;
}

/** Point the shimmed location at another route between renders. */
export function setShimLocation(pathname, search = '') {
  if (!globalThis.window?.location) throw new Error('installDomShim() first');
  globalThis.window.location.pathname = pathname;
  globalThis.window.location.search = search;
}
