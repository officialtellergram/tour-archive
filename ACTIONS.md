# Where your action is needed

The integration is built and tested. It cannot go live until the items below are
done, because every one of them needs an account, a signature, or a business
decision that I can't make from here.

Ordered by what blocks the most.

---

## 1. eBay — get API credentials  ⏱ ~1 hour, self-serve

This is the one you can finish today. eBay's developer programme is self-serve.

1. Register at **developer.ebay.com** and join the eBay Developers Program (free).
2. **Application Keys** → create an application. You get two keysets:
   - **Sandbox** — issued immediately. Use this first.
   - **Production** — requires accepting the API License Agreement, and eBay
     sometimes asks for business details before releasing it.
3. Copy from the keys page into `.env`:
   - *App ID (Client ID)* → `EBAY_CLIENT_ID`
   - *Cert ID (Client Secret)* → `EBAY_CLIENT_SECRET`
4. Set `EBAY_SELLER_USERNAME` to the eBay account whose listings should appear.
5. Set `EBAY_ENABLED=true`, leave `EBAY_ENV=sandbox` to start.
6. Verify: `npm run server`, then open
   `http://localhost:5181/api/health?probe=1` — it performs a real token
   request, so a green result means the credentials genuinely work.

**Watch for:** sandbox and production keysets are not interchangeable. Standard
Browse API access is metered per day (5,000 calls on a default keyset); our
cache means the site makes roughly 96 calls/day at a 15-minute TTL regardless of
traffic, so this is not a constraint unless you drop the TTL sharply.

---

### What accounts you need, and what permissions they need

**Two different accounts, and only one of them is new.**

| Account | Do you have it? | What it needs |
| --- | --- | --- |
| **eBay developer account** (developer.ebay.com) | New — register it | Nothing beyond registration. Free. Does **not** need to be a seller account, or be connected to one. |
| **Your eBay seller account** | You already have it | **No permission changes at all.** No settings toggle, no Store subscription, no "enable API" switch. |

The seller account's only requirement is that the stock you want on the site is
**publicly listed and active** on eBay. That's it — we're reading the same data
any shopper sees, so there is nothing to grant, authorise, or link.

The two accounts don't even have to be related. The developer account is just
what issues the API keys; the seller username is a search filter.

### Linking your existing eBay shop — nothing to do

Because we're **read-only**, there is no account-linking step at all.

The read path uses an *application* token — your app's own credentials — and
filters by `filter=sellers:{username}`. It reads publicly visible listings, so
it works against the shop you already have the moment the keys land. No consent
screen, no "connect account" button, no per-seller token to store or refresh.
The developer account doesn't even have to be the same login as the seller
account. Just set `EBAY_SELLER_USERNAME`.

**The one consequence:** it sees exactly what a shopper sees — **active, public
listings only**. Not drafts, not ended or unsold items, not held-back quantity,
not order data. If a piece isn't publicly listed on eBay, it won't appear on the
site through this channel. Site-only drops are unaffected; they come from the
curated catalogue.

*(If you ever did want to publish to eBay from the site, that would need a user
token via the authorization-code grant — a one-time seller consent producing a
refresh token good for ~18 months, plus `sell.inventory` scope. Not needed for
read-only, and not built.)*

---

## 2. Depop — apply for partnership  ⏱ weeks, not self-serve  🚧 **the real blocker**

Depop's Selling API is **not open signup**. Their terms grant access as "a
limited, non-exclusive, non-transferable, non-sublicensable, revocable right,"
issued to approved partners under an executed **Order Form**. There is no
developer console you can register in.

**Accounts and permissions:** you need your existing **Depop seller shop**, plus
a **partner relationship** between Depop and the business. Unlike eBay there is
no public read path, so there's no version of this that works without their
approval. Their Schedule 1 verification — bank-account proof, ID, company
affiliation — *is* the account-vetting step; credentials are then issued scoped
to your shop. There is no setting inside your Depop account to switch on.

**You need to:**

1. Contact Depop to request Partner API access for the business.
2. Expect to supply (their Schedule 1 lists these): proof of bank account
   ownership, identity documentation, proof of company affiliation, a phone
   number, and email validation.
3. Execute the Order Form. Check what rate limits it specifies — the defaults
   are 20 rps for product create/update and 100 rps for everything else, which
   is far above anything we need, but the Order Form can override them.
4. Get the API key and shop ID into `.env`, set `DEPOP_ENABLED=true`.

**⚠ Raise this with them explicitly, before signing.** Depop's Acceptable Use
Policy prohibits *diverting sales or migrating users away from Depop* and
*mirroring Depop's look and feel*. What we're building — showing Depop stock on
our own site — sits near that line.

