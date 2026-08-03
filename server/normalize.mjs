/**
 * Marketplace listing → archive item.
 *
 * The central problem of this integration: an eBay or Depop listing carries a
 * title, a price and some photographs. It does not carry our taxonomy — which
 * championship collection a piece belongs to, its colourway, its flat
 * measurements, which silhouette to draw. Nothing in either API can tell us
 * that, because it is our editorial judgement, not marketplace data.
 *
 * So we bridge it with a catalogue number. Every piece gets one (TA-DS-01), and
 * it goes into the eBay custom SKU and the Depop listing. On sync we parse it
 * back out and join to `enrichment.json`, which holds the archive metadata.
 *
 * Listings we can't match still appear — as ungrouped "Basic Stock" — with the
 * garment type and colourway inferred from the title. That is the difference
 * between a sync that silently drops half the shop and one that degrades
 * honestly.
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { items as seedItems } from '../src/data/collections.js';

const ENRICHMENT_PATH = fileURLToPath(new URL('./enrichment.json', import.meta.url));

/** Editorial fields the marketplace can never supply. */
const ARCHIVE_FIELDS = [
  'collection', 'name', 'brand', 'year', 'category', 'garment', 'size',
  'condition', 'colorway', 'colorName', 'story', 'details', 'measurements',
];

function pickArchiveFields(source) {
  const out = {};
  for (const key of ARCHIVE_FIELDS) if (source[key] !== undefined) out[key] = source[key];
  return out;
}

/** TA-DS-01 / ta_ds_01 / TADS01 — tolerant, because humans type these. */
const CATALOGUE_RX = /\bTA[\s._-]?([A-Z]{2})[\s._-]?(\d{2})\b/i;

export const BASIC_STOCK = 'basic-stock';

let enrichmentCache = null;
let enrichmentMtime = 0;

/**
 * The catalogue-number → archive-metadata map.
 *
 * Built from the curated collections file (so there is exactly one source of
 * truth for pieces we have already written up), then overlaid with an optional
 * `server/enrichment.json` for stock that exists on a marketplace but not yet
 * in the editorial catalogue. The overlay hot-reloads, so curating a newly
 * listed piece does not need a restart.
 */
export function loadEnrichment() {
  const base = {};
  for (const item of seedItems) base[item.id] = pickArchiveFields(item);

  if (!existsSync(ENRICHMENT_PATH)) return base;

  try {
    const { mtimeMs } = statSync(ENRICHMENT_PATH);
    if (!enrichmentCache || mtimeMs !== enrichmentMtime) {
      enrichmentCache = JSON.parse(readFileSync(ENRICHMENT_PATH, 'utf8'));
      enrichmentMtime = mtimeMs;
    }
  } catch (err) {
    console.warn(`[normalize] enrichment.json unreadable, using catalogue only: ${err.message}`);
    return base;
  }

  for (const [key, record] of Object.entries(enrichmentCache)) {
    if (key.startsWith('_')) continue; // allow "_comment" keys in the file
    base[key] = { ...(base[key] || {}), ...record };
  }
  return base;
}

