# The Curation Desk — design record

Written 3 Aug 2026. This is the task-1 feasibility/architecture record for the
cofounder curation tool: paste listing links from any device → one shared pile →
review together with a swipe deck. Decisions below were iterated until sound;
the reasoning is kept so future changes argue with the reasons, not the code.

## What it replaces

Three founders sending marketplace links into a group chat, where they scroll
away and die. The tool gives links one place to land and one ritual to be
judged in.

## Feasibility verdict

**Buildable now, $0, no new stack.** It lives in this repo as two routes on the
existing site — `/curate` (drop a find) and `/curate/review` (the deck) — so it
inherits the chrome, typography, motion system, deploy pipeline, and check
suite. Nothing hosted locally; cofounders need only a URL.

## The two modes (the load-bearing decision)

Shared data needs a backend; a backend needs a Supabase project only the
founder account can create. Blocking the tool on that setup would be wrong, so
the data layer is an **adapter with two implementations**:

- **Practice mode (default today):** finds save to `localStorage` on the
  device. Fully functional single-device demo — the swipe deck, the pile, the
  verdict — seeded with three example finds so the first visit is never empty.
  A ribbon says plainly that saves are device-only.
- **Live mode:** flips on when `src/curate/config.js` has a Supabase URL +
  anon key (the anon key is public by design; row-level security does the
  guarding). Same UI, shared table, login required.

The UI code cannot tell the modes apart — everything goes through
`src/curate/data.js`. That is enforced, not aspirational: the page modules
import nothing from Supabase.

## Auth (live mode): passwords, deliberately

Email flows (magic link, OTP code) were the first design and were **rejected on
verified facts**: Supabase's built-in mailer sends at most **2 auth emails per
hour** and — worse — **only delivers to the org's own team members**; everyone
else gets "Email address not authorized." Fixing that means custom SMTP, which
on Resend's free tier requires a DNS-verified domain we don't own yet. All of
that infrastructure to avoid a password, for four people.

**Practice mode gets its own gate:** a single shared team passphrase, checked
against a SHA-256 hash committed in `src/curate/config.js` (the phrase itself
never enters the repo; rotate with `scripts/desk-pass.mjs`). Input is trimmed
and lowercased before hashing so phone keyboards can't fumble it, and the
device stays trusted after one entry. On a static site this is honestly a
velvet rope — it keeps passers-by out of the desk UI, and since practice data
is device-local there is nothing server-side to steal. Live mode ignores it.

So: **the Technical Officer creates each account in the dashboard**
(Authentication → Users → Add user, auto-confirm) and hands the password over
in person or by text. Sign in once per device; refresh tokens never expire, so
the session effectively lasts forever. Public signups are switched off, making
"any authenticated user" and "cofounder" the same set — which is what the RLS
policies assume. Zero emails, zero rate limits, zero redirect-URL debugging.
Magic links are the right call for a public product; they are overhead for a
four-person back office. Revisit only if the team ever needs self-serve
invites.

## Data model

One table, `curation_finds` (SQL in `supabase/curation.sql`):
url · title · note · price_seen · source (inferred from hostname) ·
suggested_collection · submitted_by · status · decided_by · timestamps.

Status lifecycle: **new → shortlist | pass**, decided by swipe; a shortlisted
find can later be marked **bought** (the payoff loop: a bought find carries its
URL and source, one step from a stock-manifest entry). Undo restores `new`.

Dedupe is by normalized URL (strip tracking params, trailing slash, hash) —
pasting a link twice tells you who already dropped it instead of double-adding.

## The deck (task 1a)

Hand-rolled pointer-event drag + anime.js fly-off — no new library. Rotation
couples to horizontal drag; SHORTLIST/PASS stamps (rubber-stamp styling, racing
green / claret — archive-file vocabulary, on brand) fade in proportionally to
drag distance; release past a distance or velocity threshold commits, otherwise
the card springs back. Buttons and arrow keys mirror the gestures for desktop.
Undo re-deals the last card. The deck ends in a **verdict view**: the
shortlist with links, mark-bought buttons, and a copy-to-clipboard summary for
the group chat.

## Security notes

Pasted URLs/titles/notes are the site's first untrusted input. Everything user-
entered is HTML-escaped before rendering; URLs must parse as http(s) or they
are rejected at entry (no `javascript:` in an href). The anon key is public by
design; all real protection is RLS (`to authenticated`) and invite-only auth.

## What was considered and rejected

- **Separate app/repo** — a second deploy and a second aesthetic to maintain,
  for no capability the routes don't have.
- **Magic-link auth** — the in-app-browser trap above.
- **Realtime sync** — meeting cadence doesn't need it; refetch on focus and
  after actions is indistinguishable in practice. Revisit if two people ever
  swipe the same deck simultaneously.
- **Auto-fetching link titles/images** — cross-origin blocked in the browser;
  needs an edge function. Queued as the first live-mode upgrade, not MVP.
- **Passwords** — one more thing to forget; codes arrive where invites did.
