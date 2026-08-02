# Deploying the preview

Everything is configured. `npm run deploy:check` passes. What's left needs your
Netlify account, so it needs you.

Two routes. Pick by whether you want the eBay/Depop stock in the preview.

---

## Route A — CLI deploy  ⏱ ~5 min  ✅ recommended

Keeps the inventory API, so the preview shows the full experience: eBay and
Depop badges, "Buy on eBay" redirects, Basic Stock. No Git repo needed.

```bash
cd "C:\Users\Karen Plankton\Desktop\claret-archive"

npm i -g netlify-cli
netlify login                 # opens a browser — this is the bit only you can do
netlify deploy --build        # draft URL, safe to check first
netlify deploy --build --prod # publishes the shareable link
```

Then, so friends see the demo stock rather than just the curated catalogue:

```bash
netlify env:set MOCK_CHANNELS 1
netlify deploy --build --prod
```

`netlify deploy` prints the URL. That's what you send.

---

## Route B — drag and drop  ⏱ ~1 min  ⚠️ no API

1. `npm run build`
2. Drag the **`dist`** folder onto <https://app.netlify.com/drop>

Fastest possible, but Netlify Drop only takes the publish folder, so the
function doesn't come with it. The site still works completely — it falls back
to the curated catalogue, all 36 pieces, every collection and page. You just
lose the eBay/Depop badges and the "Buy on eBay" buttons, because there's no API
to serve them.

Fine if you're showing the design. Not fine if you're showing the integration.

---

## What's already set up

| | |
| --- | --- |
| `netlify.toml` | build command, publish dir, functions dir, Node 22 |
| SPA fallback | `/* → /index.html 200` — without it every route except `/` 404s on refresh |
| `netlify/functions/api.mjs` | `/api/health` and `/api/inventory`, serverless |
| Asset caching | hashed bundles immutable for a year, `index.html` always revalidated |
| `src/data/store.js` | calls a **relative** `/api` in builds, `localhost:5181` only in dev |

The function imports the same `buildInventory` the local server uses, so the
preview is real evidence about production rather than a lookalike code path.

## Environment variables on Netlify

Set these in **Site configuration → Environment variables** (or `netlify env:set`).
Never commit them — `.env` is gitignored and `deploy:check` fails the build if a
secret reaches the browser bundle.

| Variable | For the preview | Later, live |
| --- | --- | --- |
| `MOCK_CHANNELS` | `1` | remove it |
| `EBAY_ENABLED` | — | `true` |
| `EBAY_ENV` | — | `production` |
| `EBAY_CLIENT_ID` | — | your App ID |
| `EBAY_CLIENT_SECRET` | — | your Cert ID |
| `EBAY_SELLER_USERNAME` | — | your eBay username |
| `DEPOP_ENABLED` / `DEPOP_API_KEY` / `DEPOP_SHOP_ID` | — | after the partnership |

## When the domain arrives

Add it under **Domain management** and point the DNS at Netlify. Nothing in the
code changes — the API is same-origin and relative, so it follows the domain
automatically. If you later move the API to its own host, set `VITE_API_BASE` at
build time and rebuild.

## Two things worth knowing

**Serverless has no persistent cache.** The disk cache degrades to in-memory: it
survives while the function is warm and refetches on a cold start. At a
15-minute TTL that's still far inside eBay's daily call allowance, and it's why
there's no `POST /api/sync` on Netlify — a cold start does the same job.

**This is a preview, not production.** The reserve/notify/sell forms take no
payment and transmit nothing, and the inventory is curated demo stock. If
friends might mistake it for a live shop, say so when you send the link.

---

## Before every deploy

```bash
npm run check:all     # audit + smoke + integration + layout
npm run deploy:check  # build, then verify the deploy config
```

`deploy:check` is the one that catches deploy-specific failures — a missing SPA
fallback, a bundle hard-coding `localhost:5181`, a secret leaking into the
frontend, or a function that doesn't load. All of those pass the other checks
and then break in production.