Being read-only helps the argument considerably: we take no orders, we replicate
none of their UI, and every syndicated piece links **out** to the Depop listing,
so we send them traffic rather than divert it. Say exactly that when you apply.
Still get it confirmed in writing — if they object to the mirroring itself, the
Depop channel comes out and eBay carries the load. Ask for read scopes only;
you don't need the write permissions their terms spend most of their length on.

Until this lands, the Depop channel stays off and the site works without it.

---

## 3. Send me the OpenAPI YAML  ⏱ 1 minute

You mentioned one was open, but I couldn't find it on disk — I searched Desktop,
Downloads, Documents and the temp directories.

**Paste the full path**, or drop it at
`Desktop\claret-archive\server\depop-openapi.yaml`.

Why it matters: the eBay adapter is written against published documentation and
I'm confident in it. The **Depop adapter's field names are a documented guess** —
the terms page tells us what the API covers but not its response shapes. I've
confined every assumption to one function (`mapDepopProduct` in
`server/normalize.mjs`) and the paths in `server/channels/depop.mjs`, so
correcting them against the real spec is a small job. But until then, treat that
adapter as unverified.

---

## 4. Decide the catalogue-number convention  ⏱ 15 min, then ongoing discipline

**This is the decision the whole integration rests on**, and it's a merchandising
choice, not a technical one.

An eBay or Depop listing carries a title, a price and photographs. It does not
carry which championship collection a piece belongs to, its colourway, or its
flat measurements — that's our editorial judgement, and no API can supply it. So
listings are joined to the archive by a **catalogue number** carried in the
listing itself.

**The convention I've implemented:**

| Where | What to put |
| --- | --- |
| eBay | Custom SKU = `TA-DS-01` |
| Depop | `TA-DS-01` in the SKU field, or anywhere in the description |

`DS` is the collection (Duel in the Sun), `01` the piece. Parsing is deliberately
forgiving — `TA-DS-01`, `ta_ds_01`, `TA DS 01` and `TADS01` all work — because
these get typed by hand.

**What happens if you don't:** nothing breaks. Unmatched listings still appear,
under **Basic Stock**, with the garment silhouette and colourway inferred from
the title. They just lose their collection, story and measurements. That's the
honest degradation, but it's a worse shop.

**Your call:** confirm `TA-XX-NN` works for how you actually label stock, or tell
me the format you'd rather use and I'll change the parser.

---

## 5. Where the server runs, and where secrets live  ⏱ 30 min decision

The site is currently a static frontend. This integration adds a small Node
server, and that is not optional — eBay's client secret and Depop's API key
cannot ship in a browser bundle. Depop's terms explicitly require credentials
encrypted at rest and in transit; an eBay secret in frontend JavaScript would let
anyone spend our call quota.

**Decide:**
- **Host** for the API (Fly, Render, Railway, a VPS — it's one small Node process
  with no database).
- **Secret storage** — the host's environment variables, not a committed file.
- **Whether the frontend stays static.** It can: it fetches the API at runtime
  and falls back to the curated catalogue if the API is unreachable.
- Set `VITE_API_BASE` in the frontend build to the deployed API URL.

---

## 6. Confirm the drop lifecycle  ⏱ 10 min

I've implemented the flow you described:

1. A drop is listed **on the site only**, ahead of and during the event.
2. After the event it goes up on **eBay and Depop**.
3. From then on the marketplace is the source of truth for **price and
   availability**, while the site keeps the **history, styling and photography**.

So when a piece appears on eBay with a matching catalogue number, it *replaces*
its site-only record rather than appearing twice — same URL, same story, live
price, "Available on eBay" instead of "Reserve". When it sells there, it goes to
Sold on the next sync.

Step 2 stays **manual** — you list on eBay/Depop the way you already do. The
site doesn't push anything; it notices. The only discipline it asks of you is
putting the catalogue number in the SKU when you list (see §4), and the piece
moves itself from "site-only drop" to "available on eBay" on the next sync,
keeping its URL, story and photography.

**Confirm two things:**
- Should site-only drop pieces be **purchasable on our site**, or is the site a
  waiting list until the piece hits a marketplace? Right now "Reserve this piece"
  is a prototype button that fires a toast and takes no payment. Real checkout is
  a separate build (payments, tax, fulfilment) and I haven't assumed it.
- When a drop closes, does **everything** go to the marketplaces, or do you hold
  some pieces back as archive-only references?

---

## What works right now, without any of the above

```bash
npm run server     # inventory API on :5181
npm run dev        # site on :5180
npm run check:all  # audit + smoke + integration + layout
```

With both channels off, `/api/inventory` serves the 36 curated pieces and the
site behaves exactly as the mockup did. Turn on eBay and the same endpoint starts
merging live listings. Nothing about the frontend changes between those two
states — that's the point.

`GET /api/health` always tells you which channels are live and why the others
aren't.
