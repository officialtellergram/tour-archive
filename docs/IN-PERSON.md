# Selling in person (Tap to Pay)

For a stall or an event. Payments are taken on a phone with the **Stripe
Dashboard app**, no reader needed, and the sync treats the sale like any
other: the piece shows sold on the site within minutes, its eBay listing is
ended, the team gets a notice, and the sale is in the report and in Stripe.

## Before the day

- Everyone who will take payments needs a Stripe login on the Tour Archive
  account with a role that can accept payments (not Support or View-only),
  two-step verification on, and a verified phone number.
- Phone: iPhone XS or newer with a passcode set and signed in to iCloud, or
  an NFC Android on Stripe's supported list. NFC on, location on.
- Install the Stripe Dashboard app and sign in once at home, not at the
  stall.

## At the stall, each sale

1. Open the Stripe Dashboard app, tap **+**, choose **Charge a card or send
   an invoice**.
2. Enter the amount.
3. In **Description**, type the piece's name as it reads on the site, for
   example `Vintage Titleist Logo Sweater`. This is how the sync knows
   which piece sold. The catalogue number (`TA-GS-04`) works too.
4. Choose **Tap to Pay** and have the buyer tap their card or phone. If the
   tap fails, the same screen can key the card in by hand.
5. Offer a receipt from the success screen (email or text).

Agreed a different price at the stall? Charge what was agreed; the sync
records what was paid and keeps the list price beside it.

## What happens next, on its own

The sync runs every ten minutes. It reads Tap to Pay charges from Stripe
and matches each to a live piece by the description; with no usable
description it falls back to the price, but only when exactly one live
piece has that price. A match is marked sold: checkout closed, eBay listing
ended, team notice sent ("Sold in person: …", with the amount and card).

A charge it cannot place — nothing typed, a name that fits several pieces,
a price several pieces share — is **not guessed**. The team gets an email
("In-person payment $X not matched to a piece") and the piece stays live
until Karen marks it by hand. Typing the name avoids this.

A refund issued later (Dashboard app → Payments → the payment → Refund)
reopens the piece: for sale again on the site, eBay relisted on the next
run.

## Fees

Stripe's in-person rate (2.7 % + 5¢ in the US) instead of the online rate.
The sales report shows in-person rows with channel `in-person`, no shipping
and no label, with Stripe's fee and the net.

## Trying it beforehand

`node scripts/stripe-sold.mjs --simulate "Vintage Titleist Logo Sweater" 79.99`
runs the matcher offline against the catalogue and says which piece it
would mark, or why not. A real one-dollar Tap to Pay charge with the
description `test` will land in the team's inbox as "not matched", which
proves the loop end to end; refund it afterwards.
