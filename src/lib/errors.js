/**
 * First-party error beacon.
 *
 * When the site itself breaks in a visitor's browser — an uncaught exception
 * or an unhandled promise rejection — this posts the error message and the
 * page path to our own Supabase table (supabase/site_errors.sql) so we can
 * fix it. No third-party SDK, no cookie, no visitor id, no session: a row is
 * a message, a path, a stack, a user-agent string and a referrer path. The
 * privacy page (/privacy, "What the plumbing sees") describes exactly this,
 * so anything added here must be added there too.
 *
 * Dormant by default. It is a no-op until ERRORS_ENABLED in
 * src/curate/config.js is true, and always a no-op under `vite dev` — dev
 * errors belong in the console, not the table. Flip the flag only once the
 * table exists (docs/OPERATIONS.md § Error tracking); until then the anon
 * key has nowhere to insert and the request would just 404.
 *
 * Guard rails, because an error reporter is the one script that must never
 * itself become the problem:
 *   - at most MAX_REPORTS rows per page load, identical messages sent once;
 *   - errors raised by browser extensions (a source or stack on some other
 *     origin) are dropped — they are not ours to fix;
 *   - the opaque cross-origin "Script error." with no detail is dropped;
 *   - every field is truncated to the table's CHECK limits client-side, so a
 *     row never bounces for length;
 *   - transport failures are swallowed — a failed report is not an error.
 *
 * Transport: `fetch` with `keepalive: true`, which is what sendBeacon is
 * under the hood, but with headers — PostgREST needs the apikey. sendBeacon
 * proper cannot set headers, so it is only the fallback when fetch is
 * missing, carrying the apikey in the query string instead (the gateway
 * accepts it there, and the key is public anyway — see config.js).
 *
 * The pure parts (path cleaning, the drop rules, the payload shape) and
 * `createReporter` take everything as arguments so scripts/integration.mjs
 * can pin them in Node with a fake window. `installErrorBeacon` is the one
 * line main.js calls.
 */

import { SUPABASE_URL, SUPABASE_ANON_KEY, ERRORS_ENABLED } from '../curate/config.js';

/** Rows per page load, after de-duplication. */
export const MAX_REPORTS = 3;
/** Mirror of the CHECK constraints in supabase/site_errors.sql. */
export const LIMITS = Object.freeze({
  message: 2000,
  stack: 2000,
  path: 512,
  source: 512,
  ua: 512,
  ref: 512,
});
export const TABLE = 'site_errors';

const EXTENSION_RX = /\b(?:chrome|moz|safari|safari-web|ms-browser)-extension:\/\//i;
const URL_RX = /https?:\/\/[^\s)'"]+/g;

/** Trims text to `n` characters; anything else becomes the empty string. */
export function truncate(value, n) {
  if (value == null) return '';
  const s = typeof value === 'string' ? value : String(value);
  return s.length > n ? s.slice(0, n) : s;
}

/**
 * Path only — query strings and hashes never leave the browser. Accepts a
 * Location-like object, a full URL, or a bare path; falls back to '/'.
 */
