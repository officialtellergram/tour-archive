# Drop photos here

This folder is the intake for **real product photography**. A Desktop shortcut
("Tour Archive Drop Photos") points at this same folder.

How it works:

1. Drop `.jpg` / `.png` / `.webp` files in. Name them descriptively —
   `quarter-zip-navy-lambswool-L.jpg` beats `IMG_4412.jpg`, because the title,
   garment type, colourway and price are inferred from the filename.
2. Run `npm run ingest` (or just build — it runs automatically). Each new image
   gets an entry in `manifest.json` with an inferred title, price and
   description.
3. Edit `manifest.json` freely to correct anything — the ingest never
   overwrites fields you've touched, it only adds entries for new files.
4. Commit + push. The piece appears on the site as available stock.

Optional extras:
- Put a catalogue number in the filename (`TA-TC-01-…`) to bind the piece to a
  collection when it later goes to eBay.
- A file named `hero-<collection-id>.jpg` (e.g. `hero-tour-championship-2026.jpg`)
  is used as that collection's landing hero backdrop instead of stock.

## Linking a piece to its Depop or eBay listing (no API needed)

When a piece goes up on Depop or eBay, add two fields to its manifest entry:

```json
"channel": "depop",
"listingUrl": "https://www.depop.com/products/yourshop-the-listing/"
```

The site then shows the Depop badge on its card and a **Buy on Depop** button
that sends the buyer to your listing — checkout completes on the platform.
Same with `"channel": "ebay"` and an eBay item URL. Remove the fields (or the
listing) and it reverts to plain site stock.

This is the manual bridge until the official APIs are wired; those will take
over the same fields automatically.

**When a piece sells on the marketplace**, add `"sold": true` to its entry and
push — the site strikes the price and marks it "Sold — archive reference".
This is the one recurring manual duty of running without the APIs; miss it and
buyers click through to a dead listing.

## Archiving a listing's full photo set (no API needed)

One photograph sells the card; the listing carries the rest. When a piece is
live on eBay, pull its whole carousel into the repo:

1. Make sure the entry has its `"channel": "ebay"` and `listingUrl` (above).
2. Run `npm run photos`. It visits each eBay-listed entry that has no `photos`
   yet — the way a browser would — and saves every carousel frame, full size,
   to `public/stock/carousel/<slug>/`.
3. Commit + push. The product page now shows every view; the card keeps its
   hero photo.

The pull writes exactly one field, `photos` (plus a `_photosPulled` date), and
never overwrites a `photos` array you have edited — prune a duplicate frame or
reorder views right here in the manifest; the paths are relative to this
folder, forward slashes, eight frames at most. Re-pull one piece after a
relist with `npm run photos -- --refresh <id>`.

The frames are our own copies — never paste an `i.ebayimg.com` URL; eBay image
links die when a listing ends or relists, and the audit refuses them. Listing
photos die with the listing: pull before the relist, not after. Run it on its
own — the pull and the ingest both rewrite the manifest, one at a time.

Keep files under ~1.5 MB each (they ship with the site). The ingest warns on
oversized files.
