# Sales report

One CSV, both channels, one row per sold piece, the same columns for each:
channel, date, piece, site price, subtotal, shipping charged, sales tax,
order total, transaction fees, shipping label, earnings, funds status,
status, refunded, buyer, the order or payment reference, the Stripe invoice.

- eBay rows reproduce Seller Hub's "Payment" panel by API (Fulfillment
  order + Finances API, `scripts/lib/ebay-finance.mjs`).
- Stripe rows come from the paid Checkout Session and its balance
  transaction (Stripe's fee, net). No label: postage for site sales is not
  in Stripe, so that cell is blank and earnings are net of fees only.
- Sales from before the automations (the old eBay account) keep their row
  with the site price and the flat $8 shipping, the rest blank.
- An eBay order with no sold piece behind it (cancelled, then sold again)
  is appended so no record is lost.

```
npm run sales:report                  all time → sales-report.csv
npm run sales:report -- --month=2026-10        one month → sales-report-2026-10.csv,
                                               with TOTAL and CUMULATIVE lines
npm run sales:report -- --month=previous       the month just ended
npm run ebay:report                   the eBay-only cut, on the Desktop
```

Run by hand, the file lands in `G:\My Drive\Finance\Transaction Invoices`
when Drive for Desktop is mounted, else in `Desktop\Tour Archive`.

## Without a PC: the Worker's clock and GitHub

`.github/workflows/sales-report.yml` builds the report on GitHub and puts it
in the Drive folder with `scripts/drive-upload.mjs` (a file of the same name
is replaced in place, so its link stays). The Cloudflare Worker's cron starts
it: Mondays 13:00 UTC for the all-time report, the 1st at 13:05 UTC for last
month's statement. It can also be started by hand: Actions → Sales report →
Run workflow, with a month or blank. A copy of each CSV stays with the run
for 90 days, and a failure emails the team.

The upload runs as Karen's Google account, through the Worker, the same way
eBay is wired: the Worker keeps the refresh token in KV and gives the job a
short-lived access token at `/google/token`. One-time setup:

1. **Google Cloud console** (console.cloud.google.com), any project:
   *APIs & Services → Library → Google Drive API → Enable.*
2. *APIs & Services → OAuth consent screen*: External, app name "Tour
   Archive", your email as support and developer contact. Add scope
   `https://www.googleapis.com/auth/drive`. Add your own Google account as a
   test user. Then **publish the app** (Publishing status → In production;
   leave it unverified — Google shows a warning screen once, and you click
   through as the owner). While an app is still "Testing", Google expires
   the sign-in after seven days.
3. *APIs & Services → Credentials → Create credentials → OAuth client ID*:
   Web application, authorised redirect URI exactly
   `https://tour-archive-stripe-hook.officialtellergram.workers.dev/google/oauth/callback`.
   Copy the client ID and client secret.
4. In the repo: `cd worker/stripe-hook`, then
   `npx wrangler secret put GOOGLE_CLIENT_ID` and
   `npx wrangler secret put GOOGLE_CLIENT_SECRET`, pasting each.
5. Open `https://tour-archive-stripe-hook.officialtellergram.workers.dev/google/oauth/start`
   signed in as the Drive owner and allow. The page says "Google Drive
   connected".
6. Optional: set the repository variable `DRIVE_FOLDER_ID` to the folder's id
   (the last part of its URL in Drive). Without it, the job uses the first
   folder in the Drive called "Transaction Invoices".

The Stripe rows need the job's restricted key (`STRIPE_DRIFT_KEY`) to read
Checkout Sessions, Payment Intents, Charges and Balance transactions; with
less, the Stripe rows fall back to the site price and the flat shipping and
the run says so.

Once the GitHub route is proven, the two Windows scheduled tasks on Karen's
PC (`scripts/sales-report-schedule.ps1 -Remove`) are no longer needed.