export function cleanPath(input, origin = '') {
  if (!input) return '/';
  let s = typeof input === 'string' ? input : input.pathname || input.href || '';
  if (typeof s !== 'string' || !s) return '/';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      if (origin && u.origin !== origin) return '';
      s = u.pathname;
    } catch {
      return '/';
    }
  }
  const cut = s.search(/[?#]/);
  if (cut !== -1) s = s.slice(0, cut);
  return s || '/';
}

/**
 * Is this ours to fix? False for anything that names an extension scheme, or
 * whose source/stack cites URLs none of which are on our origin. An error
 * with no URL anywhere (a thrown string, a rejection with a bare reason) is
 * kept — there is nothing to prove it foreign.
 */
export function isOurs({ source = '', stack = '' } = {}, origin = '') {
  const text = `${source || ''}\n${stack || ''}`;
  if (EXTENSION_RX.test(text)) return false;
  const urls = text.match(URL_RX) || [];
  if (!urls.length) return true;
  if (!origin) return true;
  return urls.some((u) => u.startsWith(origin));
}

/** The opaque cross-origin signal: no message worth storing, no location. */
export function isOpaque({ message = '', source = '', line = 0 } = {}) {
  const m = String(message || '').trim();
  if (!m) return true;
  return /^Script error\.?$/i.test(m) && !source && !line;
}

/**
 * Normalises whatever the two window events hand us into one flat record.
 * `kind` is 'error' | 'unhandledrejection'; the rejection reason may be an
 * Error, a string, or anything at all.
 */
export function describe(kind, ev) {
  if (kind === 'unhandledrejection') {
    const r = ev?.reason;
    const isErr = r && typeof r === 'object' && ('message' in r || 'stack' in r);
    const message = isErr ? String(r.message || r.name || 'Unhandled rejection') : String(r ?? 'Unhandled rejection');
    return {
      message: `Unhandled rejection: ${message}`,
      source: '',
      line: 0,
      col: 0,
      stack: isErr && r.stack ? String(r.stack) : '',
    };
  }
  const err = ev?.error;
  return {
    // No fallback label: a blank message is nothing worth a row, and
    // isOpaque() drops it.
    message: String(ev?.message || (err && err.message) || ''),
    source: String(ev?.filename || ''),
    line: Number(ev?.lineno) || 0,
    col: Number(ev?.colno) || 0,
    stack: err && err.stack ? String(err.stack) : '',
  };
}

/**
 * The row, in the table's column names, every text field already truncated
 * to the CHECK limits. Nothing here identifies a person.
 */
export function buildPayload(info, { location, referrer = '', ua = '', origin = '' } = {}) {
  return {
    path: truncate(cleanPath(location, origin), LIMITS.path),
    message: truncate(info.message, LIMITS.message),
    source: truncate(info.source, LIMITS.source),
    line: Number.isFinite(info.line) ? info.line : 0,
    col: Number.isFinite(info.col) ? info.col : 0,
    stack: truncate(info.stack, LIMITS.stack),
    ua: truncate(ua, LIMITS.ua),
    ref: truncate(referrer ? cleanPath(referrer) : '', LIMITS.ref),
  };
}

/** Default transport: fetch keepalive with headers; sendBeacon as fallback. */
export function defaultTransport(win) {
  return (endpoint, key, body) => {
    const json = JSON.stringify(body);
    if (typeof win.fetch === 'function') {
      try {
        const p = win.fetch(endpoint, {
          method: 'POST',
          keepalive: true,
          headers: {
            'Content-Type': 'application/json',
            apikey: key,
            Authorization: `Bearer ${key}`,
            Prefer: 'return=minimal',
          },
          body: json,
        });
        if (p && typeof p.catch === 'function') p.catch(() => {});
        return true;
      } catch {
        /* fall through to the beacon */
      }
    }
    const beacon = win.navigator && win.navigator.sendBeacon;
    if (typeof beacon === 'function') {
      try {
        const sep = endpoint.includes('?') ? '&' : '?';
        const blob = typeof win.Blob === 'function' ? new win.Blob([json], { type: 'application/json' }) : json;
        return Boolean(beacon.call(win.navigator, `${endpoint}${sep}apikey=${encodeURIComponent(key)}`, blob));
      } catch {
        return false;
      }
    }
    return false;
  };
}

/**
 * Builds a reporter bound to one window. Returns:
 *   install()  — attaches the two listeners; false (and attaches nothing)
 *                when disabled or in dev;
 *   report(kind, ev) — runs the drop rules and sends; returns true when a
 *                row was posted, false when it was dropped;
 *   sent       — how many rows this page load has posted.
 */
export function createReporter({
  win,
  enabled = ERRORS_ENABLED,
  dev = false,
  url = SUPABASE_URL,
  key = SUPABASE_ANON_KEY,
  transport,
  max = MAX_REPORTS,
} = {}) {
  const active = Boolean(enabled) && !dev && Boolean(url) && Boolean(key) && Boolean(win);
  const endpoint = url ? `${String(url).replace(/\/+$/, '')}/rest/v1/${TABLE}` : '';
  const send = transport || (win ? defaultTransport(win) : () => false);
  const seen = new Set();
  const reporter = { sent: 0, active };

  reporter.report = (kind, ev) => {
    if (!active || reporter.sent >= max) return false;
    let info;
    try {
      info = describe(kind, ev);
    } catch {
      return false;
    }
    const origin = (win.location && win.location.origin) || '';
    if (isOpaque(info) || !isOurs(info, origin)) return false;
    const fingerprint = `${info.message}|${info.source}|${info.line}|${info.col}`;
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    const payload = buildPayload(info, {
      location: win.location,
      referrer: (win.document && win.document.referrer) || '',
      ua: (win.navigator && win.navigator.userAgent) || '',
      origin,
    });
    let ok = false;
    try {
      ok = Boolean(send(endpoint, key, payload));
    } catch {
      ok = false;
    }
    if (ok) reporter.sent += 1;
    return ok;
  };

  reporter.install = () => {
    if (!active || typeof win.addEventListener !== 'function') return false;
    win.addEventListener('error', (ev) => reporter.report('error', ev));
    win.addEventListener('unhandledrejection', (ev) => reporter.report('unhandledrejection', ev));
    return true;
  };

  return reporter;
}

/**
 * The one call main.js makes, first thing in boot(). Inert unless
 * ERRORS_ENABLED is true, and always inert under `vite dev`.
 */
export function installErrorBeacon(win = typeof window !== 'undefined' ? window : null) {
  if (!win) return false;
  return createReporter({ win, dev: Boolean(import.meta.env?.DEV) }).install();
}
