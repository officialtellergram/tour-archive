# Search — why Google could not see the archive, and what to do about it

For Karen (the technical half) and Shep and Chal (the rest). The code side is
done and ships with the next deploy. The parts only the owner of the Cloudflare
and Google accounts can do are in section B, click by click.

Measured 2026-09-30 with `npm run seo:live` against the live site.

## A. What was wrong

A search engine finds a site the way a stranger does: it lands on a page, reads
what the page says it is, and follows the links. Four things stopped that here.

| What a crawler asked | What it got | Why it matters |
|---|---|---|
| `https://tourarchive.us/archive` (and every item and collection page) | **HTTP 404** with the home page's markup | GitHub Pages has no server; a deep link is served by `404.html`, and the app boots from it. A person never notices. Google reads the status before the page and treats a 404 as "this page does not exist", so nothing but the home page could be indexed. |
| `/sitemap.xml` | 404 | There was no list of the pages. Google had to guess at 44 item URLs by crawling, from a home page whose links are drawn by JavaScript. |
| The page's own description | The same title and blurb on every route | Every page told Google "Tour Archive — Vintage golf, sourced by tournament". Nothing said *this* page is a 1994 Presidents Cup cashmere sweater. No `canonical` tag said which URL is the real one, so `?probe=` and `www.` copies competed with it. |
| `http://tourarchive.us/` | **200**, a full copy of the site over plain http | Two sites with the same pages, one insecure. Google splits credit between them and prefers neither. (`www.` already redirects correctly.) |

Smaller things on the same list: the share image was the portrait lockup, which
iMessage, X and LinkedIn crop to a sliver of navy; images carried no
width/height, so the page jumps as they load, which counts against it.

**What the code does now** (across this pass; `npm run check` guards all of it):

- Every route is written to `dist/` as its own HTML file at build time, so
  `/archive`, `/collections/presidents-cup-2026` and `/item/stock-…` answer
  **200** with the real title, description, `<link rel="canonical">`, share
  tags and product schema already in the page. The app still takes over once
  it loads; a visitor sees exactly what they saw before.
- `dist/sitemap.xml` lists every public page on `https://tourarchive.us`, and
  `dist/robots.txt` points at it.
- `public/brand/og.jpg` is a 1200x630 card, the signature on navy, so a shared
  link unfurls properly. `index.html` carries it as the default; each route
  overrides with its own.
- Photos declare their dimensions.

## B. The owner steps

Nothing here changes how the site looks. Each takes a few minutes.

### 1. Cloudflare — force https

