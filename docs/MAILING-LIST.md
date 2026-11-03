# The mailing list and the welcome code

A visitor the site has not met is offered ten percent off their first piece
for an email address. The address goes on our list, and a code that is
theirs alone arrives by email. Nothing new to pay for: the pieces are the
Worker we already run, the sync on GitHub, the Gmail sender the sale
notices use, and Stripe's own promotion codes.

## What the visitor sees

- **The footer form** on every page ("Email for drop notices", Join).
- **The first-visit card**, bottom right, on a first visit only: after the
  intro plate and nine seconds, or once they have scrolled well into the
  page. Close or Escape puts it away for a month; joining puts it away for
  good (remembered in the browser, so a cleared cache sees it again). It
  does not appear on the desk, terms, privacy or sell pages.
- After joining: "Your code is on its way." The code is never printed on
  the page. It comes by email, which is what proves the address is real.

## The code

Each subscriber gets their own Stripe promotion code on the `WELCOME10`
coupon (10% off, once), in the form `ARCHIVE-7K3P`:

- **one redemption**, so a code passed around is a code already spent;
- **first purchase only** (Stripe's first-time-transaction restriction);
- **thirty days** from the welcome email;
- tagged in Stripe metadata with the address it went to.

The buyer enters it at checkout under "Add promotion code". Every live
payment link accepts codes (`node scripts/promo-setup.mjs` switched the
existing ones on; `stripe-mint.mjs` and `stripe-drift.mjs` mint new links
that way). An address that joins twice gets no second code.

To see the codes and which were used: `node scripts/promo-setup.mjs --codes`.

## How it moves

1. The site POSTs the address to the Worker (`/subscribe`): only from our
   own origin, with a hidden honeypot field bots fill and people never see,
   five tries an hour per connection. Stored in the Worker's KV under
   `sub:<address>`.
2. The Worker starts the welcome job on GitHub at once
   (`.github/workflows/welcome-mail.yml`). The ten-minute sync also runs the
   same script as a sweep.
3. `scripts/welcome-mail.mjs` mints the code in Stripe, sends the welcome
   email from the sale-notice Gmail, marks the subscriber welcomed, and
   writes `mailing-list.csv` to the report store.
4. The Apps Script that files the sales reports files the list too, into a
   **Mailing List** folder at the top of My Drive (columns: email, joined,
   source, page, code, code_expires, welcomed, unsubscribed).

Unsubscribe: every welcome email ends with a link to `/unsubscribe` on the
Worker, signed with an HMAC of the address, so only that link can act. The
row stays in the list with an `unsubscribed` date; never mail those.

## What the Stripe key needs

The restricted key in GitHub (`STRIPE_DRIFT_KEY`) needs **Promotion Codes:
Write** and **Coupons: Read** on top of its existing grants. Until it has
them the welcome job reports exactly that and sends nothing; subscribers
wait, nothing is lost.

## Sending to the list

This is the list, not the newsletter. A drop notice to everyone is a
mail-merge from `mailing-list.csv` (skip rows with an `unsubscribed` date)
or an import into whichever mailing service we pick later; every provider
takes that CSV.
