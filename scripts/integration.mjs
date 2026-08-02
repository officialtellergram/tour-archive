/**
 * Integration check — the marketplace mapping layer.
 *
 * The other three checks cover the site. This one covers the join between a
 * marketplace listing and the archive, which is where this integration can go
 * wrong quietly: a listing that silently loses its catalogue number doesn't
 * crash anything, it just drifts out of its collection and into Basic Stock.
 *
 * Runs against fixtures, so it needs no credentials and no network — which
 * means it keeps working before the eBay keys land and before Depop approves
 * the partnership.
 */

import {
  mapEbayItem,
  mapDepopProduct,
  mergeInventory,
  catalogueNumber,
  inferGarment,
  inferColourway,
  BASIC_STOCK,
} from '../server/normalize.mjs';
import { EbayApiError } from '../server/channels/ebay.mjs';
import { items as seedItems } from '../src/data/collections.js';

const failures = [];
let checks = 0;

function check(name, fn) {
  checks += 1;
  try {
    fn();
  } catch (err) {
    failures.push(`${name}: ${err.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
function equal(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

/* ------------------------------------------------------------------ */
/* Fixtures — shaped after eBay Browse item_summary responses          */
/* ------------------------------------------------------------------ */

const ebayCatalogued = {
  itemId: 'v1|1234567890|0',
  title: 'TA-DS-01 Pringle of Scotland Cable Knit Lambswool Slipover 1979 Gorse Yellow M',
  customSku: 'TA-DS-01',
  price: { value: '295.00', currency: 'USD' },
  itemWebUrl: 'https://www.ebay.com/itm/1234567890',
  image: { imageUrl: 'https://i.ebayimg.com/images/g/abc/s-l1600.jpg' },
  condition: 'Pre-owned',
  estimatedAvailabilities: [{ estimatedAvailabilityStatus: 'IN_STOCK' }],
};

const ebayUncatalogued = {
  itemId: 'v1|9876543210|0',
  title: 'Vintage 1985 Navy Lambswool Golf Cardigan Made in Scotland Large',
  price: { value: '128.50', currency: 'USD' },
  itemWebUrl: 'https://www.ebay.com/itm/9876543210',
  image: { imageUrl: 'https://i.ebayimg.com/images/g/xyz/s-l1600.jpg' },
  condition: 'Pre-owned',
  estimatedAvailabilities: [{ estimatedAvailabilityStatus: 'IN_STOCK' }],
};

const ebaySold = {
  itemId: 'v1|5555555555|0',
  title: 'TA-CB-04 Munsingwear Grand Slam Mesh Knit Sea Mist L',
  customSku: 'TA-CB-04',
  price: { value: '155.00', currency: 'USD' },
  itemWebUrl: 'https://www.ebay.com/itm/5555555555',
  condition: 'Pre-owned',
  estimatedAvailabilities: [{ estimatedAvailabilityStatus: 'OUT_OF_STOCK' }],
};

const depopProduct = {
  id: 778899,
  description: 'TA-GP-02 Izod azalea pink pique golf polo 1985 medium',
  sku: 'TA-GP-02',
  price: { amount: 145, currency: 'USD' },
  slug: 'tourarchive-izod-azalea-polo',
  pictures: [{ url: 'https://media-photos.depop.com/b1/abc.jpg' }],
  brand: { name: 'Izod' },
  status: 'onsale',
};

/* ------------------------------------------------------------------ */
/* Catalogue number parsing                                            */
/* ------------------------------------------------------------------ */

check('catalogue number parses from an eBay SKU', () => {
  equal(catalogueNumber('TA-DS-01'), 'ds-01', 'SKU form');
});
check('catalogue number tolerates human variants', () => {
  equal(catalogueNumber('ta_ds_01'), 'ds-01', 'underscored');
  equal(catalogueNumber('TA DS 01'), 'ds-01', 'spaced');
  equal(catalogueNumber('TADS01'), 'ds-01', 'unseparated');
});
check('catalogue number falls back through candidates', () => {
  equal(catalogueNumber(null, undefined, 'Lot TA-WS-06 crested'), 'ws-06', 'from title');
});
check('a listing with no catalogue number returns null', () => {
  equal(catalogueNumber('Vintage golf sweater, no code'), null, 'no match');
});

/* ------------------------------------------------------------------ */
/* Inference for unmatched stock                                       */
/* ------------------------------------------------------------------ */

check('garment type is inferred from the listing title', () => {
  equal(inferGarment('Wool Slipover Sweater Vest'), 'vest', 'slipover');
  equal(inferGarment('Shawl Collar Cardigan'), 'cardigan', 'cardigan');
  equal(inferGarment('Mesh Knit Golf Shirt'), 'polo', 'polo');
  equal(inferGarment('Packable Cagoule Rain Shell'), 'windshirt', 'windshirt');
  equal(inferGarment('Doubleknit Slacks 34x30'), 'trousers', 'trousers');
  equal(inferGarment('Wool Tweed Flat Cap'), 'cap', 'cap');
});

check('every inferred garment has a silhouette the renderer can draw', () => {
  const drawable = new Set([
    'sweater', 'cardigan', 'vest', 'polo', 'rugby', 'windshirt', 'jacket', 'trousers', 'cap',
  ]);
  const titles = [
    'Vintage golf jumper', 'Harrington jacket', 'Rugby shirt', 'Terry visor',
    'Something entirely unrecognisable',
  ];
  for (const t of titles) {
    assert(drawable.has(inferGarment(t)), `"${t}" inferred an undrawable garment`);
  }
});

check('colourway inference returns three stops the renderer can use', () => {
  const { colorway, colorName } = inferColourway('Navy lambswool crew');
  equal(colorway.length, 3, 'colourway length');
  assert(colorway.every((c) => /^#[0-9A-F]{6}$/i.test(c)), 'colourway must be hex');
  equal(colorName, 'Navy', 'colour name');
  equal(inferColourway('no colour named here').colorway.length, 3, 'fallback length');
});

/* ------------------------------------------------------------------ */
/* eBay mapping                                                        */
/* ------------------------------------------------------------------ */

check('a catalogued eBay listing joins to its archive record', () => {
  const item = mapEbayItem(ebayCatalogued);
  equal(item.catalogue, 'ds-01', 'catalogue');
  equal(item.id, 'ds-01', 'id is the catalogue number');
  equal(item.enriched, true, 'enriched');
  equal(item.collection, 'duel-in-the-sun', 'collection comes from the archive');
  equal(item.garment, 'vest', 'garment comes from the archive, not inference');
  equal(item.size, 'M', 'size comes from the archive');
  equal(item.price, 295, 'price comes from the live listing, not the archive');
  equal(item.market.url, ebayCatalogued.itemWebUrl, 'links out to eBay');
  assert(Object.keys(item.measurements).length > 0, 'measurements carried over');
});

check('an uncatalogued eBay listing lands in Basic Stock, not dropped', () => {
  const item = mapEbayItem(ebayUncatalogued);
  equal(item.catalogue, null, 'no catalogue');
  equal(item.collection, BASIC_STOCK, 'basic stock');
  equal(item.enriched, false, 'not enriched');
  equal(item.garment, 'cardigan', 'garment inferred from title');
  equal(item.colorName, 'Navy', 'colour inferred from title');
  equal(item.year, '1985', 'year inferred from title');
  equal(item.price, 129, 'price rounded from listing');
  assert(item.id.startsWith('ebay-'), `id should be channel-scoped, got ${item.id}`);
  assert(/^[a-z0-9-]+$/.test(item.id), `id must be URL-safe, got ${item.id}`);
});

check('out-of-stock eBay listings map to sold', () => {
  const item = mapEbayItem(ebaySold);
  equal(item.sold, true, 'sold');
  equal(item.catalogue, 'cb-04', 'still catalogued');
});

check('the catalogue code is stripped from the display name', () => {
  const item = mapEbayItem(ebayCatalogued);
  assert(!/TA-DS-01/i.test(item.name), `catalogue code leaked into name: "${item.name}"`);
});

/* ------------------------------------------------------------------ */
/* Depop mapping                                                       */
/* ------------------------------------------------------------------ */

check('a Depop product maps and joins the same way', () => {
  const item = mapDepopProduct(depopProduct);
  equal(item.channel, 'depop', 'channel');
  equal(item.catalogue, 'gp-02', 'catalogue');
  equal(item.collection, 'georgia-pines', 'collection from archive');
  equal(item.sold, false, 'onsale');
  equal(item.market.label, 'View on Depop', 'links out to Depop');
  assert(item.market.url.includes('depop.com'), 'Depop URL');
});

/* ------------------------------------------------------------------ */
/* Merge / lifecycle                                                   */
/* ------------------------------------------------------------------ */

check('a syndicated listing supersedes its seed record rather than duplicating', () => {
  const channels = [mapEbayItem(ebayCatalogued)];
  const merged = mergeInventory({ seed: seedItems, channels });
  equal(merged.length, seedItems.length, 'no duplicate row');
  const ds01 = merged.filter((i) => i.id === 'ds-01');
  equal(ds01.length, 1, 'exactly one ds-01');
  equal(ds01[0].channel, 'ebay', 'now sourced from eBay');
  equal(ds01[0].syndicated, true, 'flagged syndicated');
  equal(ds01[0].price, 295, 'live price wins');
  equal(ds01[0].story, seedItems.find((i) => i.id === 'ds-01').story, 'archive story preserved');
});

check('the catalogue number survives the merge, so sync counts stay honest', () => {
  const merged = mergeInventory({
    seed: seedItems,
    channels: [mapEbayItem(ebayCatalogued), mapEbayItem(ebayUncatalogued), mapDepopProduct(depopProduct)],
  });
  const syndicated = merged.filter((i) => i.syndicated);
  equal(syndicated.length, 3, 'three syndicated');
  equal(syndicated.filter((i) => i.catalogue).length, 2, 'two carry a catalogue number');
  equal(syndicated.filter((i) => !i.catalogue).length, 1, 'one is genuinely unmatched');
  equal(merged.find((i) => i.id === 'ds-01').catalogue, 'ds-01', 'matched piece keeps its catalogue');
});

check('uncatalogued marketplace stock is added alongside the archive', () => {
  const channels = [mapEbayItem(ebayUncatalogued)];
  const merged = mergeInventory({ seed: seedItems, channels });
  equal(merged.length, seedItems.length + 1, 'one extra row');
  assert(merged.some((i) => i.collection === BASIC_STOCK), 'basic stock present');
});

check('site-only drops survive a sync with no marketplace stock', () => {
  const merged = mergeInventory({ seed: seedItems, channels: [] });
  equal(merged.length, seedItems.length, 'all seed rows kept');
  assert(merged.every((i) => i.channel === 'archive'), 'all marked archive');
  assert(merged.every((i) => i.syndicated === false), 'none syndicated');
});

check('merged items keep every field the product page renders', () => {
  const merged = mergeInventory({ seed: seedItems, channels: [mapEbayItem(ebayCatalogued)] });
  const required = ['id', 'name', 'brand', 'year', 'garment', 'colorway', 'colorName',
                    'price', 'size', 'condition', 'category', 'collection', 'market'];
  for (const item of merged) {
    for (const field of required) {
      assert(item[field] !== undefined, `item ${item.id} is missing "${field}"`);
    }
    assert(Array.isArray(item.colorway) && item.colorway.length === 3,
      `item ${item.id} has a malformed colourway`);
  }
});

check('every merged id is unique and URL-safe', () => {
  const merged = mergeInventory({
    seed: seedItems,
    channels: [mapEbayItem(ebayCatalogued), mapEbayItem(ebayUncatalogued), mapDepopProduct(depopProduct)],
  });
  const ids = merged.map((i) => i.id);
  equal(new Set(ids).size, ids.length, 'ids must be unique');
  for (const id of ids) {
    assert(/^[a-z0-9-]+$/i.test(id), `id "${id}" is not URL-safe`);
  }
});

/* ------------------------------------------------------------------ */
/* Checkout redirect contract                                          */
/* ------------------------------------------------------------------ */

/*
 * We run no checkout of our own for marketplace stock — the buyer is sent to
 * the listing to complete the purchase. So every syndicated, buyable piece MUST
 * carry a working outbound URL to the right platform. A missing or wrong URL
 * here is a dead "Buy on eBay" button, which is the worst failure this site can
 * have, and it would render perfectly.
 */

check('every syndicated available piece has a usable outbound checkout link', () => {
  const channels = [
    mapEbayItem(ebayCatalogued),
    mapEbayItem(ebayUncatalogued),
    mapDepopProduct(depopProduct),
  ];
  const merged = mergeInventory({ seed: seedItems, channels });
  const buyable = merged.filter((i) => i.syndicated && !i.sold && !i.upcoming);

  assert(buyable.length > 0, 'fixture should produce buyable syndicated stock');
  for (const item of buyable) {
    assert(item.market?.url, `${item.id} has no checkout URL`);
    assert(/^https:\/\//.test(item.market.url), `${item.id} checkout URL is not https`);
    assert(item.market.url !== '#', `${item.id} has a placeholder checkout URL`);
  }
});

check('checkout links point at the platform the piece actually lives on', () => {
  const host = (u) => new URL(u).hostname.replace(/^www\./, '');
  const ebayItem = mapEbayItem(ebayCatalogued);
  const depopItem = mapDepopProduct(depopProduct);

  assert(host(ebayItem.market.url).endsWith('ebay.com'), 'eBay piece must link to eBay');
  assert(host(depopItem.market.url).endsWith('depop.com'), 'Depop piece must link to Depop');
  equal(ebayItem.market.label, 'View on eBay', 'eBay label');
  equal(depopItem.market.label, 'View on Depop', 'Depop label');
});

check('site-only drops keep a comparables link, not a checkout link', () => {
  const merged = mergeInventory({ seed: seedItems, channels: [] });
  for (const item of merged) {
    equal(item.syndicated, false, `${item.id} should not be syndicated`);
    assert(item.market?.url, `${item.id} lost its comparables link`);
  }
});

/* ------------------------------------------------------------------ */
/* eBay error handling                                                 */
/* ------------------------------------------------------------------ */

check('eBay structured errors summarise usefully', () => {
  // Shape per developer.ebay.com/develop/guides-v2/using-ebay-restful-apis#handling-errors
  const err = new EbayApiError('eBay Browse request failed (403)', {
    status: 403,
    errors: [
      {
        errorId: 1100,
        domain: 'ACCESS',
        category: 'REQUEST',
        message: 'Access denied',
        longMessage: 'Insufficient permissions to fulfill the request.',
      },
    ],
  });
  assert(err.detail.includes('1100'), 'errorId surfaced');
  assert(err.detail.includes('ACCESS/REQUEST'), 'domain/category surfaced');
  assert(err.detail.includes('Insufficient permissions'), 'longMessage preferred');
  equal(err.retryable, false, '403 is not retryable');
});

check('rate limits and server errors are marked retryable', () => {
  equal(new EbayApiError('x', { status: 429, retryable: true }).retryable, true, '429');
  equal(new EbayApiError('x', { status: 503, retryable: true }).retryable, true, '503');
});

/* ------------------------------------------------------------------ */

const C = { red: '\x1b[31m', green: '\x1b[32m', dim: '\x1b[2m', off: '\x1b[0m' };
console.log(`\n${C.dim}── Tour Archive · marketplace integration ──${C.off}`);
console.log(`${C.dim}   ${checks} checks over eBay + Depop mapping, enrichment and merge${C.off}`);

if (failures.length) {
  console.log(`\n${C.red}✖ ${failures.length} failure(s)${C.off}`);
  failures.forEach((f) => console.log(`   ${f}`));
  console.log('');
  process.exit(1);
}
console.log(`\n${C.green}✔ marketplace listings map into the archive correctly${C.off}\n`);
