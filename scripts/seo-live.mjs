/**
 * Search probe — what a crawler gets from the LIVE origin.
 *
 * Every other search check reads the repo or dist/. This one asks the deployed
 * site the questions Googlebot asks, with plain fetch and no browser:
 *
 *   http://tourarchive.us/        → 301 to https (Cloudflare "Always Use HTTPS")
 *   https://www.tourarchive.us/   → 301 to the apex (one canonical host)
 *   /                             → 200
 *   /archive                      → 200, not the Pages 404.html fallback
 *   /sitemap.xml                  → 200, well-formed, N URLs, every one on the
 *                                   canonical origin
 *   /robots.txt                   → 200, names the sitemap by its full URL
 *   one item URL from the sitemap → 200, <link rel="canonical"> equal to
 *                                   itself, exactly one <h1>
 *   Strict-Transport-Security     → present on the https home page
 *
 *   node scripts/seo-live.mjs                      # https://tourarchive.us
 *   node scripts/seo-live.mjs https://staging.host  # another origin
 *   npm run seo:live
 *
 * Exit 1 on any red. Not part of `npm run check` — it needs the network and
 * the live site. Run it after a deploy and after touching the Cloudflare zone;
 * docs/SEARCH.md is the runbook the reds point at.
 */

// The origin may arrive with or without a scheme ("tourarchive.us" works, so
// Git Bash never rewrites a leading slash into a Windows path).
const RAW = process.argv.slice(2).find((a) => !a.startsWith('-')) || 'https://tourarchive.us';
const ORIGIN = (/^https?:\/\//i.test(RAW) ? RAW : `https://${RAW}`).replace(/\/+$/, '');
const HOST = new URL(ORIGIN).host;
const APEX = HOST.replace(/^www\./, '');
const C = { red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', dim: '\x1b[2m', bold: '\x1b[1m', off: '\x1b[0m' };
const UA = 'tour-archive-seo-probe (+https://tourarchive.us)';
const TIMEOUT_MS = 20_000;

let reds = 0;
let ambers = 0;
const red = (msg) => { reds += 1; console.log(`${C.red}   ✖ ${msg}${C.off}`); };
const amber = (msg) => { ambers += 1; console.log(`${C.yellow}   ⚠ ${msg}${C.off}`); };
const green = (msg) => console.log(`${C.green}   ✔${C.off} ${msg}`);
const note = (msg) => console.log(`${C.dim}   · ${msg}${C.off}`);
const head = (title) => console.log(`\n${C.bold}${title}${C.off}`);

/** fetch that never throws: a network failure comes back as { error }. */
async function get(url, { follow = false } = {}) {
  try {
    const res = await fetch(url, {
      redirect: follow ? 'follow' : 'manual',
      headers: { 'user-agent': UA, accept: 'text/html,application/xml,text/plain,*/*' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    return { res, text };
  } catch (err) {
    return { error: err.message };
  }
}

const isRedirect = (s) => s === 301 || s === 308 || s === 302 || s === 307;
const permanent = (s) => s === 301 || s === 308;

console.log(`\n${C.dim}── Tour Archive · search probe · ${ORIGIN} ──${C.off}`);

/* 1 ─ plain http must bounce to https, permanently */
head('http → https');
{
  const url = `http://${APEX}/`;
  const { res, error } = await get(url);
  if (error) red(`${url} — ${error}`);
  else if (!isRedirect(res.status)) {
    red(`${url} answered ${res.status} — served over plain http; Cloudflare "Always Use HTTPS" is off (docs/SEARCH.md § B)`);
  } else {
    const loc = res.headers.get('location') || '';
    const wantPrefix = `https://${APEX}`;
    if (!loc.startsWith(wantPrefix)) red(`${url} → ${res.status} ${loc} — must land on ${wantPrefix}/`);
    else if (!permanent(res.status)) amber(`${url} → ${res.status} ${loc} — redirects, but a temporary code; search engines want 301`);
    else green(`${url} → ${res.status} ${loc}`);
  }
}

/* 2 ─ www must bounce to the apex, permanently */
head('www → apex');
if (HOST !== APEX) {
  note(`origin given as ${HOST}; skipping the www check`);
} else {
  const url = `https://www.${APEX}/`;
  const { res, error } = await get(url);
  if (error) red(`${url} — ${error}`);
  else if (!isRedirect(res.status)) {
    red(`${url} answered ${res.status} — two hosts serve the same pages; the archive needs one canonical host`);
  } else {
    const loc = res.headers.get('location') || '';
    if (!/^https:\/\//.test(loc) || new URL(loc).host !== APEX) red(`${url} → ${res.status} ${loc} — must land on https://${APEX}/`);
    else if (!permanent(res.status)) amber(`${url} → ${res.status} ${loc} — redirects, but a temporary code; search engines want 301`);
    else green(`${url} → ${res.status} ${loc}`);
  }
}

/* 3 ─ the home page, and the HSTS header on it */
head('/');
let homeHtml = '';
{
  const url = `${ORIGIN}/`;
  const { res, text, error } = await get(url);
  if (error) red(`${url} — ${error}`);
  else {
    if (res.status === 200) green(`${url} — 200`);
    else red(`${url} — ${res.status}`);
    homeHtml = text || '';
    const hsts = res.headers.get('strict-transport-security');
    if (!hsts) red('Strict-Transport-Security missing — enable HSTS in Cloudflare (docs/SEARCH.md § B, docs/SECURITY-HEADERS.md)');
    else {
      const age = Number((/max-age=(\d+)/i.exec(hsts) || [])[1] || 0);
      if (age < 15_552_000) amber(`Strict-Transport-Security: ${hsts} — max-age is under six months`);
      else green(`Strict-Transport-Security: ${hsts}`);
    }
    const og = /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i.exec(homeHtml)?.[1]
      || /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["']/i.exec(homeHtml)?.[1];
    if (og) note(`og:image ${og}`);
    const cc = res.headers.get('cache-control');
    if (cc) note(`cache-control: ${cc}`);
  }
}

/* 4 ─ a deep route must be a real 200, not the 404.html fallback */
head('/archive');
{
  const url = `${ORIGIN}/archive`;
  const { res, error } = await get(url, { follow: true });
  if (error) red(`${url} — ${error}`);
  else if (res.status === 404) red(`${url} — 404: the Pages fallback (404.html) is serving this route; the prerender has not deployed`);
  else if (res.status !== 200) red(`${url} — ${res.status}`);
  else {
    if (res.url !== url) amber(`${url} — 200 after a redirect to ${res.url}; the sitemap and canonical must use the served form`);
    else green(`${url} — 200`);
  }
}

/* 5 ─ the sitemap: present, well-formed, on the canonical origin */
head('/sitemap.xml');
const locs = [];
{
  const url = `${ORIGIN}/sitemap.xml`;
  const { res, text, error } = await get(url, { follow: true });
  if (error) red(`${url} — ${error}`);
  else if (res.status !== 200) red(`${url} — ${res.status}: no sitemap; nothing tells Google the deep routes exist`);
  else {
    const xml = (text || '').trim();
    const type = res.headers.get('content-type') || '';
    if (!/xml/i.test(type)) amber(`${url} served as "${type}" — should be application/xml or text/xml`);
    const opens = (xml.match(/<url>/g) || []).length;
    const closes = (xml.match(/<\/url>/g) || []).length;
    const wellFormed = /^<\?xml[^>]*\?>\s*<urlset\b[^>]*xmlns=["']http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9["'][^>]*>/.test(xml)
      && /<\/urlset>\s*$/.test(xml)
      && opens === closes
      && !/<html/i.test(xml);
    for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) locs.push(m[1].trim());
    if (!wellFormed) red(`${url} — 200 but not a well-formed urlset (${opens} <url>, ${closes} </url>)`);
    else if (!locs.length) red(`${url} — well-formed but lists no URLs`);
    else {
      const offOrigin = locs.filter((l) => !l.startsWith(`${ORIGIN}/`) && l !== ORIGIN);
      const www = locs.filter((l) => /^https?:\/\/www\./i.test(l));
      const dupes = locs.length - new Set(locs).size;
      if (offOrigin.length) red(`${offOrigin.length} URL(s) are not on ${ORIGIN} — first: ${offOrigin[0]}`);
      if (www.length) red(`${www.length} URL(s) use www — the canonical host is the apex`);
      if (dupes) amber(`${dupes} duplicate URL(s) in the sitemap`);
      if (!offOrigin.length && !www.length) green(`${url} — 200, well-formed, ${locs.length} URLs`);
      const items = locs.filter((l) => /\/item\//.test(l)).length;
      const colls = locs.filter((l) => /\/collections\//.test(l)).length;
      note(`${items} item pages, ${colls} collection pages, ${locs.length - items - colls} other`);
    }
  }
}

/* 6 ─ robots.txt names the sitemap by its full canonical URL */
head('/robots.txt');
{
  const url = `${ORIGIN}/robots.txt`;
  const { res, text, error } = await get(url, { follow: true });
  if (error) red(`${url} — ${error}`);
  else if (res.status !== 200) red(`${url} — ${res.status}: no robots.txt of our own`);
  else if (/<html/i.test(text || '')) red(`${url} — 200 but the body is HTML (the SPA shell), not a robots file`);
  else {
    const want = `Sitemap: ${ORIGIN}/sitemap.xml`;
    const lines = (text || '').split(/\r?\n/).map((l) => l.trim());
    if (lines.includes(want)) green(`${url} — 200, "${want}"`);
    else red(`${url} — 200 but does not contain "${want}"`);
    const disallowAll = lines.some((l) => /^Disallow:\s*\/\s*$/i.test(l));
    if (disallowAll) red(`${url} disallows / — the whole site is blocked from crawling`);
  }
}

/* 7 ─ one item page, as a crawler reads it */
head('a sampled item page');
{
  const items = locs.filter((l) => /\/item\//.test(l));
  if (!items.length) {
    red('no /item/ URL in the sitemap to sample');
  } else {
    const url = items[Math.floor(Math.random() * items.length)];
    const { res, text, error } = await get(url, { follow: true });
    if (error) red(`${url} — ${error}`);
    else if (res.status !== 200) red(`${url} — ${res.status}${res.status === 404 ? ' (the Pages fallback)' : ''}`);
    else {
      if (res.url !== url) red(`${url} — 200 after a redirect to ${res.url}; the sitemap URL must be the served one`);
      else green(`${url} — 200`);
      const html = text || '';
      const tag = /<link\b[^>]*\brel=["']canonical["'][^>]*>/i.exec(html)?.[0] || '';
      const canonical = /\bhref=["']([^"']+)["']/i.exec(tag)?.[1] || '';
      if (!canonical) red('no <link rel="canonical"> in the served HTML');
      else if (canonical !== url) red(`canonical is ${canonical}, page is ${url} — they must be identical`);
      else green(`canonical equals itself`);
      const h1s = (html.match(/<h1[\s>]/gi) || []).length;
      if (h1s === 1) green('one <h1>');
      else red(`${h1s} <h1> elements in the served HTML — a crawler needs exactly one`);
      const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() || '';
      const desc = /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i.exec(html)?.[1]
        || /<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i.exec(html)?.[1] || '';
      note(`title: ${title || '(none)'}`);
      if (!desc) amber('no meta description in the served HTML');
      else if (homeHtml && desc === (/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i.exec(homeHtml)?.[1] || '')) amber('meta description is the home page\'s — not per-page');
      else note(`description: ${desc.slice(0, 90)}${desc.length > 90 ? '…' : ''}`);
      const ld = /<script[^>]+type=["']application\/ld\+json["']/i.test(html);
      note(ld ? 'schema.org JSON-LD present' : 'no schema.org JSON-LD');
    }
  }
}

/* ─ summary */
console.log(`\n${C.dim}── summary ──${C.off}`);
if (reds) console.log(`${C.red}✖ ${reds} red${reds === 1 ? '' : 's'}${ambers ? `, ${ambers} amber` : ''} — docs/SEARCH.md has the fix for each${C.off}\n`);
else if (ambers) console.log(`${C.yellow}⚠ no reds, ${ambers} amber${C.off}\n`);
else console.log(`${C.green}✔ the live site answers a crawler correctly on every count${C.off}\n`);

process.exitCode = reds ? 1 : 0;