1. [dash.cloudflare.com](https://dash.cloudflare.com) → the `tourarchive.us`
   zone → left menu **SSL/TLS** → **Edge Certificates**.
2. **Always Use HTTPS** → turn **On**. (If the switch is not there, go back to
   **SSL/TLS → Overview** and make sure the encryption mode is not *Off*.)
3. On the same page, **HTTP Strict Transport Security (HSTS)** → **Change HSTS
   settings** → read and tick the acknowledgement → **Next**:
   - Enable HSTS: **On**
   - Max Age Header: **6 months**
   - Apply HSTS policy to subdomains: **On**
   - Preload: **Off** (leave it off for now; it is effectively permanent —
     revisit after a month of clean https, see `docs/SECURITY-HEADERS.md`)
   - No-Sniff Header: **Off** if the Transform Rule below sets
     `X-Content-Type-Options`; one source per header.
   - **Save**.
4. **Rules → Overview** (or **Rules → Transform Rules → Modify Response
   Header**): confirm the rule named `security headers` from
   `docs/SECURITY-HEADERS.md` exists, is enabled, and matches *All incoming
   requests*. If that rule has a `Strict-Transport-Security` row, delete the
   row — HSTS now comes from step 3, and two sources of one header drift.
   `npm run headers` will warn that the max-age is under a year while it is at
   6 months; that is expected, and raising it to 12 months later is one click.

Also worth knowing: Cloudflare shows a generic "Content Signals" `robots.txt`
on a Free-plan zone that has none of its own. Once ours deploys, Cloudflare
serves ours (and may prepend its block above it). Our `Sitemap:` line survives
either way; `npm run seo:live` checks for it.

### 2. Google Search Console

1. [search.google.com/search-console](https://search.google.com/search-console)
   → **Add property** → choose the **Domain** box (not URL prefix) → type
   `tourarchive.us` → **Continue**.
2. Google shows a TXT record beginning `google-site-verification=`. **Copy** it.
3. Cloudflare → `tourarchive.us` → **DNS → Records → Add record**:
   Type **TXT**, Name **@**, Content: paste the value, TTL **Auto** → **Save**.
4. Back in Search Console → **Verify**. If it says not found, wait five
   minutes and press Verify again; DNS takes a moment.
5. Left menu **Sitemaps** → under "Add a new sitemap" enter
   `https://tourarchive.us/sitemap.xml` → **Submit**. Status should read
   *Success* within a day.
6. Top search bar (**URL Inspection**): paste each of these, wait for the
   report, press **Request indexing**:
   - `https://tourarchive.us/`
   - `https://tourarchive.us/archive`
   - `https://tourarchive.us/collections/presidents-cup-2026`

   Google allows about ten requests a day. New pieces do not need this; the
   sitemap carries them.

### 3. Bing (also powers DuckDuckGo and Yahoo)

[bing.com/webmasters](https://www.bing.com/webmasters) → sign in → **Import
from Google Search Console** → authorise → tick `tourarchive.us` → **Import**.
It copies the property and the sitemap; nothing else to do.

### 4. What to expect

| When | What you see |
|---|---|
| Hours | `npm run seo:live` goes green. The sitemap shows *Success* with around 60 URLs (every piece, every collection, the standing pages). |
| 2-7 days | Search Console → **Pages** (under Indexing) starts listing pages under *Indexed*. `site:tourarchive.us` in Google returns more than the home page. |
| 2-6 weeks | Searches for a piece's own words ("Medinah country club knit polo") find its page. Broad terms ("vintage golf polo") stay a slow climb; that is what section D is for. |

Reading the **Pages** report: *Not indexed* is not a fault list. "Crawled —
currently not indexed" means Google saw it and is deciding; "Discovered —
currently not indexed" means it is queued. Look only for **Not found (404)**,
**Redirect error** and **Duplicate without user-selected canonical** — each
of those is something the probe should have caught, so run it. **Performance**
shows the searches that reached the site; check it monthly, not daily.

## C. The URLs

Item pages are `/item/stock-<slug>`, collections `/collections/<id>`:

```
https://tourarchive.us/item/stock-tiger-woods-presidents-cup-polo
https://tourarchive.us/collections/presidents-cup-2026
```

Already lowercase, hyphenated and descriptive, which is all Google asks. The
`stock-` prefix is the catalogue's data id (it marks a manifest item as against
a seeded one), not a word aimed at anyone.

**Leave them alone for now.** A rename buys nothing until other sites link to
the old address, and once they do, every rename needs a permanent redirect
from old to new. GitHub Pages cannot serve one — every old link would 404 and
its credit would be lost. If a cleaner URL is wanted later, the path is:

1. change the route in `src/main.js` and the ids in the sitemap;
2. Cloudflare → **Rules → Redirect Rules → Create rule**, a dynamic redirect
   with `http.request.uri.path` starting with `/item/stock-` and a target
   expression that rewrites it, status **301**;
3. redeploy and let the old URLs fall out of the index over a month.

Do it once, in one go, never piecemeal.

## D. Links — the honest version

Google ranks a one-of-one vintage shop on two things it cannot fake: pages
worth reading and other sites choosing to point at them. The collection essays
are the linkable asset; a product page rarely is. Where the links can come
from, in order of effort against reward:

| Where | How | Why it works |
|---|---|---|
| Club histories and alumni groups | A piece tied to a course (Medinah, Shinnecock, Pinehurst, Sawgrass): email the club historian or the members' newsletter with the photo and the story. Ask for nothing; offer the piece's page as a reference. | Old-domain sites with a golf topic; a link from one is worth a hundred directory entries. |
| Tournament-week local press | The week a drop opens (Presidents Cup, Tour Championship): the host city's paper and the tournament's local blogs want a sidebar. Pitch the collection essay, two photos, one quote from Chal. | Timely, topical, links to the collection page. |
| Golf podcasts and newsletters | The Fried Egg, No Laying Up's community, the smaller "golf clothing" Substacks. Send the essay, not the shop. | Their readers are the buyers; the show notes link. |
| Vintage-fashion directories and archive accounts | The curated ones (Grailed's editorial, vintage-menswear blogs, Instagram archive accounts that credit sources) accept a submission with provenance. | Fashion audience, not golf; broadens who finds the site. |
| Reddit r/golf, r/VintageMenswear, r/golfclothing | Answer questions about eras and makers for weeks before ever posting a piece; when you do, post the story with the photo and let people ask for the link. | Reddit threads rank; a spammed one is removed and remembered. |
| The cofounders' own writing | Each collection essay, and Chal's byline, exists to be quoted. Put a line in every email signature and Instagram bio pointing at the essay, not the home page. | The essay is the reason to link; nobody links to a grid. |
| Suppliers and consignors | Anyone the archive buys from, or sells for, gets a "as seen at Tour Archive" line to put on their own page, and a link back from the piece's provenance. | Reciprocal and honest, because it is true. |

Checkout is Stripe's page and never a link target; send every link to the
piece, the collection or the essay on `tourarchive.us`.

**Do not**: buy links, submit to directory farms, post the URL in comment
sections, swap links with unrelated sites, or pay for "SEO packages". Google
penalises all of them, and the penalty outlasts the link.

**Monthly, one hour**: run the two checks below; read Search Console's
Performance for the month; send two emails from the table above; post one
useful answer somewhere; note it in a dated list at the bottom of this file.

## E. Rerun the checks

```
npm run seo:live      # the live site as a crawler sees it (needs the network)
npm run check         # the CI gate: audit, render smoke, integration
npm run headers       # the Cloudflare security headers, while you are there
```

`seo:live` prints one line per question, red where the answer is wrong, and
names the section above that fixes it. Reds until the owner steps are done:
`http → https` and `Strict-Transport-Security` (section B.1). Every other line
should be green the moment the next deploy lands; if one is not, that is the
code's fault, not yours — send Karen the output.
