# The sale, and the cart

Black Friday 2026 is the first site sale. It needed a cart, because every
piece sold through its own Payment Link and a Payment Link cannot know what
else a buyer is holding. The cart stays after the sale: several pieces in
one order, one $8 shipping charge.

Everything about the sale lives in **`src/data/sale.js`** — the window, the
piece rule, the tiers, the coupon ids. The site, the build, the Worker and
the sold sweep all import that one file, so a price is worked out the same
way everywhere.

## What the sale does

- **25% off every piece priced under $60.** These are the "select pieces".
  They wear a claret **Sale** tag (where New has its star) and show the old
  price struck through with the new one beside it, on cards and on the piece
  page. `/archive?filter=sale` lists them. A manifest entry can opt in or out
  by hand: `"sale": true` / `"sale": false` on the entry overrides the price
  rule.
- **Cart tiers.** On the order's merchandise value *after* the piece discounts
  and *before* shipping: $100+ takes $15 off, $150+ $25, $200+ $40, $300+ $50.
  The highest tier reached applies once per order, as a Stripe coupon on the
  Checkout Session. The cart page shows the tier and how far the next one is.
- **Window:** Friday 27 Nov 00:00 to Monday 30 Nov 23:59:59, Eastern. Outside
  it every fragment renders as if the sale never existed; nothing is switched
  by hand.
- **Site only.** eBay listings and prices are not touched.

## How it is wired

| Piece | Where |
|---|---|
| Window, rule, tiers, maths | `src/data/sale.js` (`saleOn`, `isSelect`, `unitCents`, `orderMath`) |
| Tag, struck price, home banner, ticker | `src/components/sale.js`, `src/styles/sale.css` |
| Cart (localStorage) and the checkout call | `src/lib/cart.js`, page `src/pages/cart.js` (`/cart`, `/thanks`) |
| Buy now / Add to cart on the piece page | `src/pages/product.js` (`primaryAction`, `secondaryAction`) |
| Checkout map the Worker reads | `dist/api/checkout-map.json`, written by `scripts/snapshot.mjs` |
| The Checkout Session | Worker `POST /checkout`, `worker/stripe-hook/src/index.js` |
| Tier coupons | `scripts/sale-coupons.mjs` (the Worker also makes a missing one itself) |
| Sold sweep for cart orders | `scripts/stripe-sold.mjs` (sessions with `metadata.ta_ids`) |
| Report rows for cart orders | `scripts/sales-report.mjs` (one row per piece, shares by line total) |
| Rebuilds at the window's edges | Worker crons `5 5 27 11 *` and `5 5 1 12 *` → `deploy.yml`; the same two in `deploy.yml`'s schedule as the backstop |

**During the sale, Buy now on a piece page goes through the cart's checkout**
(a `data-buy` button → the Worker → Stripe), never the Payment Link, because
the Payment Link would charge the plain price. The Payment Links stay live
underneath — they are how the sold sweep and the drift repair know a piece,
and how the Worker tells a sold piece from a live one (a sold piece's link is
inactive). Outside the sale, Buy now is the Payment Link exactly as before;
Add to cart is offered either way.

**The Worker's session** uses `price_data` on each piece's existing Stripe
product (so the sweep and the report can match the line to the piece), the
flat shipping rate, US addresses, the terms consent, a one-hour expiry,
`metadata.ta_ids` naming the pieces, and either the tier coupon or
`allow_promotion_codes` (Stripe allows one discount per session, so a welcome
code cannot stack on a tier). Success returns to `/thanks`, cancel to `/cart`.

## Before the window opens — Karen's list

The classifier keeps me from live coupon writes and from deploying the
Worker, so these are yours. Twenty minutes.

1. **Tier coupons** (needs the full key in `.env`):
   ```
   node scripts/sale-coupons.mjs            # check
   node scripts/sale-coupons.mjs --write    # make BF26_15, BF26_25, BF26_40, BF26_50
   ```
   If this is skipped the Worker makes a missing coupon at the first checkout
   that needs it, provided its key may write coupons.
2. **A Stripe key for the Worker.** Stripe Dashboard → Developers → API keys →
   Create restricted key, live mode: **Checkout Sessions: Write · Payment
   Links: Read · Coupons: Write**, everything else None. Then, in
   `worker/stripe-hook`:
   ```
   npx wrangler secret put STRIPE_SECRET_KEY     # paste the rk_live_… key
   npx wrangler secret put SALE_PREVIEW_KEY      # any word, e.g. clubhouse (optional, for step 4)
   npx wrangler deploy
   ```
3. **Push `main`** (this change) so the site, the checkout map and the new
   crons are live. The sale stays invisible until Friday 00:00 ET; the cart
   is live at once.
4. **Preview and a dry run** (after 2 and 3): open
   `https://tourarchive.us/?sale=clubhouse` (the word from step 2). That tab
   shows the sale as it will look Friday: banner, ticker, tags, struck prices.
   Add two pieces, open the cart, press Checkout — Stripe's page should show
   the sale prices and, over $100, the tier coupon. Close the tab; nothing is
   charged. A card test is fine too: Stripe charges real money in live mode,
   so refund it after (the sold sweep reopens a refunded piece).
   Without the Worker word, `?sale=anything` previews the site only; a
   checkout from that tab is priced by the real clock.
5. **Friday 00:00 ET** needs nothing. The site switches on the visitor's
   clock; the 00:05 rebuild makes the prerendered pages match. Check
   `https://tourarchive.us/` after 00:05 and `node scripts/live-probe.mjs`.

## During

- A cart order shows in Stripe as one payment with the pieces named in its
  description; each piece's sale notice names the order total and the tier.
- The sweep marks every piece of a cart order sold and closes their links
  within a tick, as for a link sale. Between the payment and that tick a
  second buyer could still put the same piece in a cart; the Worker refuses
  it the moment the link is closed, and before that Stripe would take the
  second order — the same window the link sales have always had, about three
  minutes. Watch the sale notices; a double sale is refunded by hand.
- To change the window, a tier or the rule mid-sale: edit `src/data/sale.js`,
  push. The site reads it on the next load; the Worker needs
  `npx wrangler deploy` again for the Worker side. To end early, set `ends`
  to now.
- To take a piece out of the sale: `"sale": false` on its manifest entry,
  push. To add one over the line: `"sale": true`.

## After

The window closes itself. The 00:05 ET rebuild on 1 Dec strips the sale
from the prerendered pages. Delete the two sale crons from `wrangler.jsonc`
(and deploy) and from `deploy.yml` when convenient; they are harmless. The
coupons expire by themselves a day after the window.

The cart stays. Outside a sale a cart order simply bundles pieces under one
shipping charge, with the welcome code accepted at checkout.

## Reports

A cart order is one Checkout Session with several line items. The sales
report writes one row per piece: the piece's own subtotal (after its sale
discount and its share of the tier, so `list_price − subtotal` is the whole
saving), and shipping, tax, Stripe's fee and any refund shared by the lines'
totals. Odd cents can leave an order's rows a cent apart from the order.
`subtotal` on every Stripe row is now the amount after discounts (it was the
pre-discount figure); see docs/SALES-REPORT.md.
