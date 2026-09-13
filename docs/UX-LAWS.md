# The 20 UX laws — Tour Archive's review framework

Adopted 13 Sep 2026. A recurring review, not a one-off: run it when a
surface changes shape, before a drop opens, and whenever the shop's job
changes (it changed twice this month — eBay to Stripe, drop to off season).

Half of these laws reduce to numbers a browser can read. Those live in
`scripts/ux-probe.mjs` (`node scripts/ux-probe.mjs`, add an origin to run it
against production). The other half are judgement calls that need a person in
front of the page — this file is where the judgement gets written down, so the
next pass argues with the reasons rather than rediscovering them.

**The probe reports; it never fails a build.** Correctness lives in
audit/smoke/integration/deploy. This is where craft gets measured, and craft
sometimes loses an argument to something more important.

---

## The ritual

```
npm run build:pages          # the probe reads dist/
node scripts/ux-probe.mjs    # phone width, the hard case
node scripts/ux-probe.mjs --width 1280
node scripts/ux-probe.mjs https://tourarchive.us   # after a deploy
```

Then walk the judgement half below on the surfaces that changed. Record new
decisions — especially deliberate exceptions — in this file.

---

## Measured by the probe

| # | Law | What it means here | Threshold |
|---|-----|--------------------|-----------|
| 1 | **Hick's law** | Reduce choices per screen. A shopper deciding between pieces should not also be deciding between controls. | warn over 12 interactive elements in the first view |
| 2 | **Fitts's law** | Make targets large. Measured as the *effective hit area*, not the box — a hit-area overlay counts. | 44×44 CSS px (WCAG 2.5.5, Apple HIG) |
| 6 | **Doherty threshold** | Interactions under 400 ms, or attention leaves. | click → visible change ≤ 400 ms |
| 7 | **Von Restorff effect** | Highlight the primary action. One emphasised thing, or the emphasis means nothing. | 1–2 `.btn--solid` in the first view |
| 5 | **Miller's law** | Break content into chunks; no group asks you to hold more than a handful. | warn over 9 items in one group |
| 8 | **Minimize target distance** | Place key actions near each other and near the thumb. | card gap vs inner gap |

## Judgement — walked by a person

| # | Law | What it means here |
|---|-----|--------------------|
| 3 | **Jakob's law** | Follow familiar patterns. A vintage shop is still a shop: cards, a grid, a product page, a checkout. Our distinctiveness belongs in the photography and the writing, never in where the buy button lives. |
| 4 | **Law of proximity** | Group related information. Price sits with availability; measurements sit with sizing; provenance sits away from both. |
| 9 | **Serial position effect** | Put essentials first and last. The archive leads with the dearest piece and the footer closes with contact — first and last are the positions people keep. |
| 10 | **Peak–end rule** | End flows memorably. The last thing a buyer sees is Stripe's confirmation, so the custom message there is doing real work: *"Thank you. Your piece ships within 3 business days; tracking follows by email."* |
| 11 | **Zeigarnik effect** | Show visible progress. Unfinished things pull attention — the drop countdown used this honestly; an off-season site has no countdown and should not invent one. |
| 12 | **Law of Prägnanz** | Simplify complex interfaces. When a layout can be read as a simple shape, it will be. The off-season hero is one mark, one name, one action. |
| 13 | **Law of similarity** | Things that look alike are assumed to behave alike. Every buyable piece must look identical in treatment; sold pieces differ by exactly one signal (the claret sash). |
| 14 | **Uniform connectedness** | Connect related elements visually. A card is one object — photo, name, price — and reads as one because it shares a container, not because the items happen to be near each other. |
| 15 | **Tesler's law** | Complexity is conserved. Someone absorbs it. One-of-one inventory is genuinely complex; we moved that complexity into the mint script and the sold sweep rather than onto the buyer. |
| 16 | **Postel's law** | Be liberal in what you accept. The manifest tolerates missing fields, placeholder sizes and absent photos without breaking a page. |
| 17 | **Parkinson's law** | Reduce task completion time — work expands to fill the time allowed, so allow less. Checkout is one press to a hosted page, not a cart and a funnel. |
| 18 | **Occam's razor** | Remove what does not earn its place. This is the law that deletes things: the "Full photographs and condition notes on the listing" bullet, the per-plate object-position hooks, the channel chips. |
| 19 | **Pareto principle** | 80% of the value is in 20% of the surface. The product page and the buy button are that 20%; the journal is not. Spend accordingly. |
| 20 | **Goal-gradient / make completion feel closer** | Effort rises as the goal nears. Nothing should be introduced late in a purchase — no surprise shipping, no new decision at checkout. Shipping is stated on the page, in the terms, and on Stripe's page before payment. |

---

## Pass 1 — 13 Sep 2026

Run at 390×844 against `dist/`, over `/`, `/archive`, `/collections`.

### Fixed

**Fitts's law — 19/33/17 failing targets, now zero.** Every control a thumb
uses was under 44px: the menu trigger at 51×19, the drawer close at 84×19, the
breadcrumb at 33×14, the header wordmark at 155×40, the archive's filter chips
at 34px tall, and the whole footer navigation at 21px.

Two fixes, chosen by whether the element had room to grow:

- **Hit-area overlay** (`::after`, negative inset) for type set in a header or
  breadcrumb — the menu trigger, drawer close, wordmark, breadcrumb. Not one
  pixel of type moves; only the region that answers a press grows. Making the
  letters bigger would have wrecked the composition to fix an ergonomics
  problem.
- **Real height** (`min-height` + flex centring) for discrete controls with
  space around them — filter chips, section-head links, footer navigation,
  the signup field. The chips sit 0.5rem apart, so overlapping overlays would
  have sent a press to the neighbouring chip; a slightly taller filter bar is
  the honest cost.

**The probe itself was wrong twice, and both corrections are the interesting
part.** It first counted the closed drawer's links — `clip-path` leaves them
measurable — reporting choices the screen does not offer; `aria-hidden` was
already correct in the markup and is now the filter. It then reported the
overlay-fixed controls as still failing, because it measured the element's box
rather than the hit area. It now aims a 44×44 press at each control and asks
the document what that press would land on. **A measurement you have not
checked against reality is an opinion with a number attached.**

### Considered and left alone

**Von Restorff on `/archive` and `/collections`** — no emphasised action in the
first view. Deliberate: these are browse surfaces where the *pieces* are the
action, and a solid button competing with the grid would pull attention off the
stock. Flagged each run; not a defect.

**Inline prose links stay at text height.** Jakob's law wins over Fitts here: a
link inside a sentence should look and behave like a link inside a sentence,
and a 44px band around a word would collide with the line above.

### Recommended, needs a product decision

**Sensible defaults on `/archive`.** The filter defaults to `all`, which shows
sold pieces alongside available ones. Most arrivals want to buy. Defaulting to
`available` would serve Von Restorff (the shop's purpose leads) and "use
sensible defaults" — but it cuts against the deliberate choice that sold pieces
stay visible as a record of demand. **Karen's call.**

### Clean on this pass

Hick (4–6 choices per first view, well under 12) · Doherty (6–17 ms, far under
400) · Miller (no group over 9) · proximity (cards 24px apart, tighter within).
