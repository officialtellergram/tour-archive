# Tour Archive — interactive mockup

Vintage golf apparel, catalogued by the championship it belongs to. Drop-based
merchandising in the Ralph Lauren Vintage mould, rendered in a traditionalist
luxury-golf register: parchment, clubhouse green, claret, brass, garamond
display type and hairline rules.

## Run it

```bash
npm install
npm run dev          # site      → http://localhost:5180
npm run server       # inventory → http://localhost:5181   (optional)
```

The site runs without the server: it falls back to the curated catalogue. With
the server up it reads merged live inventory instead. **Nothing in the frontend
differs between those two states** — see [Marketplace integration](#marketplace-integration).

Before going live, work through **[ACTIONS.md](ACTIONS.md)** — the eBay keys,
the Depop partnership, and the three decisions only you can make.

## The iteration loop

Four checks, run after every change. Each catches a different class of failure,
and the whole loop takes about a minute.

```bash
npm run audit        # every internal link resolves to a real route + real data
npm run smoke        # every route actually renders
npm run integration  # marketplace listings map into the archive correctly
npm run layout       # no horizontal overflow, in a real browser (needs dev running)

npm run check        # audit + smoke + integration   (no browser needed)
npm run check:all    # all four
```

**Before shipping anything visual, stage it.** `npm run stage` runs the gate,
builds the exact artefact Pages serves (static inventory snapshot included),
and opens it at `http://localhost:4173` — byte-for-byte what production will
show, with none of the CDN's ten-minute cache to argue with. Eyeball the hero
there, then ship.

**`audit`** reads the route table straight out of `src/main.js`, harvests every
`href` written anywhere in `src/`, resolves template-literal hrefs by shape, and
proves each one lands on a declared route. Dynamic segments are checked against
the inventory, so a link to a renamed collection fails the build. It also
enforces data integrity — status vs. stock consistency, three-colour palettes,
https-only outbound links, garments that have a silhouette to draw.

**`smoke`** renders all 56 views in Node against a DOM shim and fails on throws,
empty output, unresolved `${...}`, or `undefined` / `NaN` / `[object Object]`
leaking into markup. It also asserts every page offers a way back out.

**`integration`** exercises the marketplace mapping against fixtures — no
credentials, no network — so it keeps working before the eBay keys land and
before Depop approves the partnership. It covers catalogue-number parsing,
garment/colour inference, the enrichment join, sold-state propagation, the merge
lifecycle, id uniqueness, and eBay's structured error format.

**`layout`** drives headless Edge over the DevTools Protocol across 14 routes ×
3 widths, evaluating an overflow probe in the live page.

> `?diag=1` on any URL is a standing layout diagnostic — it names overflowing
> elements in the page title. It is what found (and then disproved) the
> suspected mobile overflow: headless Edge clamps its layout viewport to ~477px,
> so narrow screenshots were cropping a wider layout rather than showing a bug.
> The layout check no longer depends on it: `--dump-dom` stopped emitting output
> in this environment, so the check now talks to the browser directly, which
> measures the real layout rather than a string the page wrote about itself.

## Marketplace integration

```
eBay Browse API ─┐
                 ├─→ server/  ─→  /api/inventory  ─→  src/data/store.js  ─→  pages
Depop Selling ───┘   normalise      (cached)           (falls back to
                     + merge                            the catalogue)
```

**Why a server exists.** eBay's client secret and Depop's API key cannot ship in
a browser bundle — Depop's terms require credentials encrypted at rest and in
transit, and an exposed eBay secret would let anyone spend our call quota. The
server also keeps us inside rate limits (one cached fetch serves every visitor)
and keeps the shop up when a marketplace is down: a failed refresh serves the
last good payload rather than an empty page.

**The join.** A listing carries a title, a price and photographs — not which
championship it belongs to, its colourway, or its flat measurements. That's
editorial, so listings are matched to the archive by a catalogue number carried
in the eBay SKU / Depop listing (`TA-DS-01`). Matched listings inherit the full
archive record and contribute live price and availability. Unmatched ones still
appear, under **Basic Stock**, with garment and colourway inferred from the
title — degrading honestly rather than dropping stock.

**The lifecycle**, as implemented:

1. A drop is listed on the site only, ahead of and during the event.
2. After the event it goes up on eBay and Depop.
3. The marketplace becomes the source of truth for price and availability; the
   site keeps the history and the styling. A syndicated piece *replaces* its
   site-only record rather than appearing twice.

**Checkout.** We run no checkout of our own for marketplace stock. A syndicated
piece shows an eBay/Depop badge, says *"checkout completes on eBay"* under the
price, and its primary button links out to the listing. That's both the intended
commerce model and the strongest answer to Depop's rule against diverting sales:
we send them traffic rather than intercept it. Site-only drop pieces still use
the prototype "Reserve" button, which takes no payment.

**Endpoints** — `GET /api/health` (channel readiness, `?probe=1` to make a real
credential call), `GET /api/inventory` (merged stock), `POST /api/sync` (force a
refresh).

**Demo mode.** `MOCK_CHANNELS=1` in `.env` feeds fixture listings through the
real mapping and merge path, so the syndicated experience can be shown before any
credentials exist. It's on right now — remove that line from `.env` to go back to
the pure catalogue. `/api/health` and the server banner both flag when it's on.

| File | Role |
| --- | --- |
| `server/config.mjs` | env loading; the only place secrets live |
| `server/channels/ebay.mjs` | OAuth + Browse + eBay's error/retry conventions |
| `server/channels/depop.mjs` | Depop adapter — **field shapes unverified**, pending the spec |
| `server/normalize.mjs` | listing → archive item, enrichment join, merge |
| `server/enrichment.json` | catalogue no → archive metadata for un-catalogued stock |
| `src/data/store.js` | frontend inventory source, with catalogue fallback |

## Structure

```
src/
  data/collections.js     ← all research + inventory. The single source of truth.
  components/
    garment.js            ← every product image, drawn as vector flat-lays
    ui.js                 ← cards, tiles, breadcrumbs, section heads
    chrome.js             ← header, collections drawer, footer
  lib/
    router.js             ← History-API router; intercepts all internal links
    motion.js             ← the motion system (see below)
  pages/                  ← one module per route
scripts/                  ← audit / smoke / layout
```

### Product imagery

There are no photographs. Every garment is generated in
[`garment.js`](src/components/garment.js) as an SVG flat-lay: a silhouette per
garment type, tinted with the item's three-colour way, textured with a pattern
inferred from its name (argyle, cable, mesh, stripe, tweed, twill, knit), and
crested where the piece is a crested one. Deterministic — the same item always
draws identically. Swapping in real photography later means replacing one
function, not re-cutting the layouts.

### Motion

Two libraries, split by job:

- **motion.dev** — scroll-linked work (progress rail, hero parallax, `inView`
  reveals, grid stagger) and interaction springs (cursor, magnetic buttons,
  drawer clip-path).
- **anime.js v4** — sequenced choreography (hero line-mask lift, SVG crest
  draw-on, stat counters, accordion heights).

Everything degrades to instantly-visible under `prefers-reduced-motion`.

## Routes

| Route | Page |
| --- | --- |
| `/` | Home — hero, featured drop, collections, new arrivals, method, journal |
| `/collections` | Drop register + all collection tiles |
| `/collections/:id` | Collection: history essay, cited sources, the pieces |
| `/archive` | Full inventory, filterable by status / collection / type / era |
| `/item/:id` | Product: three views, measurements, provenance, comparables |
| `/journal`, `/journal/:id` | Editorial |
| `/method`, `/sell`, `/sizing` | House pages |
| _anything else_ | "Out of bounds" 404 |

Filter state lives in the query string, so `/archive?filter=available&collection=georgia-pines`
is linkable and the back button behaves.

## The collections

Six drops, grouped by championship. History is sourced from public records and
cited on each collection page.

| Drop | Collection | Place | Years | Status |
| --- | --- | --- | --- | --- |
| 07 | Duel in the Sun | Turnberry, Ayrshire | 1977–1986 | Live |
| 06 | The Clambake | Monterey Peninsula | 1947–1985 | Live |
| 05 | Georgia Pines | Augusta, Georgia | 1968–1992 | Low stock |
| 04 | War on the Shore | Kiawah Island | 1979–1995 | Archived |
| 03 | Desert Classic | Palm Springs | 1965–1988 | Archived |
| 08 | The Amateur Line | Walker Cup & collegiate | 1971–1993 | Opens 14 Aug |

36 pieces — 18 available, 6 opening, 12 archived.

## Notes for the team

- **The inventory is illustrative.** Pieces are representative of their era, not
  scraped listings. Every one carries a `market` link to *comparable* listings in
  the live resale market (eBay / Etsy searches), labelled as comparables rather
  than as the item itself — so nothing on the page claims to be a real listing it
  isn't.
- **Sourcing story**: Virginia thrift and estate sourcing worked on foot
  (Tidewater → Richmond → Charlottesville → Shenandoah), with global submissions
  appraised and bought outright. Told on `/method`, `/sell`, the home method
  section, and the "Sourcing in Virginia" journal entry.
- **The crest** is drawn in [`garment.js`](src/components/garment.js) —
  a racing-green shield, brass hairline border, and a bespoke serif T set as a
  vector outline rather than a typeface, so it holds its proportions at any
  size. The favicon reuses the same geometry.
- **Renaming the brand** is one line: `BRAND` at the top of
  [`src/data/collections.js`](src/data/collections.js).
- **Adding a collection or piece** means editing that same file. `audit` will
  tell you immediately if the status contradicts the stock, the palette is the
  wrong length, or a garment type has no silhouette.
- Forms (reserve, notify, sell, newsletter) are prototype-only — they fire a
  toast and transmit nothing.
