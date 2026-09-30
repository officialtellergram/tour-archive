# Security headers — the Cloudflare runbook

Tour Archive is a static Vite build on GitHub Pages. Pages cannot set response
headers, so every security header the site sends is added at the edge by
Cloudflare, which fronts `tourarchive.us`. This document is the exact rule to
add, header by header, why each value is what it is, what is deliberately
deferred, and how to prove it landed.

Measured 2026-09-29 with `npm run headers`: the live site sends **none** of the
headers below. HTML is served with `cache-control: max-age=600` through
Cloudflare; deep routes answer `404` with `404.html` (the Pages SPA fallback),
which matters for scoping — see "Where the rule must match".

## What the site is

The facts the recommendations rest on:

- A single-page shop. One inline `<script>` in the head of `index.html` (the
  home-route hero preload shim), Vite-hashed JS/CSS from the same origin,
  photos from the same origin.
- The two typefaces are self-hosted from `public/fonts/` (declared in
  `src/styles/fonts.css`); the page loads no third-party resources.
- Embeds nothing: no third-party iframes, no analytics, no tag manager.
- Checkout **redirects** to Stripe Payment Links (`buy.stripe.com`) in a new
  document. Stripe is never embedded on the page today.
- The two forms (drop-list signup, Sell to Us) open a `mailto:` via script;
  there is no form backend. The Procurement Desk (`/curate`) and the
  first-party error beacon (`src/lib/errors.js`) talk to the Supabase origin.

So: nothing on the site needs a camera, a microphone, a location, or to be
framed by another site. That is what makes the lock-down below safe.

## The rule

Cloudflare dashboard → the `tourarchive.us` zone → **Rules → Transform Rules →
Modify Response Header** → *Create rule*.

- **Rule name:** `security headers`
- **When incoming requests match:** *All incoming requests*  
  (If you prefer an expression: `(http.host eq "tourarchive.us") or (http.host eq "www.tourarchive.us")`.)
- **Then:** *Set static* — one row per header below.

| Header | Value |
| --- | --- |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `X-Frame-Options` | `DENY` |
| `Cross-Origin-Opener-Policy` | `same-origin` |

Deploy the rule. Header changes take effect at the edge within seconds; there
is nothing to purge.

### As a Snippet instead

If the zone is on a plan with Snippets, or you want the rule in version control,
the equivalent Snippet (Rules → Snippets, match *All incoming requests*):

```js
export default {
  async fetch(request) {
    const response = await fetch(request);
    const headers = new Headers(response.headers);
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    headers.set('X-Frame-Options', 'DENY');
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};
```

Use one or the other, not both — two sources of the same header is how values
drift.

### Where the rule must match

Match **all** requests, not `http.response.code eq 200`. GitHub Pages serves
every deep link (`/terms`, `/item/…`, `/collections/…`) as `404.html` with a
`404` status and lets the SPA boot from it. A rule scoped to successful
responses would protect the home page and nothing a customer arrives at from a
shared link. `npm run headers` probes `/terms` for exactly this reason.

## Header by header

### Strict-Transport-Security: `max-age=31536000; includeSubDomains`

Tells the browser to speak only HTTPS to this host for a year, so an
`http://tourarchive.us` link typed or pasted anywhere is upgraded before a
request leaves the machine. `includeSubDomains` extends that to `www.` and
any future subdomain; it is safe because nothing under the domain is served
plain-HTTP (Cloudflare's *Always Use HTTPS* should be on as well — this header
is belt to that brace).

