/**
 * Security-headers probe — what the edge actually sends.
 *
 * GitHub Pages cannot set response headers, so every security header the
 * site carries is added by Cloudflare in front of it (docs/SECURITY-HEADERS.md
 * has the rule to add). Rules drift, get disabled, get scoped to the wrong
 * hostname; this fetches the live origin and reports what a browser really
 * receives, on the home page and on one deep route (which exercises the SPA
 * fallback path and proves the rule is not scoped to "/" alone).
 *
 *   node scripts/headers-probe.mjs                       # https://tourarchive.us
 *   node scripts/headers-probe.mjs https://staging.example
 *
 * Exit 1 when any of the three headers every static site should carry is
 * missing — Strict-Transport-Security, X-Content-Type-Options,
 * Referrer-Policy. The rest (Permissions-Policy, framing, COOP) warn.
 * No browser needed; plain fetch.
 */

const ORIGIN = (process.argv.find((a) => /^https?:\/\//.test(a)) || 'https://tourarchive.us').replace(/\/+$/, '');
const C = { red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', dim: '\x1b[2m', bold: '\x1b[1m', off: '\x1b[0m' };

const ROUTES = ['/', '/terms'];

/**
 * Each check: the header(s) that satisfy it, whether its absence fails the
 * run, and an optional value test that turns a present-but-weak header into
 * a warning rather than a pass.
 */
const CHECKS = [
  {
    name: 'Strict-Transport-Security',
    headers: ['strict-transport-security'],
    required: true,
    want: 'max-age=31536000; includeSubDomains',
    judge: (v) => {
      const age = Number((/max-age=(\d+)/i.exec(v) || [])[1] || 0);
      if (age < 31536000) return `max-age ${age} is under a year`;
      if (!/includesubdomains/i.test(v)) return 'includeSubDomains missing';
      return null;
    },
  },
  {
    name: 'X-Content-Type-Options',
    headers: ['x-content-type-options'],
    required: true,
    want: 'nosniff',
    judge: (v) => (/^nosniff$/i.test(v.trim()) ? null : `expected nosniff, got "${v}"`),
  },
  {
    name: 'Referrer-Policy',
    headers: ['referrer-policy'],
    required: true,
    want: 'strict-origin-when-cross-origin',
    judge: (v) => (/^(strict-origin-when-cross-origin|no-referrer|same-origin|strict-origin)$/i.test(v.trim()) ? null : `"${v}" leaks more than strict-origin-when-cross-origin`),
  },
  {
    name: 'Permissions-Policy',
    headers: ['permissions-policy'],
    required: false,
    want: 'camera=(), microphone=(), geolocation=()',
    judge: (v) => (/camera=\(\)/i.test(v) && /microphone=\(\)/i.test(v) && /geolocation=\(\)/i.test(v) ? null : 'does not deny camera, microphone and geolocation'),
  },
  {
    name: 'X-Frame-Options / frame-ancestors',
    headers: ['x-frame-options', 'content-security-policy'],
    required: false,
    want: 'DENY (or CSP frame-ancestors \'none\')',
    judge: (v, name) => {
      if (name === 'x-frame-options') return /^(deny|sameorigin)$/i.test(v.trim()) ? null : `"${v}" is not DENY or SAMEORIGIN`;
      return /frame-ancestors/i.test(v) ? null : 'CSP present but has no frame-ancestors directive';
    },
  },
  {
    name: 'Cross-Origin-Opener-Policy',
    headers: ['cross-origin-opener-policy'],
    required: false,
    want: 'same-origin',
    judge: (v) => (/^same-origin/i.test(v.trim()) ? null : `"${v}" — same-origin recommended`),
  },
];

console.log(`\n${C.dim}── Tour Archive · security headers · ${ORIGIN} ──${C.off}`);

let failures = 0;
let warnings = 0;

for (const route of ROUTES) {
  const url = `${ORIGIN}${route}`;
  let res;
  try {
    res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'tour-archive-headers-probe' } });
  } catch (err) {
    failures += 1;
    console.log(`\n${C.bold}${route}${C.off}\n${C.red}   ✖ fetch failed: ${err.message}${C.off}`);
    continue;
  }
  const server = res.headers.get('server') || '';
  const via = res.headers.get('cf-ray') ? 'cloudflare' : server || 'unknown';
  console.log(`\n${C.bold}${route}${C.off} ${C.dim}— HTTP ${res.status}, ${res.url !== url ? `landed on ${res.url}, ` : ''}served via ${via}${C.off}`);
  // GitHub Pages answers every deep route with 404.html and a 404 status; the
  // SPA boots from that body. Not a fault here — but the header rule has to
  // match on the 404 too, which is exactly why a deep route is probed.
  if (res.status === 404 && route !== '/') console.log(`${C.dim}   · 404 status is the Pages SPA fallback (404.html) — expected for a deep route${C.off}`);

  for (const check of CHECKS) {
    const hit = check.headers.map((h) => [h, res.headers.get(h)]).find(([, v]) => v);
    if (!hit) {
      if (check.required) {
        failures += 1;
        console.log(`${C.red}   ✖ ${check.name}${C.off} ${C.dim}missing — want: ${check.want}${C.off}`);
      } else {
        warnings += 1;
        console.log(`${C.yellow}   ⚠ ${check.name}${C.off} ${C.dim}missing — want: ${check.want}${C.off}`);
      }
      continue;
    }
    const [name, value] = hit;
    const weak = check.judge ? check.judge(value, name) : null;
    if (weak) {
      warnings += 1;
      console.log(`${C.yellow}   ⚠ ${check.name}${C.off} ${C.dim}${name}: ${value} — ${weak}${C.off}`);
    } else {
      console.log(`${C.green}   ✔ ${check.name}${C.off} ${C.dim}${name}: ${value}${C.off}`);
    }
  }

  // Not graded, but worth seeing: a CSP that exists at all, and what the
  // cache is doing to the HTML shell.
  const csp = res.headers.get('content-security-policy');
  const cacheControl = res.headers.get('cache-control');
  console.log(`${C.dim}   · content-security-policy: ${csp || 'none (deferred — see docs/SECURITY-HEADERS.md)'}${C.off}`);
  if (cacheControl) console.log(`${C.dim}   · cache-control: ${cacheControl}${C.off}`);
}

console.log(`\n${C.dim}── summary ──${C.off}`);
if (failures) console.log(`${C.red}✖ ${failures} required header(s) missing — add the Cloudflare rule in docs/SECURITY-HEADERS.md${C.off}\n`);
else if (warnings) console.log(`${C.yellow}⚠ required headers present, ${warnings} recommended one(s) missing or weak${C.off}\n`);
else console.log(`${C.green}✔ every header present and sane on every route${C.off}\n`);

process.exitCode = failures ? 1 : 0;
