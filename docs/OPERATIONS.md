# Operations — cost, infrastructure, and the fully-remote plan

Written 3 Aug 2026. Prices verified against current published rates.

## The number

**~$11–20/year.** That is the entire mandatory cost of keeping Tour Archive
alive: the domain. Every other component runs on free tiers that this project's
scale will not outgrow for a long time, and each has a known, cheap upgrade
path when it does.

| Component | Provider | Cost now | First paid trigger |
| --- | --- | --- | --- |
| Site hosting | GitHub Pages | $0 | ~1 GB site or ~100 GB/mo bandwidth (years away) |
| CI (builds, daily refresh) | GitHub Actions | $0 (public repo: unlimited standard minutes) | n/a at this scale |
| Code + photo storage | GitHub repo | $0 | ~1 GB Pages artifact ≈ 3–4,000 photos; a full carousel pull adds ~25–40 MB per dozen listings (≤8 frames × ~0.4 MB), and `--refresh` churn accumulates in git history |
| Database + auth + curation | Supabase Free | $0 | Pro $25/mo — only if the pause or 500 MB bites |
| Remote dev environment | GitHub Codespaces | $0 (120 core-hrs/mo per user) | Heavy use beyond free hours |
| Domain | Porkbun → Cloudflare | **~$11/yr** | — |
| Email sending (drop notices) | Resend free | $0 (3,000/mo, 100/day) | $20/mo past 3k/mo |
| **Total, year one** | | **~$11–20** | |

For comparison: a single "cheap VPS" path runs $60–120/yr and adds patching,
uptime and backup duties. This stack outsources all of that for the price of
the domain.

## Domain (~$11/yr, inside the $20 budget)

