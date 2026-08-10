# Tour Archive — Cofounder Deck Brief

**For Claude Cowork.** Build a **10-slide presentation** from this brief. The audience
is two non-technical cofounders; the presenter is the Technical Officer. Everything a
slide needs is in the slide-by-slide section — content, speaker note, and visual.
This brief **overrules the attached pptx** wherever they disagree; the pptx
(`tour-archive-walkthrough.pptx`) is source material for the four slides marked
*adapted from* and a register/style reference, nothing more.

Three chapters: **the listings** (how a piece reaches the shop front), **the desk**
(the Procurement Desk ritual), **the robot** (Tourbot and what the house costs).
Close on three asks. No slide added, none removed.

---

## Design direction (from the site's own stylesheet)

The deck should look like it was printed by the same house that printed the site.
These values are lifted from `src/styles/app.css` — use them exactly.

**Palette**

| Token | Hex | Use |
| --- | --- | --- |
| Parchment | `#f4f0e6` | Slide background (deep variant `#ebe5d6` for panels) |
| Ink | `#16150f` | Body text (soft `#4a4739`, faint `#7c7867`) |
| Racing green | `#14301f` | Chapter/title slides inverted, emphasis blocks (mid `#2f4a34`) |
| Claret | `#6b2233` | Accents, rules, the occasional stamp |
| Brass | `#a8874f` | Hairlines, numbering, small ornaments (soft `#c9b283`) |

**Type**

- Display serif: **Cormorant Garamond** (Georgia fallback) — titles and big numbers,
  tight tracking (−0.015em).
- Sans: **Jost** (Helvetica fallback) — kickers and labels, UPPERCASE, wide tracking
  (0.18–0.26em), light weights.

**Slide anatomy** — every content slide is: small tracked-uppercase **kicker** (brass
or claret), a large serif **title**, lean body, generous parchment margins. Think
archive file, member's card, order of play — not a startup deck.

**Voice** — dry, confident, house vocabulary: *the pile, the ledger, dressed, dealt,
drops, the house*. No hype, no exclamation marks, no emoji.

**Jargon ban** (translate if the pptx tempts you): VPS → "renting our own server" ·
UTC → "early every morning" · SKU is allowed only as "the SKU field on the listing
form" · never: adapter, localStorage, RLS, anon key, Postgres, CDP, API (except
"the eBay API" in a speaker note).

**Trademark guardrails** — never name a product "Bobby Jones"; no FedEx colours; no
PGA promotional imagery.

---

## Assets

**Attached files (use directly):**

- `logo.png` — the TA crest. The **single** crest source for the deck (title slide
  large, closing slide small).
- Stock photographs (1200×1600, real inventory): `slazenger-golden-horseshoe-wind-shirt.jpg`,
  `masters-peter-millar-quarter-zip-blue.jpg`, `peter-millar-club-quarter-zip-navy.jpg`,
  `ryder-cup-print-polo.jpg`, `sun-faded-golf-pullover.jpg`,
  `university-of-kentucky-polo.jpg`, `bugle-boy-polo.jpg`.
- `tour-archive-walkthrough.pptx` — the 20-slide technical walkthrough this deck
  distils. Adapted slides are flagged below; its other slides are out of scope.

**Screenshots (attached if available):** tourarchive.us home · /archive ·
/curate (the desk, signed in) · /curate/review (deck mid-swipe, stamp visible).
**If a listed screenshot is not attached, render a parchment placeholder frame with
the URL as a label — never invent UI.**

---

## Truth guardrails (why some pptx content must NOT carry over)

The pptx predates several facts. When adapting, hold these lines:

1. **The hand-kept ledger IS the store.** All six live eBay listings flow through a
   manual entry (two pasted fields) the Technical Officer makes in the house ledger.
   The automated eBay/Depop API sync is built and tested **but not live** —
   credentials pending. Never imply that listing on eBay auto-populates the site.
2. **Tourbot has two jobs, not three.** It dresses desk finds, and its picture-pull
   logic fetched the archive's own listing photos. Marketplace sync is a *future*
   job — speaker-note material only.
3. **There ARE photographs now** — seven real pieces in stock. The pptx's "there are
   no photographs" slide and its 36-piece/six-drop statistics are mock-era; quote
   only the numbers in this brief.
4. Skip entirely: pptx slides 13/14/16/18 (architecture rationale), 8 (API pipeline),
   20 (stale blocker list), 6 (superseded imagery story).

---

## The deck, slide by slide

### 1 · Title — "Tour Archive — How the House Runs"

**Kicker:** HOUSE PAPERS · AUGUST 2026
**Body:**

> **tourarchive.us** · presented by the Technical Officer
>
> I. **The listings** — how a piece reaches the shop front, and where checkout really happens
> II. **The desk** — the pile, the review, the shortlist
> III. **The robot** — Tourbot's rounds, and what the whole house costs

**Speaker note:** Three chapters and only three asks at the very end; everything else
is the robot's shift.
**Visual:** crest (`logo.png`) large on parchment; racing-green rule; brass numbering.

