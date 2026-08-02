/**
 * Demo fixtures — MOCK_CHANNELS=1.
 *
 * Raw payloads in the shape each marketplace returns, so they run through the
 * real `mapEbayItem` / `mapDepopProduct` and merge path. Nothing here bypasses
 * the pipeline; it only stands in for the network call, which is what makes it
 * a fair preview of the live behaviour rather than a mock-up of it.
 *
 * Catalogue numbers deliberately span all three cases:
 *   • matched + available  → shows "Buy on eBay/Depop" with the archive story
 *   • matched + sold       → shows how a marketplace sale propagates back
 *   • unmatched            → lands in Basic Stock with inferred garment/colour
 */

export const EBAY_FIXTURES = [
  {
    itemId: 'v1|2001|0',
    title: 'TA-DS-02 Slazenger Ailsa Links Wind Shirt 1981 Sea Grey L',
    customSku: 'TA-DS-02',
    price: { value: '240.00', currency: 'USD' },
    itemWebUrl: 'https://www.ebay.com/itm/2001',
    condition: 'Pre-owned',
    estimatedAvailabilities: [{ estimatedAvailabilityStatus: 'IN_STOCK' }],
  },
  {
    itemId: 'v1|2002|0',
    title: 'TA-CB-01 Munsingwear Monterey Shawl Cardigan 1968 Fog Grey L',
    customSku: 'TA-CB-01',
    price: { value: '355.00', currency: 'USD' },
    itemWebUrl: 'https://www.ebay.com/itm/2002',
    condition: 'Pre-owned',
    estimatedAvailabilities: [{ estimatedAvailabilityStatus: 'IN_STOCK' }],
  },
  {
    itemId: 'v1|2003|0',
    title: 'TA-GP-04 London Fog Poplin Clubhouse Jacket 1972 Sand',
    customSku: 'TA-GP-04',
    price: { value: '230.00', currency: 'USD' },
    itemWebUrl: 'https://www.ebay.com/itm/2003',
    condition: 'Pre-owned',
    estimatedAvailabilities: [{ estimatedAvailabilityStatus: 'OUT_OF_STOCK' }],
  },
  {
    itemId: 'v1|2004|0',
    title: 'Vintage 1988 Cream Lambswool Golf Sweater Vest Made in Scotland Medium',
    price: { value: '96.00', currency: 'USD' },
    itemWebUrl: 'https://www.ebay.com/itm/2004',
    condition: 'Pre-owned',
    estimatedAvailabilities: [{ estimatedAvailabilityStatus: 'IN_STOCK' }],
  },
  {
    itemId: 'v1|2005|0',
    title: 'Vintage 1979 Navy Wool Tweed Flat Cap Golf Made in England',
    price: { value: '72.00', currency: 'USD' },
    itemWebUrl: 'https://www.ebay.com/itm/2005',
    condition: 'Pre-owned',
    estimatedAvailabilities: [{ estimatedAvailabilityStatus: 'IN_STOCK' }],
  },
];

export const DEPOP_FIXTURES = [
  {
    id: 3001,
    description: 'TA-GP-02 Izod azalea pink pique golf polo 1985 medium',
    sku: 'TA-GP-02',
    price: { amount: 145, currency: 'USD' },
    slug: 'tourarchive-izod-azalea-polo',
    brand: { name: 'Izod' },
    status: 'onsale',
  },
  {
    id: 3002,
    description: 'TA-CB-06 Hanna Hats Irish wool houndstooth golf cap 1977',
    sku: 'TA-CB-06',
    price: { amount: 110, currency: 'USD' },
    slug: 'tourarchive-houndstooth-cap',
    brand: { name: 'Hanna Hats' },
    status: 'onsale',
  },
  {
    id: 3003,
    description: 'Vintage 1990 burgundy rugby shirt heavyweight cotton large',
    price: { amount: 88, currency: 'USD' },
    slug: 'tourarchive-burgundy-rugby',
    brand: { name: 'Barbarian' },
    status: 'onsale',
  },
];
