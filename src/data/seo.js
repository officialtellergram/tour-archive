/**
 * Search metadata.
 *
 * The site-wide defaults, the title and description of every static page,
 * the small override map that scripts/prerender.mjs consults before it
 * derives a description from data, and the fitting rules that hold every
 * description to 150–160 characters without cutting a word.
 *
 * Pure data and pure functions — no DOM, no imports — so the browser bundle
 * can read the titles (src/main.js) and the Node prerender can read all of it.
 * Nothing here is displayed on a page; it is what a search result shows.
 */

export const SITE = {
  /** Canonical origin. www redirects here; never emit it. */
  origin: 'https://tourarchive.us',
  name: 'Tour Archive',
  title: 'Vintage golf, sourced by tournament',
  description:
    'Vintage and thrifted golf apparel catalogued by the championship it belongs to. One of one, photographed in house, sold direct by the archive, never restocked.',
  /** Public-relative paths; the prerender makes them absolute. og.jpg is
   *  the landscape share card (public/brand/, lane ops). */
  ogImage: 'brand/og.jpg?v=1',
  logo: 'brand/logo.png?v=2',
};

/**
 * What the shop promises about delivery and returns, as schema.org wants it
 * (Offer.shippingDetails and Offer.hasMerchantReturnPolicy; Search Console
 * flags both when absent). These MIRROR the Terms of Sale page: flat $8 per
 * piece, US addresses only, out within 3 business days, 14 days to return,
 * return postage ours when the fault is ours and the buyer's otherwise.
 * Change the terms and this together. No transit time is stated because the
 * terms do not promise one; add `transitDays: [min, max]` when they do.
 */
export const COMMERCE = {
  country: 'US',
  currency: 'USD',
  shipping: 8,
  handlingDays: [0, 3],
  transitDays: null,
  returnDays: 14,
};

/** Static pages: the <title> stem (the router appends " — Tour Archive")
 *  and the description a search result shows. */
export const PAGES = {
  '/': {
    title: SITE.title,
    description: SITE.description,
  },
  '/collections': {
    title: 'Collections',
    description:
      'The drops and the open shelf. Every piece we buy is placed into the championship era it came from, and Basic Stock is listed as pieces are photographed.',
  },
  '/archive': {
    title: 'The Archive',
    description:
      'Everything Tour Archive holds, across every drop. Filter vintage golf apparel by status, championship, garment type or era. One of one, sold direct, no restock.',
  },
  '/mission': {
    title: 'Our Mission',
    description:
      'Iconic attire for golfers and fashion enthusiasts alike. We save what is worth saving: second-hand golf clothing, cleaned, refurbished and sold with care.',
  },
  '/sell': {
    title: 'Sell to Us',
    description:
      'We buy vintage golf apparel outright, from anywhere. Send photographs of the garment, the neck label and any faults; an answer within two working days.',
  },
  '/sizing': {
    title: 'Sizing & Condition',
    description:
      'Nothing in the archive was cut to a modern block, so buy on flat measurements rather than the label. Our size guide and four condition grades, explained.',
  },
  '/privacy': {
    title: 'Privacy',
    description:
      'What Tour Archive collects, which is almost nothing: no accounts, no cookies, no tracking. Checkout runs on a Stripe-hosted page and your card never touches us.',
  },
  '/terms': {
    title: 'Terms of Sale',
    description:
      'Every piece is the only one of its kind, and that decides most of what follows. Paying, flat $8 shipping, tracked dispatch, 14-day returns and honest condition.',
  },
  '/journal': { title: 'Journal' },
  '/curate': { title: 'Procurement Desk' },
  '/curate/review': { title: 'Review Session' },
};

/** The <title> stem for a static route — what src/main.js hands the router. */
export const pageTitle = (path) => PAGES[path]?.title || SITE.name;

/**
 * Hand-written descriptions that win over the derived ones, keyed by route.
 * Add an entry when a derived line reads badly; leave it out otherwise so a
 * copy change in the data flows through. 150–160 characters, no em dashes.
 */
export const OVERRIDES = {
  '/collections/tour-championship-2026':
    'A collection of iconic attire from the Tour Championship at East Lake, Atlanta. Drop No. 01 ran 23 August to 9 September 2026; remaining pieces stay on sale.',
};

/* ------------------------------------------------------------------ */
/* Description fitting                                                 */
/* ------------------------------------------------------------------ */

export const DESC_MIN = 150;
export const DESC_MAX = 160;

/** House lines used to pad a short description up to the window. Longest
 *  first; the fitter takes whichever fit, and the short tail lines close
 *  gaps the long ones cannot. */
export const FILLERS = [
  'Vintage golf apparel catalogued by championship.',
  'One of one, sold direct by Tour Archive.',
  'Tracked shipping, 14-day returns.',
  'Photographed in house.',
  'Sourced by tournament.',
  'Never restocked.',
  'Sold direct.',
  'One of one.',
  '1 of 1.',
];

const ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

/** Plain text from a fragment of page copy: tags out, entities decoded,
 *  em dashes turned into commas, emoji and symbols dropped, whitespace
 *  collapsed. */
export function cleanText(s = '') {
  return String(s)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] || m)
    .replace(/\s*—\s*/g, ', ')
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{1F3FB}-\u{1F3FF}]/gu, '')
    .replace(/\s+,/g, ',')
    .replace(/,\s*,/g, ',')
    .replace(/,\s*\./g, '.')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Split copy into sentences. Only a capital letter or an opening quote
 *  after the stop counts, so "No. 3" and "Est. 2026" stay whole. */
