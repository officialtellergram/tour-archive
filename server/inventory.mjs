/**
 * Inventory assembly — shared by the standalone server and the Netlify Function.
 *
 * Kept separate from any HTTP plumbing so both runtimes build stock the same
 * way. If these ever diverge, the preview deploy stops being evidence about
 * production, which defeats the point of having one.
 */

import { config } from './config.mjs';
import { fetchEbayListings, EbayApiError } from './channels/ebay.mjs';
import { fetchDepopListings } from './channels/depop.mjs';
import { mapEbayItem, mapDepopProduct, mergeInventory } from './normalize.mjs';
import { items as seedItems, collections as seedCollections } from '../src/data/collections.js';

export const CACHE_KEY = 'inventory';

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
  const merged = mergeInventory({ seed: seedItems, channels: listings });

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
