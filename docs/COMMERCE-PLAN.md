# The site becomes a till — payments & inventory action plan

Drafted 11 Aug 2026, pre-launch. The goal: tourarchive.us sells directly —
its own revenue stream beside eBay — while every piece stays listed on all
channels. Same listings, three doors, first buyer wins.

## The shape of the problem

Every piece is one of one. The moment the site can take money, the risk is a
double-sell: the polo goes on Stripe at 14:02 and on eBay at 14:03. So the
plan is built around two rules:

1. **The manifest stays the single source of truth.** It already carries the
   listing URLs, the sold flags, and the photographs; it gains the payment
   link. Inventory tracking IS the manifest plus git history — no second
   system to drift.
2. **Every sales door closes itself after one buyer.** Stripe Payment Links
   can be capped at a single purchase; eBay listings are quantity-1 already.
   Cross-channel close-out is a same-day manual duty until the APIs land —
   the same discipline as today's mark-it-sold.

## Why Stripe Payment Links (and not a cart)

The site is static (GitHub Pages, no server). A Payment Link is a Stripe-
hosted checkout page reached by URL — created in the dashboard, pasted into
the manifest **exactly like a listingUrl**. That is the manual bridge
pattern again, and it means:

- zero backend, zero PCI surface, nothing new to host;
- Stripe collects card/Apple Pay/Google Pay, shipping address, and emails
  the receipt;
- the link can be capped at **1 payment** — the on-site door closes itself;
- 2.9% + 30¢ per sale (vs eBay's ~13% final value fee — the whole point).

One-of-one pieces do not need a cart, accounts, or a database. Deliberately
not built.

## Phase 0 — accounts (cofounders, ~1 hour, this week)

- [ ] Create the Stripe account (business details, bank account, identity).
- [ ] Decide flat shipping (e.g. $8 US) and whether to enable Stripe Tax.
- [ ] Confirm the refund line for the policy footer ("all sales final,
      condition photographed as found" is defensible for 1-of-1 vintage —
      your call).

## Phase 1 — the pasted link (Technical Officer, ~half a day, pre-drop)

- [ ] Manifest entries gain an optional `"buyUrl"` (a `buy.stripe.com` link).
- [ ] The PDP renders a **Buy now** button when `buyUrl` is present — the
      site's own door, beside the marketplace redirect, not replacing it.
- [ ] Audit gains the tripwire: `buyUrl` must be a `https://buy.stripe.com/`
      URL; a sold piece must not carry an active one.
- [ ] Per piece in the Stripe dashboard: product + price, **limit to 1
      payment**, collect shipping address, flat shipping rate, receipt on.
- [ ] Close-out drill, written into the stock README: any sale on any
      channel → same day, mark `"sold": true`, end the eBay listing,
      deactivate the Stripe link. Three minutes, phone-doable.

## Phase 2 — semi-automated sold-sync (post-launch)

- [ ] A tiny webhook receiver (the repo already keeps a Netlify-functions
      path warm) hears Stripe's `checkout.session.completed`, flips
      `sold: true` via repository_dispatch, rebuilds the site, and emails
      the team (Resend free tier).
- [ ] `npm run stocktake`: cross-check Stripe link status against manifest
      sold flags with a restricted API key in local `.env` — the audit's
      cousin for money.

## Phase 3 — the APIs close the loop (when eBay credentials land)

- [ ] eBay sale webhook/poll ends the race window from the other side:
      auto-end site availability when eBay sells, auto-end the eBay listing
      when Stripe sells.
- [ ] Depop stays shelved until volume justifies it (standing decision).

## Standing decisions, restated

- Redirect-out checkout **remains** for marketplace listings — Depop's
  no-diverting rule applies to Depop traffic, not to our own site having its
  own till. The site's Stripe door is a third channel, not a diversion.
- The race window between channels is real and accepted at current traffic;
  the mitigation is door-caps plus the same-day close-out drill, then
  Phase 2/3 automation.
