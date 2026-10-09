# eBay — listing the archive

## Listing by API (the normal way, from October 2026)

The same job that watches Stripe lists each live piece on eBay by itself:
title, description, photographs, specifics and terms composed from the
catalogue record, at the site price plus the eBay markup (a repository
variable, `EBAY_PRICE_MARKUP`, 0.10 = ten percent). Pieces from a drop are
held site-only for `EBAY_DROP_DELAY_DAYS` (14) after the drop opens; general
stock lists at once. At most 12 listings are created per run, so a full
catalogue takes a few runs. `EBAY_LISTING_ENABLED` must be `true` for the
job to create listings; set it to `false` to stop, and the sync still
closes out sales and prices both ways.

The first picture of every listing is a square version of the hero made
for eBay's square gallery tile (the garment's outline, the wall continued
around it, nothing cropped); the portrait photographs follow it.

A piece that eBay refuses (a missing specific such as Size, Material or
Outer Shell Material) is reported in the run summary each time and lists
itself as soon as the record has the fact. Nothing needs re-running.

`npm run ebay:sync` prints what the job would do, with every listing
verified by eBay but not created.

## Bulk upload CSV (the manual fallback)

The file `ebay-bulk-upload.csv` holds every piece that is for sale on the site
right now, one row each, in the format eBay's Seller Hub uploads. Sold and
retired pieces are left out. Photographs are included as web addresses, hero
first, so eBay fetches them itself; nothing needs attaching by hand.

## Upload it

1. Seller Hub → **Reports** → **Upload** (eBay sometimes calls this *Upload a file*
   or *File Exchange*).
2. Choose **Create listings**, pick the CSV, upload.
3. Wait for the result email or refresh the Reports page. eBay reports each row:
   **Success** means the listing is live; a row with an error says which column
   it did not like.

## Before the first upload, two things to check

- **Business policies.** A business account usually has shipping, return and
  payment policies turned on. If every row fails with a message about
  policies, open the CSV in Excel, fill the three columns
  `ShippingProfileName`, `ReturnProfileName`, `PaymentProfileName` with the
  exact names of your policies in Seller Hub, delete the columns from
  `*ShippingType` through `RefundOption`, save as CSV, upload again.
  If policies are off, leave the file as it is: it already says flat $8
  shipping (USPS Ground Advantage), 3 days handling, 14-day returns, buyer
  pays return postage.
- **Location.** `*Location` says "Virginia, United States" and `PostalCode` is
  blank. Put the postcode the parcels ship from in `PostalCode` if eBay asks.

## Rows that need a hand

- **Two memorabilia pieces** (the 2002 Tour Championship magazine, the East
  Lake bag towel) have no category in the file. eBay will reject those two
  rows; list them by hand, or put a category number in `*Category` and
  re-upload only those rows.
- **Category numbers.** The file uses eBay's men's clothing categories:
  185100 polos, 11484 sweaters and cardigans, 15691 vests, 57988 jackets and
  wind shirts, 52365 hats. If eBay rejects a row over its category, Seller
  Hub shows the right number when you start a listing in that category by
  hand; paste it in and re-upload that row.
- **Size.** Where the record had a size, it is in the title and in the Size
  specific. Where it did not, the specific is blank; eBay may ask for it.

## Rules the file already follows

- No links or mentions of the website anywhere in a listing: eBay forbids it.
- Quantity 1, Good 'Til Cancelled, fixed price at the site's price.
- Condition Pre-owned (code 3000) with the condition note from the record.
- `CustomLabel` is our catalogue number, so each eBay listing stays tied to
  its page on the site.

## Regenerate the file

From the repo: `npm run ebay:csv`. It rewrites the CSV from the current
catalogue (new pieces in, sold pieces out). The converted photographs under
`public/ebay/` must be pushed to the site before uploading, or eBay cannot
fetch them.

## What happens after the upload, by itself

Once the listings are live, the same job that watches Stripe watches eBay
(every ten minutes, and the moment anything sells on the site):

- A piece that sells on eBay is marked sold on the site within minutes and
  its site checkout closes.
- A piece that sells on the site has its eBay listing ended within seconds.
- If a price changes in Stripe, the eBay price follows.

The join is the `CustomLabel` column: it must stay the catalogue number the
file put there. A listing whose label was changed by hand is reported as
"not in the catalogue" and left alone.