---

### 2 · "The Shop Front" — what a visitor sees today

**Kicker:** WHAT A VISITOR SEES TODAY
**Body:**

- **The window:** seven pieces, photographed and on record — six live on eBay today,
  the seventh waiting its turn.
- **The record:** collection pages carry their history with sources cited; the
  archive page is the full ledger — filterable by status, collection, type and era.
- **The question the next two slides answer:** how does a piece get from your listing
  to this page — and who keeps it current?

**Speaker note:** Every number here is from today's ledger — six live eBay listings,
one piece waiting. Nothing on the shop front is fake stock.
**Visual:** home screenshot + a contact-sheet strip of all seven stock photographs.
*(Framing adapted from pptx slide 2 — do not reuse its statistics.)*

---

### 3 · "From Your Listing to the Ledger" — how a piece gets in

**Kicker:** HOW A PIECE GETS IN
**Body (four numbered beats):**

1. **You list** — on eBay or Depop, exactly as you already do. Nothing new to learn.
2. **The ledger takes it** — the Technical Officer enters it in the house ledger
   (two pasted fields: which marketplace, and the listing's address), and the
   photographs come straight off your listing — no retyping, no re-shooting.
   Four of our six live pieces were dressed this way.
3. **The house dresses it** — our record and styling: the story, the colourway, the
   collection it belongs to.
4. **The buy button leaves the house** — checkout completes on eBay or Depop, on
   purpose. We send the marketplaces traffic; we never intercept a sale.

*Footer line:* If anything stops — robot, marketplace, all of it — the shop stays
open on its last good ledger. Nothing ever goes blank.

**Speaker note:** The hand-kept ledger is the store today; the eBay API takes over
the same fields when credentials land (support thread open) and the shop front will
not change.
**Visual:** /archive or an item-page screenshot showing the eBay badge and the
redirect-out buy button.
*(Adapted from pptx slide 10 — keep its four-beat shape and "shop stays open" coda;
its "small program on a schedule" paragraph described the not-yet-live sync: omit.)*

---

### 4 · "The One Field That Matters" — the catalogue number

**Kicker:** THE CATALOGUE NUMBER
**Body:**

Large centred graphic: **TA — DS — 01** · *the house — the collection — the piece*.
Type it in the eBay **Custom SKU** field; on Depop, the SKU field or anywhere in the
description.

- **Typos are forgiven on purpose** — set `TA-DS-01 · ta_ds_01 · TA DS 01 · TADS01`
  as a small typographic row: all four read the same, because this gets typed by
  hand on a phone.
- **The number is the habit that makes the future sync automatic.** Today the
  Technical Officer joins listing to ledger by hand; when the sync turns on, a
  number-less listing files under **Basic Stock** — a worse shop, not a broken one.
- **The lifecycle, in one line:** on the site only before and during the event; on
  the marketplaces after.
- **When a piece sells, mark it sold** — the one recurring duty. Miss it and a buyer
  clicks through to a dead listing.

*Footer line:* Standing question for the room — does TA-XX-NN suit how you actually
label stock? The format can change in an afternoon; the habit can't.

**Speaker note:** The only place the pipeline needs a human: one field at listing
time, one "sold" when it goes. (For the TO: the forgiving parser is
`server/normalize.mjs`; the sold flag lives in `public/stock/manifest.json`.)
**Visual:** the TA—DS—01 breakdown as the hero; four-spellings row beneath.
*(Adapted from pptx slide 11, nearly whole — its lifecycle "the marketplace owns
price from then on" belongs to the sync era; keep the softer line above.)*

---

### 5 · "The Procurement Desk — Getting In"

**Kicker:** THE PROCUREMENT DESK
**Body:**

- **What it replaces:** links sent to the chat, where they scroll away and die. The
  desk gives every find one place to land — one pile, everyone in it.
- **Your account is handed to you.** No sign-up button, on purpose — the desk is
  team-only. Sign in once per device and it sticks.
- **Put it on your home screen (20 seconds).** iPhone: Safari → Share → *Add to Home
  Screen*. Android: Chrome → ⋮ → *Add to Home screen*. It opens like an app.
- **Lost the password?** Text the Technical Officer. There's no email reset — asking
  is faster.

**Speaker note:** Have both cofounders sign in and home-screen it before this slide
ends — it is the only setup the desk will ever ask of them.
**Visual:** /curate screenshot.
*(Adapted from pptx slide 15, trimmed to share the slide with the screenshot.)*

---

### 6 · "Drop a Find — Ten Seconds"

**Kicker:** IN THE AISLE
**Body:**

- In the eBay or Depop app: **Share → Copy link.** Open the desk. Paste. **Add to
  the pile.**
- The green **"Logged"** line is your receipt — the find lights up at the top of the
  pile and the whole team can see it.
- **Only the link is required.** Tourbot dresses the find — picture, name, price —
  on its own, usually within hours.
- Pasted something twice? The desk tells you **who already dropped it.** Nothing is
  added twice.
- **The one rule:** if it made you stop scrolling, drop it in. The pile is where we
  argue — not the chat.

**Speaker note:** Do it live on your phone, one-handed, against a stopwatch — the
ten seconds is the whole pitch.
**Visual:** /curate screenshot with the green "Logged" confirmation showing.
*(The one-rule line comes from pptx slide 12.)*

---

### 7 · "The Review Session" — dealing the pile, and where decisions live

**Kicker:** AT THE MEETING
**Body (two columns):**

*Dealing the pile*

- Tap **Review the pile** — finds come up one card at a time, and **the card is the
  photograph**: the piece edge-to-edge, name and price inked over its lower edge.
- **Swipe right** — shortlist. **Swipe left** — pass. **Undo** takes back the last
  swipe, mid-pile and at the end. The small pill opens the real listing.
- A find still waiting on its picture can play too — **View without images** deals
  it written instead of pictured. No meeting ever waits.

*Where decisions live*

- The shortlist has **one address** — `/curate#shortlist`. The **Shortlisted** number
  on the desk is a link straight to it.
- When we actually buy, tap **Mark bought** — the receipt, and how a find flows
  toward the site's archive.
- **Nothing is ever deleted.** A mistaken pass goes *Back to the pile*. The loop:
  paste → review → shortlist → bought.

**Speaker note:** Deal three or four cards live and let them swipe — the gesture
explains itself faster than the slide does. Close by tapping the Shortlisted number.
**Visual:** /curate/review screenshot mid-swipe, SHORTLIST stamp visible.

---

### 8 · "TOURBOT — The House Robot"

**Kicker:** THE STAFF
**Body:**

- **Paste a bare link; the robot dresses it.** It opens the listing in a real
  browser, exactly as a person would — the marketplaces shut the door on plain
  programs — and brings back the photo, the title and the price.
- **Four rounds a day: 07:40 · 12:40 · 17:40 · 22:40.** Machine was off? The next
  round catches up.
- **Cowardly on purpose.** It writes only titles it is sure of — a bad title never
  overwrites a good one — and a missing price never holds a find back.
- **Three tries, then it stands aside.** The find stays on the desk with the reason
  on its row, and *View without images* deals the card anyway.
- **Already proven on our own stock** — the same picture-pull logic fetched the
  photos off the archive's own eBay listings before the desk ever asked. One robot,
  two jobs.

**Speaker note:** Point at the polo — that photograph came off our own eBay listing
via the same picture-pull logic. If asked about marketplace sync: that's the eBay
API path, ready and tested; support thread open, Depop shelved until volume
justifies it.
**Visual:** one stock photo (suggest `ryder-cup-print-polo.jpg`) captioned
*"fetched off our own listing by the same picture-pull."* The four round times set
large in brass.
*(Plain-English fragments from pptx slide 17 only — no writer/column mechanics.)*

---

### 9 · "The Stack and the Bill"

**Kicker:** THE HOUSE ACCOUNTS
**Body:**

Headline, serif, very large: **~$11–20 a year, all-in — and that is the domain.**

- **The site** — hand-built pages; GitHub publishes them for nothing, refreshed
  early every morning.
- **The desk** — the shared pile lives in a free database, sign-ins included.
- **The robot** — a scheduled task on one machine; there is no server to mind.
- Every change passes an **automated check suite** before it can go live — a failed
  check never touches the shop.

| Component | Provider | Cost |
| --- | --- | --- |
| Site hosting + daily rebuild | GitHub Pages + Actions | $0 |
| Desk database + sign-in | Supabase (free tier) | $0 |
| Domain | Porkbun | ~$11/yr |
| **All-in, year one** | | **~$11–20** |

*Footer line:* The alternative — renting our own server — runs $60–120 a year and
brings 3am duties: patching, uptime, backups. This stack outsources all of that for
the price of the domain.

**Speaker note:** If asked what breaks first: nothing before revenue does — the
first real bill is a $25/month database tier, and by the time we need it, it's
earned.
*(Adapted from pptx slide 19, table compressed, plus one breath of slide 3's
plain-language stack description.)*

---

### 10 · "House Rules — Three Asks"

**Kicker:** THE LEDGER, CLOSED
**Body:**

Everything the house asks of you:

1. **Type the catalogue number** into every listing — and mark it sold when it sells.
2. **Drop finds in the pile**, not the chat.
3. **Mark bought** when we buy.

Everything else — dressing the finds, rebuilding the site, keeping the shop open —
is the robot's shift. **The house is open.**

**Speaker note:** Land the three asks slowly, then the last line dry — the robot
works nights so nobody in this room has to.
**Visual:** small crest (`logo.png`) at the foot; otherwise near-empty parchment.

---

*Brief compiled 5 Aug 2026 by a planner → three researchers → skeptic review pass.
Adapted from `tour-archive-walkthrough.pptx` slides 10, 11, 15 and 19, with
fragments of 2, 12 and 17; slides 6, 8, 13, 14, 16, 18 and 20 deliberately not
carried (superseded or off-audience). Facts verified against the repo and the live
site on 5 Aug 2026.*