- **Register at [Porkbun](https://porkbun.com)** — .com at ~$11.08/yr all-in,
  free WHOIS privacy. After 60 days, optionally **transfer to
  [Cloudflare Registrar](https://www.cloudflare.com/products/registrar/)** for
  at-cost renewals (~$9.77–10.46/yr; Cloudflare doesn't take fresh
  registrations, only transfers). The saving is small; the honest reason to do
  it is that at-cost renewals never spring promo-pricing surprises. Note
  Verisign raises the .com wholesale to $10.97 on 1 Nov 2026 — everyone's
  renewal creeps up ~$0.70 then.
- Avoid the themed TLDs: `.golf` runs $40–60/yr and reads gimmicky against
  this brand anyway.
- Wiring it: GitHub Pages → Settings → Custom domain, plus a CNAME at the
  registrar. HTTPS is automatic and free. **The build already handles it** —
  the base path collapses from `/tour-archive/` to `/` via the same
  `configure-pages` mechanism that runs today, no code changes.

## Database: Supabase (Free tier), deliberately

The same platform as the T42 project, which is the point — one pattern, shared
team knowledge, and the schema work is a known quantity.

**Free tier is genuinely enough for this stage:** 500 MB Postgres, 1 GB file
storage, 5 GB egress, 50,000 monthly auth users, 500K edge-function
invocations ([current limits](https://uibakery.io/blog/supabase-pricing)).
Our tables — signups, submissions, curation finds — are kilobytes per row.

**The two caveats that matter, and their mitigations:**

1. **Free projects pause after 7 days without API requests.** Mitigation is
   already built: the daily 07:20 UTC GitHub Action runs a real query against
   the `curation_finds` table (a health-endpoint ping would answer from memory
   and keep nothing alive). The project never sleeps, cost $0.
2. **No automated backups on Free.** Mitigation: a weekly GitHub Action runs
   `pg_dump` and commits the dump to a private repo (or uploads as an
   artifact). Ten lines of YAML, cost $0. Data that exists in one place
   doesn't exist.

**Why not the alternatives:** Cloudflare D1/Workers is arguably cheaper at
massive scale but is a second stack to learn and holds no advantage at ours.
Neon/Turso are lovely serverless databases but bring no auth/storage bundle,
so you'd reassemble Supabase from parts. Firebase locks queries into its SDK.
Staying on plain-JSON-in-the-repo (today's manifest) remains correct for
*inventory* — it is versioned, reviewed, and CI-checked — but wrong for
*interactive team data* like signups and curation, which is exactly where
Supabase slots in.

**What goes in it (phase order):**

1. `drop_signups` — the landing-page email capture, real before 27 Aug.
2. `curation_finds` — see below.
3. `sell_submissions` — the /sell form, stored instead of mailto.
4. Later, if the site outgrows the static snapshot: an edge function serving
   `/inventory` live (the frontend already switches via `VITE_API_BASE`).

## "Nothing on my local" — the audit

What still touches your machine today, and its remote replacement:

| Local dependency today | Remote replacement | Cost |
| --- | --- | --- |
| The repo clone | Already on GitHub — any teammate clones or opens **Codespaces** (VS Code in the browser, 120 free core-hrs/mo each) | $0 |
| Desktop "Tour Archive" photo folder + ingest script | Short term: photos committed via GitHub web upload; ingest runs in CI or Codespaces. Proper fix: the curation app uploads to Supabase Storage | $0 |
| Local API server (:5181) | Dev convenience only — production runs on the static snapshot; Codespaces runs it identically when needed | $0 |
| One-off scripts (ebay-peek, ship.sh) | Run in Codespaces; `ship.sh` is redundant remotely (pushing via GitHub UI triggers the same CI) | $0 |
| Claude Code sessions on this machine | Claude Code on the web / any teammate's machine against the same repo | — |

Team access: add collaborators to the GitHub repo (free, unlimited on public
repos), enable branch protection on `main` so CI must pass before merge —
which the workflow already enforces in spirit. Each teammate gets Codespaces
free-tier hours on their own account.

## The curation tool (built 3 Aug 2026, ~$0)

> **Status: LIVE — shared Supabase room, email+password sign-in.** `/curate` + `/curate/review` shipped —
> link-drop portal, swipe-deck review (right = shortlist, left = pass), verdict
> summary. Runs on localStorage until the Supabase project is created
> (ACTIONS.md § Curation Desk, ~15 min); design record in
> docs/CURATE-DESIGN.md, cofounder instructions in docs/CURATE-GUIDE.md.

The original design sketch, for reference — one Supabase table and one
authed page in this same repo, no new hosting, no new stack:

- **Table `curation_finds`:** url, title, note, price_seen, source
  (ebay/depop/thrift/estate), suggested_collection, submitted_by, status
  (new → shortlist → bought/passed), created_at. RLS: team-only.
- **Page `/curate`:** behind Supabase magic-link auth (no passwords to
  manage). Paste a link + a note in ten seconds from a phone in a thrift
  aisle. An edge function can optionally fetch the page title/image for
  preview cards.
- **Page `/curate/review`:** the meeting view — finds grouped by week,
  filterable by status, one-tap shortlist/pass. The Tuesday meeting scrolls
  one page instead of a group chat.
- **The payoff loop:** a find marked *bought* already has its URL and source —
  one step from becoming a manifest entry when it's photographed. Curation
  feeds inventory without retyping.

Auth stays comfortably inside the 50K MAU free allowance (the team is not
50,000 people).

## Photo storage runway

Photos ship in the repo today (~250 KB each, compressed). Budget math:
GitHub Pages caps the deployed artifact at ~1 GB → roughly **3,500–4,000
photos** of runway — years of drops. When that ceiling approaches, move
originals to Supabase Storage (1 GB free) or Cloudflare R2 (10 GB free, zero
egress fees) and keep only web-sized derivatives in the repo. Decision needed
then, not now.

## What this deliberately avoids paying for

- **A VPS/server** — nothing here needs a machine that can break at 3am.
- **Netlify/Vercel paid tiers** — GitHub Pages does the job; the Netlify
  config in the repo is a spare exit, not a bill.
- **Supabase Pro ($25/mo)** — the day the pause-ping feels fragile or a table
  nears 500 MB, that's the first real infrastructure bill, and by then it
  should be revenue-justified.
- **Scraping/proxy subscriptions** — settled: the manual bridge + future
  official APIs.

## Sources

[Supabase pricing & free-tier limits](https://uibakery.io/blog/supabase-pricing) ·
[Supabase free plan pause behaviour](https://costbench.com/software/database-as-service/supabase/free-plan/) ·
[Registrar pricing comparison](https://domaindetails.com/registrars/cheapest) ·
[Cloudflare vs Porkbun renewals](https://elvisonunwa.com/vs/cloudflare-vs-porkbun-vs-namecheap) ·
[GitHub Pages usage limits](https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages) ·
[GitHub Codespaces free allowance](https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-codespaces/about-billing-for-github-codespaces)
