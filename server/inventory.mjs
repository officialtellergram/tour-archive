/**
 * Inventory assembly — shared by the standalone server and the Netlify Function.
 *
 * Kept separate from any HTTP plumbing so both runtimes build stock the same
 * way. If these ever diverge, the preview deploy stops being evidence about
 * production, which defeats the point of having one.
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.mjs';
import { fetchEbayListings, EbayApiError } from './channels/ebay.mjs';
import { fetchDepopListings } from './channels/depop.mjs';
import { mapEbayItem, mapDepopProduct, mergeInventory, applyEnrichment } from './normalize.mjs';
import { collections as seedCollections } from '../src/data/collections.js';

export const CACHE_KEY = 'inventory';

const MANIFEST_PATH = fileURLToPath(new URL('../public/stock/manifest.json', import.meta.url));

/**
 * Photographed stock — the site's own listings, from the drop-folder manifest.
 *
 * This replaced the curated SVG mock inventory: since real photography exists,
 * nothing without a photograph is displayed for sale. The curated records in
 * collections.js persist as *enrichment* (they surface when a real listing
 * carries their catalogue number) but are no longer stock themselves.
 */
const CHANNEL_LABELS = { depop: 'View on Depop', ebay: 'View on eBay' };

/**
 * One manifest entry → one archive item. Exported pure so the integration
 * check can hold it to the same standard as the API mappers.
 *
 * Manual syndication: give an entry `listingUrl` (and `channel`: depop|ebay)
 * and it becomes a syndicated listing — marketplace badge, "Buy on Depop"
 * redirect, checkout on the platform. This is the no-scraping answer to
 * mirroring our own Depop shop: we know our own listings, so we paste the URL
 * rather than harvest it. The official APIs replace the paste when they land,
 * through the exact same fields.
 */
export function mapManifestItem(entry) {
  const { _ingested, _source, _missing, file, listingUrl, listings: rawListings, ...item } = entry;

  /*
   * Every listed piece will eventually live on BOTH marketplaces, and the item
   * page then offers a simple checkout choice. `listings` is that future shape,
   * supported today: either paste the array form —
   *   "listings": [{ "channel": "ebay", "url": "…" }, { "channel": "depop", "url": "…" }]
   * — or the single-channel shorthand (`channel` + `listingUrl`). Both normalise
   * to the same array; the PDP renders one Buy button per entry.
   */
  const listings = (
    Array.isArray(rawListings)
      ? rawListings
      : listingUrl
      ? [{ channel: item.channel, url: listingUrl }]
      : []
  )
    .filter((l) => l && CHANNEL_LABELS[l.channel] && /^https:\/\//.test(l.url || ''))
    .map((l) => ({ channel: l.channel, url: l.url, label: CHANNEL_LABELS[l.channel] }));

  const syndicated = listings.length > 0;
  const channel = syndicated ? listings[0].channel : 'site';

  return applyEnrichment({
    collection: 'basic-stock',
    sold: false,
    upcoming: false,
    story: '',
    details: [],
    measurements: {},
    ...item,
    market: syndicated
      ? { label: listings[0].label, url: listings[0].url }
      : {
          label: 'Comparable listings',
          url: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(
            `${item.brand || ''} ${item.name || ''}`.trim()
          )}`,
        },
    listings,
    // Relative to the deploy base; the frontend prefixes BASE_URL. Entries
    // without a photo yet (listing-only stock) render the drawn plate instead.
    photo: file ? `stock/${file}` : '',
    channel,
    syndicated,
  });
}

export function manifestStock() {
  if (!existsSync(MANIFEST_PATH)) return [];
  try {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
    return (manifest.items || []).filter((i) => !i._missing).map(mapManifestItem);
  } catch (err) {
    console.warn(`[inventory] stock manifest unreadable: ${err.message}`);
    return [];
  }
}

async function fetchChannels() {
  const listings = [];
  const sources = [];

  if (config.mockChannels) {
    const { EBAY_FIXTURES, DEPOP_FIXTURES } = await import('./channels/fixtures.mjs');
    const ebay = EBAY_FIXTURES.map(mapEbayItem);
    const depop = DEPOP_FIXTURES.map(mapDepopProduct);
    listings.push(...ebay, ...depop);
    sources.push(
      { channel: 'ebay', ok: true, count: ebay.length, mock: true },
      { channel: 'depop', ok: true, count: depop.length, mock: true }
    );
    console.warn('[inventory] MOCK_CHANNELS is on — fixture listings, not live stock');
    return { listings, sources };
  }

  if (config.ebay.enabled) {
    try {
      const mapped = (await fetchEbayListings()).map(mapEbayItem);
      listings.push(...mapped);
      sources.push({ channel: 'ebay', ok: true, count: mapped.length });
    } catch (err) {
      const detail = err instanceof EbayApiError && err.detail ? ` ${err.detail}` : '';
      console.error(`[ebay] ${err.message}${detail}`);
      sources.push({ channel: 'ebay', ok: false, error: `${err.message}${detail}` });
    }
  } else {
    sources.push({ channel: 'ebay', ok: false, error: 'disabled' });
  }

  if (config.depop.enabled) {
    try {
      const mapped = (await fetchDepopListings()).map(mapDepopProduct);
      listings.push(...mapped);
      sources.push({ channel: 'depop', ok: true, count: mapped.length });
    } catch (err) {
      console.error(`[depop] ${err.message}`);
      sources.push({ channel: 'depop', ok: false, error: err.message });
    }
  } else {
    sources.push({ channel: 'depop', ok: false, error: 'disabled' });
  }

  return { listings, sources };
}

export async function buildInventory() {
  const { listings, sources } = await fetchChannels();
  const stock = manifestStock();
  sources.push({ channel: 'site', ok: true, count: stock.length });
  const merged = mergeInventory({ seed: stock, channels: listings });

  return {
    generatedAt: new Date().toISOString(),
    sources,
    collections: seedCollections,
    items: merged,
    counts: {
      total: merged.length,
      syndicated: merged.filter((i) => i.syndicated).length,
      siteOnly: merged.filter((i) => !i.syndicated).length,
      unmatched: merged.filter((i) => i.syndicated && !i.catalogue).length,
    },
  };
}