**Preload is a later step, on purpose.** Adding `; preload` and submitting to
[hstspreload.org](https://hstspreload.org) bakes the domain into every browser's
built-in list. It is the strongest protection and it is effectively
irreversible (removal takes months to propagate). Do it once the rule above has
been live for a few weeks with no HTTPS surprises on any subdomain.

Cloudflare also offers HSTS under SSL/TLS → Edge Certificates → *HTTP Strict
Transport Security*. Either place works; the Transform Rule keeps every header
in one screen.

### X-Content-Type-Options: `nosniff`

Stops the browser second-guessing `Content-Type`. Without it a mis-typed file
can be sniffed into a script. The site serves hashed assets with correct types,
so the header costs nothing and closes the door.

### Referrer-Policy: `strict-origin-when-cross-origin`

Same-origin navigations keep the full referrer (the archive's own analytics of
the future would still work). Cross-origin navigations — the click through to
Stripe — send only `https://tourarchive.us`, never the piece's URL. It is also
the modern browser default, made explicit so it does not depend on the
visitor's browser.

### Permissions-Policy: `camera=(), microphone=(), geolocation=()`

Denies the three capabilities a shop has no business asking for, to this
document and to anything it might embed.

**Do not add `payment=()`.** Checkout today is a redirect, so it would be
harmless — but the moment Stripe Payment Links (or Checkout, or a Payment
Element) is embedded as an iframe, `payment=()` would block the Payment
Request API inside it and Apple Pay / Google Pay would silently vanish. Leave
`payment` unset (browser default: allowed for same-origin, delegable to the
Stripe frame with `allow="payment"`).

### X-Frame-Options: `DENY`

No other site may put Tour Archive in an iframe; this is the whole of the
clickjacking defence for a site with no login. `DENY` rather than
`SAMEORIGIN` because the site never frames itself either. The CSP equivalent
is `frame-ancestors 'none'` — when a CSP eventually ships (below), carry this
over and the probe accepts either.

### Cross-Origin-Opener-Policy: `same-origin`

Puts the page in its own browsing-context group, so a page that opened it
(or one it opens) cannot reach back through `window.opener`. Stripe opens from
a plain link, not `window.open`, so nothing on the site relies on an opener
relationship. Note this is COOP only — no `Cross-Origin-Embedder-Policy`,
which would force every cross-origin resource to opt in, and buys nothing for
a site that never needs `SharedArrayBuffer`.

## Content-Security-Policy: deferred

A real CSP is the header that would actually stop injected script, and it is
not in the rule above because the site cannot honour a strict one yet:

- `index.html` carries an inline head `<script>` — the hero preload shim that
  has to run at parse time, before Vite's bundle. `script-src 'self'` alone
  would block it.
- The page templates render with inline `style="…"` attributes throughout
  (roughly 170 of them across `src/pages` and `src/components`), which
  `style-src` treats as inline styles and refuses without `'unsafe-inline'`
  or a hash per attribute.

Shipping `script-src 'self'` today would break the preload shim; shipping
`script-src 'self' 'unsafe-inline'` grants exactly the thing a CSP exists to
refuse, and buys nothing.

The path to a CSP worth having:

1. **Hash the head script.** The shim is static (Vite substitutes
   `%BASE_URL%` at build time, so hash the *built* `dist/index.html`), and its
   SHA-256 can go straight into `script-src 'self' 'sha256-…'`. A small step in
   `scripts/snapshot.mjs` can compute the hash from `dist/index.html` and print
   it, so the Cloudflare rule never drifts from the build. Nonces are the
   alternative, but a nonce must differ per response and GitHub Pages cannot
   mint one — hashes are the static-host answer.
2. **Move inline styles out.** Replace `style="…"` attributes with classes and
   let the motion code set styles via the CSSOM (`el.style.x = …` is allowed;
   only `style` *attributes* and `<style>` blocks are governed). Then
   `style-src 'self'` becomes possible. Until then,
   `style-src 'self' 'unsafe-inline'` is the honest interim — styles are far less dangerous than scripts.
3. **Start in report-only.** `Content-Security-Policy-Report-Only` with the
   intended policy, watch the console on every route (the a11y and ux probes
   can be taught to collect `securitypolicyviolation` events), then promote.

A target policy, once 1 and 2 are done:

```
default-src 'self';
script-src 'self' 'sha256-<head-shim-hash>';
style-src 'self';
img-src 'self' data:;
font-src 'self';
connect-src 'self' https://ulavwoubrjyvbbaxaweh.supabase.co;
form-action 'self' https://buy.stripe.com;
frame-ancestors 'none';
base-uri 'self';
object-src 'none';
upgrade-insecure-requests
```

`connect-src` already names the Supabase origin because the Procurement Desk
(`/curate`) and the error beacon (`src/lib/errors.js`) post to it from the
public build. If Stripe is embedded, add `frame-src https://js.stripe.com
https://checkout.stripe.com` and `script-src https://js.stripe.com`.

## Verify

```
npm run headers
```

Fetches `https://tourarchive.us/` and `/terms`, prints every header above with
its value, and exits 1 while any of the three required ones
(`Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`) is
missing. Weak values (a short HSTS `max-age`, a `Referrer-Policy` that leaks
paths, a `Permissions-Policy` that forgets the camera) warn. Pass another
origin as the argument to check a staging host.

For a second opinion: [securityheaders.com](https://securityheaders.com/?q=tourarchive.us)
grades the same set (expect an A once the rule is live; A+ needs the CSP).

It is not part of `npm run check` because it needs the network and the live
site; run it after touching anything in the Cloudflare zone, and once a month
otherwise.