export function sentences(text) {
  return cleanText(text)
    .split(/(?<=[.!?])\s+(?=["'(A-Z])/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (/[.!?]$/.test(s) ? s : `${s}.`));
}

const join = (a, b) => (a ? `${a} ${b}` : b);
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Fit a description into [DESC_MIN, DESC_MAX] from ordered copy:
 *   1. the longest run of whole sentences that fits (a sentence already said
 *      is skipped, so listing copy that repeats the story does not);
 *   2. failing the floor, the copy cut at the last clause boundary that
 *      fits (the comma becomes a full stop) when that reads further;
 *   3. the better of those padded with house lines;
 *   4. as a last resort, a cut at a word boundary — never inside a word.
 * Returns whatever is closest when the copy is too short to fill the window;
 * the prerender reports those.
 */
export function fitDescription(parts, fillers = FILLERS) {
  const sents = [];
  for (const s of (Array.isArray(parts) ? parts : [parts]).flatMap((p) => sentences(p || ''))) {
    const n = norm(s);
    if (!n || sents.some((t) => norm(t).includes(n))) continue;
    sents.push(s);
  }
  const full = sents.join(' ');
  if (full.length >= DESC_MIN && full.length <= DESC_MAX) return full;

  // 1. whole sentences
  let text = '';
  for (const s of sents) {
    const cand = join(text, s);
    if (cand.length > DESC_MAX) break;
    text = cand;
  }
  if (text.length >= DESC_MIN) return text;

  // 2. clause cut of the full copy — only when the cut clause says something
  //    (five words or more past the last whole sentence); "…cotton. Peter
  //    Millar." is not a description.
  const clause = cutAt(full, /[,;:]\s/g, DESC_MAX);
  const fragment = clause.slice(text.length).trim().split(/\s+/).filter(Boolean).length;
  const clauseOk = clause.length > text.length && fragment >= 5;
  if (clauseOk && clause.length >= DESC_MIN) return clause;

  // 3. pad with house lines — the whole sentences, or the clause when there
  //    are no whole sentences to pad
  let padded = text || (clause.length > text.length ? clause : text);
  for (const f of fillers) {
    if (padded.length >= DESC_MIN) break;
    const cand = join(padded, f);
    // A house line whose opening is already in the copy ("one of one") is
    // skipped, so the padding never reads as an echo.
    const opening = norm(f).split(' ').slice(0, 3).join(' ');
    if (cand.length <= DESC_MAX && !norm(padded).includes(opening)) padded = cand;
  }
  if (padded.length >= DESC_MIN) return padded;
  if (clause.length >= DESC_MIN) return clause;

  // 4. word cut of the full copy
  const word = cutAt(full, /\s/g, DESC_MAX);
  if (word.length >= DESC_MIN) return word;

  return padded;
}

/** The longest prefix of `text` ending just before a boundary match, within
 *  `max` characters once the boundary punctuation is replaced with a stop. */
function cutAt(text, boundary, max) {
  let best = '';
  for (const m of text.matchAll(boundary)) {
    const head = text.slice(0, m.index).replace(/[\s,;:.-]+$/, '');
    const cand = `${head}.`;
    if (cand.length > max) break;
    best = cand;
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Per-record copy                                                     */
/* ------------------------------------------------------------------ */

const PLACEHOLDER = new Set(['see listing', 'see photos', '—', '', 'unattributed']);
const real = (v) => !PLACEHOLDER.has(String(v ?? '').trim().toLowerCase());

/** Listing lines worth a search result: prose, not measurements, labels or
 *  the checkout note. */
const usableLine = (s) =>
  typeof s === 'string' &&
  s.trim().length > 12 &&
  !/\d\s*(?:”|"|in\b|cm\b)/i.test(s) &&
  !/:\s*$/.test(s.trim()) &&
  !/\b(checkout|stripe|ebay|depop)\b/i.test(s);

/** The ordered copy an item's description is fitted from: the house story,
 *  the listing facts, then the archived listing copy and the detail lines. */
export function itemCopy(item) {
  const facts = [
    real(item.brand) ? item.brand : '',
    real(item.year) ? item.year : '',
    real(item.size) ? `size ${item.size}` : '',
    real(item.condition) ? item.condition : '',
  ].filter(Boolean);
  const price = Number.isFinite(item.price) ? `$${item.price.toLocaleString('en-US')}` : '';
  const status = item.sold
    ? 'Sold, kept as an archive record.'
    : item.upcoming
      ? `${price ? `${price}, ` : ''}reserved for the next drop.`
      : `${price ? `${price}, ` : ''}one of one.`;
  return [
    item.story || '',
    facts.length > 1 ? `${facts.join(', ').replace(/^./, (c) => c.toUpperCase())}.` : '',
    status,
    ...(Array.isArray(item.description) ? item.description : []).filter(usableLine),
    ...(Array.isArray(item.details) ? item.details : []).filter(usableLine),
  ].filter(Boolean);
}

/** The ordered copy a collection's description is fitted from. */
export function collectionCopy(c) {
  return [c.heroLine || '', c.summary || '', ...(Array.isArray(c.essay) ? c.essay : [])].filter(Boolean);
}

/** The description for a route: the override, the static page's line, or a
 *  fit of the record's copy. `record` is the item or collection. */
export function describe(route, record = null) {
  if (OVERRIDES[route]) return OVERRIDES[route];
  if (PAGES[route]?.description) return PAGES[route].description;
  if (route.startsWith('/item/') && record) return fitDescription(itemCopy(record));
  if (route.startsWith('/collections/') && record) return fitDescription(collectionCopy(record));
  return SITE.description;
}
