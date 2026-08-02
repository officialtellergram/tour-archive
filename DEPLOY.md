# Deploying the preview — GitHub Pages

The repo is committed locally, the Pages build is configured and verified, and
the GitHub CLI is installed. **Three commands remain, and they need your GitHub
login:**

```bash
cd "C:\Users\Karen Plankton\Desktop\claret-archive"

gh auth login          # opens a browser — sign into your GitHub account
gh repo create tour-archive --public --source . --push
gh api repos/{owner}/tour-archive/pages -X POST -f build_type=workflow
```

Then watch the first deploy: `gh run watch`. When it finishes, the site is at

```
https://<your-username>.github.io/tour-archive/
```

That's the link to send. (If the last command errors saying Pages already
exists, that's fine — it means GitHub enabled it automatically.)

`gh repo create … --push` publishes the code as a **public repo** — the site,
the server adapters, the research data. No secrets are in it (`.env` is
gitignored and the deploy check proves nothing leaks into the bundle), but if
you'd rather keep the code private while friends see the site, use `--private`
instead; Pages on a private repo requires GitHub Pro, so on a free account the
repo must be public.

## How this deployment works

GitHub Pages is static-only — no server, no functions. Two things make the full
experience work anyway:

**The inventory ships as a build-time snapshot.** `npm run build:pages` runs the
exact same `buildInventory` pipeline as the local server and writes the merged
result to `dist/api/inventory.json`; the site fetches that file. This is a good
fit, not a compromise: the data is read-only and every visitor was already being
served the same 15-minute cache. Freshness comes from rebuilding — the workflow
redeploys **daily at 07:20 UTC** and on every push, so stock refreshes on its
own. The eBay/Depop badges and "Buy on eBay" redirects all work.

**Deep links survive via `404.html`.** Pages has no redirect rules, but it
serves `404.html` for unknown paths — so the build writes an identical copy of
`index.html` there, and `/collections/duel-in-the-sun` loads fine on refresh.
The build also handles the `/tour-archive/` URL prefix automatically (verified
locally at that base path before this was committed).

## The workflow (`.github/workflows/deploy.yml`)

On every push to `main`, daily on schedule, or manually from the Actions tab:

1. `npm run check` — audit, smoke, integration. A broken build never deploys.
2. `npm run build:pages` — site + inventory snapshot.
3. `node scripts/deploy.mjs` — deploy-specific sanity (SPA fallback present,
   base path correct, snapshot non-empty, no secrets in the bundle).
4. Publish to Pages.

## Going live with real eBay stock later

Add these as **repository secrets** (Settings → Secrets and variables →
Actions), then delete the `MOCK_CHANNELS: '1'` line from the workflow:

```
EBAY_ENABLED=true   EBAY_ENV=production
EBAY_CLIENT_ID=…    EBAY_CLIENT_SECRET=…   EBAY_SELLER_USERNAME=…
```

The daily rebuild then snapshots your real listings. Same later for Depop once
the partnership lands. When the domain arrives, add it under Pages → Custom
domain — the base path becomes `/` and the build adjusts itself.

## Netlify

The Netlify config (`netlify.toml`, `netlify/functions/`) is still in the repo
and still works — the password screen you hit was Netlify's site-level
protection setting, not something this project set. Keeping both costs nothing;
delete them if you want one clear path.

## Before every deploy

```bash
npm run check:all              # audit + smoke + integration + layout
npm run build:pages && node scripts/deploy.mjs
```

Pushing to `main` runs the same checks in CI anyway — that's the point.
