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

## The checklist

**The night before**
1. `npm run stall:sheet` and print it: every piece that can be sold, the
   exact words to type, size, list price, a tick box, a space for the amount
   charged. Held pieces are shaded.
2. Every seller has the Stripe Dashboard app, is signed in, has done one
   Tap to Pay (a refunded dollar is fine), and has the sheet.
3. The pieces at the stall are the pieces on the sheet. Anything else stays
   in the car.

**Each sale**
1. Find the piece on the sheet.
2. Stripe app → + → Charge a card or send an invoice → the amount.
3. Description: the piece's catalogue number from its tag (`TA_GS_27`),
   which is also the sheet's third column. The piece's name works too.
4. Tap to Pay. Receipt if they want one.
5. Tick the row and write the amount charged.

**During the day, every hour or so**
- The team inbox should hold one "Sold in person: …" per tick. A "not
  matched" email means a description went wrong: note which piece on the
  sheet and tell Karen; the piece is still live until she marks it.
- The site (tourarchive.us/archive) shows sold pieces at the bottom; what
  you ticked should be there within ten minutes.

**End of day**
- Ticks on the sheet = "Sold in person" emails = Payments in the Stripe app
  for the day. Three numbers, one answer.
- Any held piece that sold: its Stripe product is archived by the sync; tell
  Henry so he does not look for it when the drop is built.
- Refund anything taken by mistake from the app; the piece reopens by itself.

## Catalogue numbers and tags

Every piece has a catalogue number: `TA_GS_27` for general stock,
`TA_TC26_04` for the Tour Championship drop, `TA_PC26_02` for the
Presidents Cup drop, and so on. It is on the piece's Stripe product as the
metadata row `sku`, on the stall sheet, and is what the sync matches at a
sale, so it is the thing to write on the tag.

New pieces get the next number in their series when they are drained, and
the number is written back to the Stripe product. Henry can also set the
metadata row `sku` himself when listing (same format, unused number) and
the drain keeps it. Held pieces are not drained, so for those he sets `sku`
himself if he wants a number on the tag; otherwise the name does the job.

## Held pieces: saved for a drop, sellable in person

Pieces the team is keeping back for a future drop stay out of the public
catalogue but can still be sold to someone who sees them at the stall. The
"sandbox" for these is Stripe itself:

- Henry lists the piece in Stripe as usual — the normal live account, not
  Stripe's Sandbox (test mode), where a real tap could never match — with
  photo and price, and marks it held in any one of three ways: a line in
  the **Description** reading just `HELD` (easiest, it is the field he is
  already typing in); the name starting with `HOLD:`; or a metadata field
  `held` = `true` under More options.
- The drain leaves it alone: it never reaches the site, the archive, the
  sitemap or eBay.
- The stall sheet lists it, shaded HELD, with the words to type.
- Sold at the stall, the sync records it in its in-person ledger, emails
  "Sold in person (held piece): …", archives the Stripe product so it cannot
  be drained into the drop later, and puts it in the sales report as
  `in-person (held)`. Refunded, the product comes back.
- When the drop is built, Henry removes the `held` metadata (or the `HOLD:`
  prefix) and the next drain brings the piece in with its photographs like
  any other.

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
