# The layers — what a sellable site needs, and where Tour Archive stands

Two checklists from the 29 September 2026 references, applied to this site.
The rule for the pass was: fluidity, usability and compliance only, no design
changes. Anything that would change a colour, a typeface or a layout is
listed under **Decisions for the owner**, not done.

Re-run the measured parts any time:

```
npm run check        # audit + smoke + integration (CI gate)
npm run ux           # the 20 UX laws, measured half
npm run a11y         # axe-core, WCAG 2.1 AA, seven routes
npm run headers      # security headers at the live origin
node scripts/live-probe.mjs   # a visitor can buy
```

## The ten layers

| Layer | State | Where |
|---|---|---|
| Front end minified, no source maps, no secrets | ✔ | Vite build; `scripts/audit.mjs` scans every tracked file for credentials; `.env*` ignored |
| Database with row-level security | ✔ | Supabase, `supabase/curation.sql` (desk) and `supabase/site_errors.sql` (beacon, insert-only for anon, 120/min trigger cap) |
| Auth with permissions | ✔ | Desk sign-in is password accounts created in the dashboard; anon reads `[]`, writes 401 |
| Version control | ✔ | git, main deploys; every push runs the gate before it builds |
| APIs | ✔ | Stripe is derived from the manifest by script (`stripe-mint`, `stripe-sold`, `stripe-drain`); the site reads one build-time snapshot, `api/inventory.json` |
| Hosting and deploy | ✔ | GitHub Pages behind Cloudflare; `deploy.mjs` sanity, reveal gate, daily rebuild |
| Security and rate limiting | ◐ | Static site, checkout on Stripe's page, desk writes auth-gated, beacon capped server-side. **Security headers are missing** — the runbook is `docs/SECURITY-HEADERS.md`, the probe is `npm run headers` |
| Caching | ✔ | Cloudflare edge (4 h on images); `?v=` busting on brand assets and hero plates; fonts now same-origin and preloaded |
| Scaling | ✔ | CDN-served static files; nothing to scale |
| Error tracking | ◐ | `src/lib/errors.js`, first-party beacon to Supabase, **dormant** until the table exists and `ERRORS_ENABLED` is true (`docs/OPERATIONS.md` § Error tracking) |

## The twenty "so your app doesn't get sued" items

| # | Item | State |
|---|---|---|
| 1 | Privacy policy | ✔ `/privacy` — now also names the error beacon's fields and that fonts never leave the site |
| 2 | Terms of service | ✔ `/terms` |
| 3 | Refund policy | ✔ in the terms: 14-day returns, who pays postage, double-sale refunds |
| 4 | Cookie policy | ✔ no cookies are set; the privacy page says so |
| 5 | Cookie consent banner | ✔ not needed — no cookies, no tracking; a banner would be friction for nothing |
| 6 | Form consents | ✔ both forms open the visitor's own mail app; nothing is stored |
| 7 | No unnecessary data | ✔ |
| 8 | Third-party SDKs audited | ✔ motion, animejs, supabase-js; Stripe by redirect; Google Fonts **removed** this pass |
| 9 | No dark patterns | ✔ |
| 10 | No hidden fees | ✔ $8 shipping on the page, in the terms, on Stripe's page |
| 11 | No fake reviews | ✔ none |
| 12 | No unsupported claims | ◐ Sell page promises "response within two working days" — keep it true or soften it (Chal) |
| 13 | Alt text | ✔ every image; verified by axe |
| 14 | Colour contrast | ✖ **decision needed** — see below |
| 15 | Keyboard navigation | ✔ this pass: focus ring on every control, drawer inert when shut, Tab wraps inside the open drawer, Escape closes |
| 16 | Business details | ✖ **needs input** — terms and privacy carry only an email; no legal name or address |
| 17 | Age consent for children's data | ✔ n/a, no accounts |
| 18 | Unsubscribe link | ✔ no mailing list exists; drop notices are a mailto |
| 19 | Fonts and images licensed | ✔ typefaces SIL OFL 1.1 (`public/fonts/OFL.txt`), photographs our own |
| 20 | Data deletion request | ✔ privacy page: write to us |

## Usability items from the "looks vibecoded" list

Only the items that are about feel, not look, were touched.

- **Fade-in on scroll** — kept, made quicker: reveals 0.85 s → 0.5 s and 26 px → 14 px, grid stagger 0.8 s → 0.5 s with the total capped so a 30-card grid finishes in ~1.2 s. Hover and open/close feedback in CSS brought under 300 ms. Everything now sits inside the 400 ms Doherty threshold in `docs/UX-LAWS.md`.
- **Buttons fade on hover** — not the case here; buttons wipe, they do not fade.
- **Cursor-following element** — the label cursor never hides the native cursor and appears only over tagged targets; left alone.
- Font pairings, gradients, palette, em dashes in copy — out of scope by instruction.

## Decisions for the owner

1. **Contrast.** `--ink-faint` (#7c7867) on `--parchment` (#f4f0e6) measures 3.89:1 on eyebrows, breadcrumbs and 8–10 px labels; WCAG AA wants 4.5:1. `npm run a11y` will stay red until the token darkens (about #6a665a passes at 4.5:1 — measure, do not guess). This is a colour change, so it was not made.
2. **Security headers.** Add the Cloudflare Transform Rule in `docs/SECURITY-HEADERS.md`, then `npm run headers` goes green.
3. **Business details.** The legal entity name and a postal address belong on `/terms` and `/privacy`. Shep has what Stripe holds.
4. **Error tracking on.** Run `supabase/site_errors.sql` in the SQL editor, then set `ERRORS_ENABLED = true` in `src/curate/config.js`.
5. **Two motion timings left as they were,** flagged by the motion pass: the header's scroll hide/show transform (0.5 s) and the drawer's own open/close choreography in `src/lib/motion.js` (0.62 s open). Both are ambient rather than click feedback; say the word and they come down too.