export function catalogueNumber(...candidates) {
  for (const text of candidates) {
    if (!text) continue;
    const m = String(text).match(CATALOGUE_RX);
    if (m) return `${m[1]}-${m[2]}`.toLowerCase();
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Inference for unmatched listings                                    */
/* ------------------------------------------------------------------ */

/**
 * Order matters — the first match wins, so the specific silhouettes come before
 * the generic ones ("sweater vest" must beat "sweater"). Every alternative ends
 * in `s?` because listing titles are written by humans and are usually plural:
 * `\bslack\b` does not match "Slacks", which is exactly the sort of near-miss
 * that quietly dumps stock into the wrong silhouette.
 */
const GARMENT_RULES = [
  [/\b(slipovers?|sweater vests?|vests?|sleeveless|tanks?)\b/i, 'vest'],
  [/\b(cardigans?|shawl)\b/i, 'cardigan'],
  [/\b(rugbys?|rugbies)\b/i, 'rugby'],
  [/\b(polos?|piqu[eé]|mesh knits?|golf shirts?)\b/i, 'polo'],
  [/\b(windshirts?|wind shirts?|windbreakers?|windcheaters?|cagoules?|shells?|anoraks?)\b/i, 'windshirt'],
  [/\b(jackets?|blousons?|harringtons?|coats?|bombers?)\b/i, 'jacket'],
  [/\b(trousers?|slacks?|pants?|chinos?|flannels?|jeans?)\b/i, 'trousers'],
  [/\b(caps?|visors?|hats?|buckets?)\b/i, 'cap'],
  [/\b(sweaters?|jumpers?|knits?|pullovers?|crews?|v-?necks?)\b/i, 'sweater'],
];

export function inferGarment(title = '') {
  for (const [rx, type] of GARMENT_RULES) if (rx.test(title)) return type;
  return 'sweater';
}

/** Colour words → a three-stop way the SVG renderer can use. */
const COLOUR_RULES = [
  [/\b(navy|midnight)\b/i, ['#25324F', '#1A2338', '#0E1524'], 'Navy'],
  [/\b(forest|hunter|racing green|pine)\b/i, ['#2F4A34', '#1F3324', '#132015'], 'Pine Green'],
  [/\b(green|olive|sage)\b/i, ['#6F7F4E', '#55633B', '#333D22'], 'Olive'],
  [/\b(burgundy|maroon|claret|wine|oxblood)\b/i, ['#7A2B38', '#5C1F29', '#3A131A'], 'Claret'],
  [/\b(red|cardinal|crimson)\b/i, ['#8E2436', '#6A1A28', '#42101A'], 'Cardinal'],
  [/\b(pink|rose|azalea)\b/i, ['#D98E9B', '#B96D7C', '#7C4451'], 'Azalea'],
  [/\b(yellow|gold|mustard|gorse)\b/i, ['#E4CF8E', '#C9B172', '#7C6B3E'], 'Gorse Yellow'],
  [/\b(orange|coral|rust|terracotta)\b/i, ['#D9743F', '#B85C2E', '#78391A'], 'Coral'],
  [/\b(blue|sky|powder)\b/i, ['#A8C0D6', '#7A9BB8', '#3D5A72'], 'Powder Blue'],
  [/\b(grey|gray|charcoal|slate|fog)\b/i, ['#9AA3A0', '#767E77', '#3F4643'], 'Fog Grey'],
  [/\b(cream|ivory|ecru|oatmeal|bone|white)\b/i, ['#EFE7D6', '#CFC3A8', '#7C7259'], 'Cream'],
  [/\b(tan|camel|sand|khaki|beige|fawn)\b/i, ['#C8B489', '#A8946B', '#6A5C3E'], 'Sand'],
  [/\b(brown|chocolate|tobacco)\b/i, ['#8A6A4A', '#6A5038', '#3F2F20'], 'Tobacco'],
  [/\b(black|jet)\b/i, ['#3A3A36', '#262623', '#141412'], 'Black'],
];

export function inferColourway(title = '') {
  for (const [rx, colorway, colorName] of COLOUR_RULES) {
    if (rx.test(title)) return { colorway, colorName };
  }
  return { colorway: ['#C4BCA6', '#A39A82', '#5E594A'], colorName: 'Undyed' };
}

/** A four-digit year in the title, if it's plausibly a garment date. */
export function inferYear(title = '') {
  const m = String(title).match(/\b(19[3-9]\d)\b/);
  return m ? m[1] : '';
}

const CATEGORY_BY_GARMENT = {
  vest: 'Knitwear',
  cardigan: 'Knitwear',
  sweater: 'Knitwear',
  polo: 'Shirting',
  rugby: 'Shirting',
  windshirt: 'Outerwear',
  jacket: 'Outerwear',
  trousers: 'Trousers',
  cap: 'Headwear',
};

/* ------------------------------------------------------------------ */
/* Channel mappers                                                     */
/* ------------------------------------------------------------------ */

/**
 * eBay Browse `itemSummary` → archive item.
 * @see https://developer.ebay.com/api-docs/buy/browse/resources/item_summary/methods/search
 */
export function mapEbayItem(summary) {
  const title = summary.title || 'Untitled listing';
  const price = Number(summary.price?.value ?? 0);

  return baseItem({
    channel: 'ebay',
    channelId: summary.itemId,
    catalogue: catalogueNumber(summary.customSku, summary.sku, title),
    title,
    price,
    currency: summary.price?.currency || 'USD',
    url: summary.itemWebUrl,
    image: summary.image?.imageUrl || summary.thumbnailImages?.[0]?.imageUrl || '',
    condition: summary.condition || '',
    brand: extractBrand(summary),
    available: (summary.estimatedAvailabilities?.[0]?.estimatedAvailabilityStatus ??
      'IN_STOCK') !== 'OUT_OF_STOCK',
  });
}

/**
 * Depop product → archive item.
 * ⚠ Field names are provisional until the OpenAPI spec is wired in — this is
 * the one function that should need correcting when it arrives.
 */
export function mapDepopProduct(product) {
  const title = product.description || product.title || product.name || 'Untitled listing';
  const price = Number(product.price?.amount ?? product.price ?? 0);

  return baseItem({
    channel: 'depop',
    channelId: String(product.id ?? product.product_id ?? ''),
    catalogue: catalogueNumber(product.sku, product.external_id, title),
    title,
    price,
    currency: product.price?.currency ?? product.currency ?? 'USD',
    url:
      product.url ||
      (product.slug ? `https://www.depop.com/products/${product.slug}/` : 'https://www.depop.com/'),
    image: product.pictures?.[0]?.url || product.images?.[0]?.url || '',
    condition: product.condition || '',
    brand: product.brand?.name || product.brand || '',
    available: (product.status ?? 'onsale') === 'onsale',
  });
}

/* ------------------------------------------------------------------ */
/* Shared shaping + enrichment                                         */
/* ------------------------------------------------------------------ */

function extractBrand(summary) {
  const aspect = summary.additionalProductIdentities?.[0]?.productIdentity?.find?.(
    (p) => p.identifierType === 'BRAND'
  );
  return summary.brand || aspect?.identifierValue || '';
}

function baseItem({
  channel,
  channelId,
  catalogue,
  title,
  price,
  currency,
  url,
  image,
  condition,
  brand,
  available,
}) {
  const garment = inferGarment(title);
  const { colorway, colorName } = inferColourway(title);

  const item = {
    // `id` must be stable and URL-safe — it is the /item/:id route key.
    id: catalogue ? catalogue : `${channel}-${slug(channelId)}`,
    channel,
    channelId,
    catalogue,
    collection: BASIC_STOCK,
    name: cleanTitle(title),
    brand: brand || 'Unattributed',
    year: inferYear(title) || '—',
    category: CATEGORY_BY_GARMENT[garment] || 'Knitwear',
    garment,
    size: 'See listing',
    condition: normaliseCondition(condition),
    price: Math.round(price) || 0,
    currency,
    colorway,
    colorName,
    story: '',
    details: [],
    measurements: {},
    photo: image || '',
    sold: !available,
    upcoming: false,
    market: {
      label: channel === 'ebay' ? 'View on eBay' : 'View on Depop',
      url: url || '#',
    },
    // One entry today; when a piece is listed on both marketplaces the PDP
    // renders a checkout choice from this array.
    listings: [
      { channel, url: url || '#', label: channel === 'ebay' ? 'View on eBay' : 'View on Depop' },
    ],
    enriched: false,
  };

  return applyEnrichment(item);
}

/** Join the marketplace listing to our editorial record, if we have one. */
export function applyEnrichment(item) {
  if (!item.catalogue) return item;
  const record = loadEnrichment()[item.catalogue];
  if (!record) return item;

  return {
    ...item,
    ...record,
    // Live commerce facts always win over the curated file.
    id: item.catalogue,
    channel: item.channel,
    channelId: item.channelId,
    catalogue: item.catalogue,
    price: item.price || record.price || 0,
    sold: item.sold,
    photo: item.photo || record.photo || '',
    market: item.market,
    enriched: true,
  };
}

function cleanTitle(title) {
  return String(title)
    .replace(CATALOGUE_RX, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s|,–—-]+|[\s|,–—-]+$/g, '')
    .slice(0, 90);
}

const CONDITION_MAP = [
  [/\bnew\b|\bnwt\b|deadstock|\bnos\b/i, 'Excellent'],
  [/excellent|mint/i, 'Excellent'],
  [/very good|\bvg\b/i, 'Very Good'],
  [/\bgood\b|used/i, 'Good'],
  [/\bfair\b|\bas-?is\b|flaw/i, 'As-Is'],
];

function normaliseCondition(raw) {
  for (const [rx, grade] of CONDITION_MAP) if (rx.test(raw || '')) return grade;
  return 'Very Good';
}

function slug(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

/**
 * Merge channel results with the locally curated drops.
 *
 * Lifecycle the shop actually runs on:
 *   1. A drop is listed on the site only, ahead of / during the event.
 *   2. After the event it goes up on eBay and Depop.
 *   3. From then on the marketplace is the source of truth for price and
 *      availability, while the site keeps the history and the photography.
 *
 * So a marketplace listing supersedes the seed record it shares a catalogue
 * number with, rather than appearing twice.
 */
export function mergeInventory({ seed = [], channels = [] }) {
  const bySeedId = new Map(seed.map((i) => [i.id, i]));
  const out = [];
  const claimed = new Set();

  for (const listing of channels) {
    const seedMatch = listing.catalogue ? bySeedId.get(listing.catalogue) : null;
    if (seedMatch) {
      claimed.add(seedMatch.id);
      out.push({
        ...seedMatch,
        ...pickLive(listing),
        syndicated: true,
      });
    } else {
      out.push({ ...listing, syndicated: true });
    }
  }

  for (const item of seed) {
    // Manifest entries with a pasted listingUrl arrive already syndicated —
    // keep that, don't flatten it back to a site-only listing.
    if (!claimed.has(item.id))
      out.push({ ...item, channel: item.channel || 'archive', syndicated: item.syndicated ?? false });
  }

  return out;
}

/**
 * The fields a live marketplace is authoritative for.
 *
 * `catalogue` has to travel with them: the seed record is keyed by `id` and has
 * no catalogue field of its own, so omitting it here left every matched piece
 * looking un-catalogued after the merge — which reported correctly-matched
 * stock as unmatched and would mislead anyone auditing a sync.
 */
function pickLive(listing) {
  return {
    channel: listing.channel,
    channelId: listing.channelId,
    catalogue: listing.catalogue,
    price: listing.price || 0,
    currency: listing.currency,
    sold: listing.sold,
    market: listing.market,
    listings: listing.listings,
    photo: listing.photo || '',
  };
}
