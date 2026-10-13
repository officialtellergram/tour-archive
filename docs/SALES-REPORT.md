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

## Without a PC: Worker clock → GitHub → Worker store → Apps Script → Drive

`.github/workflows/sales-report.yml` builds the report on GitHub. The
Cloudflare Worker's cron starts it: Mondays 13:00 UTC for the all-time
report, the 1st at 13:05 UTC for last month's statement; it can also be
started by hand (Actions → Sales report → Run workflow, with a month or
blank). A copy of each CSV stays with the run for 90 days; a failure emails
the team.

The job hands the CSV to the Worker's report store (`PUT /report/<name>`,
Bearer `REPORT_SECRET`, a narrow secret that can only read and write
reports). An Apps Script in Karen's Google account checks the store once an
hour (`GET /report`, then `GET /report/<name>`) and writes anything new into
the Transaction Invoices folder, replacing a same-named file in place so its
link and version history stay. No Google credentials or Cloud Console: the
script runs as Karen with Google's own one-click permission.

One-time setup of the script, in Karen's Google account:

1. script.google.com → New project. Paste `scripts/apps-script/sales-report-sync.gs`
   over the default `Code.gs`. Save (name it "Tour Archive sales report").
2. Project Settings (the gear) → Script Properties → Add: `REPORT_SECRET` =
   the report secret (the `REPORT_SECRET` line in the repo's `.env`).
   Optional: `FOLDER_ID` = the folder's id, the last part of its URL in
   Drive; without it the first folder called "Transaction Invoices" is used.
3. Editor → pick `installTrigger` → Run. Google asks once for Drive and
   "connect to an external service"; allow. That installs the hourly check.
4. Pick `syncReports` → Run, to collect whatever is already on the Worker.

`resetSeen` makes the next run rewrite every report; `installTrigger` again
replaces the trigger. Executions (the clock icon) shows each hourly run.

The Stripe rows need the job's restricted key (`STRIPE_DRIFT_KEY`) to read
Checkout Sessions, Payment Intents, Charges and Balance transactions; with
less, the Stripe rows fall back to the site price and the flat shipping and
the run says so.

Once this route is proven, the two Windows scheduled tasks on Karen's PC
(`scripts/sales-report-schedule.ps1 -Remove`) are no longer needed.
