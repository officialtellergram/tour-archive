# Receipts inbox for the P&L

Shep keeps `P&L 2026.xlsx` in `My Drive/Finance/Spreadsheets` and types
each purchase in from the receipts the team drops in
`My Drive/Finance/Purchase Receipts`. The workbook stays his and stays Excel:
its formulas, tables, array formulas and validations are untouched. What is
automated is the typing.

An Apps Script in Karen's Google account
(`scripts/apps-script/receipts-inbox.gs`) checks the receipts folders once an
hour. Each receipt it has not seen becomes one row in the **Receipts Inbox**
Google Sheet (in `Finance/Spreadsheets`), on the tab that matches Shep's
table, in his column order:

| Receipt folder | Inbox tab | Columns (his order) | He pastes |
|---|---|---|---|
| Purchase Receipts/Inventory/… | Inventory | Item # · Item Description · Category · Date Purchased · Status · Cost · Selling Price · Selling Fees · Founder · Notes | Item Description → Notes (his C:K; Item # is his formula) |
| Cleaning Repair · Marketing · Tech | Expenses | Date · Description · Category · Amount · Founder Contribution · Notes | all six (his B:G) |

After his columns, each row carries: **Receipt** (a link to the file),
**Confidence** (high = one amount read; check = several; none = unreadable),
**Found** (every dollar amount read from the receipt), **Added**, and a
**Done** box to tick once pasted. `clearDone` removes ticked rows.

How a row is filled:

- **Description and date** come from the file name, the way the team names
  them: `90's Haggar Polo 8 23 26` → "90's Haggar Polo", 23 Aug 2026. A name
  with no year takes the folder's year ("September 2026"); a name with month
  and year only is dated the 1st and says so in Notes; a name with no date
  takes the folder's month. A name holding several dates is one receipt for
  several items: one row, Notes says "split the rows".
- **Cost / Amount** is the largest dollar figure the reader finds in the
  screenshot (the transaction total; the smaller overlaid figures are item
  splits, listed in Found). The reading is Drive's own OCR of the image.
- **Category**: Inventory rows use Shep's keyword rules (q-zip, sweater,
  towel, polo, …, else Other); expense rows take the folder's category
  (Cleaning/Restoration, Marketing/Advertising, Tech/Equipment).
- **Status** is "In Stock". **Founder** is the receipt file's owner, when it
  is one of the four.
- A HEIC photo (iPhone) cannot be read: the row is added with Cost blank and
  a note to open the receipt. PDFs read fine.

Nothing is written into the P&L. Shep reads a row against the receipt link,
pastes it, ticks Done.

## Setup, once (Karen's Google account)

1. script.google.com → New project. Paste `receipts-inbox.gs` over `Code.gs`,
   save, name it "Tour Archive receipts inbox".
2. Left bar, **Services** (+) → **Drive API** → Add (version v3). This is the
   OCR.
3. Run → `testFew`. Allow the permission prompt. It creates the inbox sheet
   and adds the first three receipts; the log shows the sheet's link via
   `installTrigger`, or open it from `Finance/Spreadsheets`. Check the three
   rows against their receipts. `resetSeen` then `clearDone` starts over.
4. Run → `installTrigger` (the hourly check), then `processReceipts` to load
   everything already in the folders.

Executions (the clock icon) lists every run. The script never deletes or
moves a receipt, and never touches the .xlsx.
