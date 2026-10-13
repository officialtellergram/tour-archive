/**
 * Tour Archive · receipts → inbox for the P&L
 *
 * Lives in Karen's Google account as its own Apps Script. Once an hour it
 * looks in Finance/Purchase Receipts for receipts it has not seen, reads
 * each one (the text in the screenshot, by Drive's OCR), and adds a row to
 * the "Receipts Inbox" spreadsheet in Finance/Spreadsheets. The inbox has
 * two tabs whose columns are exactly Shep's tables, in his order, so a row
 * (or a block of rows) pastes straight into P&L 2026.xlsx:
 *
 *   Inventory  Item # · Item Description · Category · Date Purchased · Status ·
 *              Cost · Selling Price · Selling Fees · Founder · Notes
 *              → paste from Item Description through Notes (C:K in his sheet;
 *                Item # is his formula, so leave his column B alone)
 *   Expenses   Date · Description · Category · Amount · Founder Contribution · Notes
 *              → paste all six (B:G in his sheet)
 *
 * After those columns each tab has: Receipt (link to the file), Confidence,
 * Found (every dollar amount read from the receipt), Added, Done (tick it
 * once pasted; clearDone() removes ticked rows).
 *
 * Which tab: Purchase Receipts/Inventory/<any> → Inventory; Cleaning Repair →
 * Expenses as Cleaning/Restoration; Marketing → Marketing/Advertising;
 * Tech → Tech/Equipment. Description and date come from the file name
 * ("90's Haggar Polo 8 23 26" → "90's Haggar Polo", 2026-08-23); Cost is the
 * largest dollar amount in the receipt (the transaction total; the smaller
 * overlaid figures are item splits and go in Found). Category for Inventory
 * uses the same keyword rules as Shep's formula.
 *
 * Setup, once:
 *   1. script.google.com → New project → paste this over Code.gs → save,
 *      name it "Tour Archive receipts inbox".
 *   2. Left bar, Services (+) → "Drive API" → Add (version v3). This is
 *      what reads the text out of the screenshots.
 *   3. Run → testFew. Allow the permission prompt (Drive, Sheets, Docs). That
 *      creates the inbox spreadsheet and adds the first three receipts, to
 *      check against the originals. (resetSeen, then clearDone, starts over.)
 *   4. Run → installTrigger for the hourly check, then processReceipts once
 *      to load everything already in the folders.
 *
 * Receipts the reader cannot open (HEIC from an iPhone) still get a row,
 * with Cost blank and a note to open the receipt.
 */

var ROOT_FOLDER = 'Purchase Receipts';       // under My Drive/Finance
var SHEETS_FOLDER = 'Spreadsheets';          // under My Drive/Finance
var INBOX_NAME = 'Receipts Inbox';

var INVENTORY_HEAD = ['Item #', 'Item Description', 'Category', 'Date Purchased', 'Status', 'Cost', 'Selling Price', 'Selling Fees', 'Founder', 'Notes'];
var EXPENSES_HEAD = ['Date', 'Description', 'Category', 'Amount', 'Founder Contribution', 'Notes'];
var EXTRA_HEAD = ['Receipt', 'Confidence', 'Found', 'Added', 'Done'];

// top-level folder → tab and expense category
var ROUTES = {
  'Inventory': { tab: 'Inventory' },
  'Cleaning Repair': { tab: 'Expenses', category: 'Cleaning/Restoration' },
  'Marketing': { tab: 'Expenses', category: 'Marketing/Advertising' },
  'Tech': { tab: 'Expenses', category: 'Tech/Equipment' },
};

// who owns the receipt file → the founder, as Shep spells them
var FOUNDERS = {
  'shepard.munson': 'Shepard Munson',
  'henry': 'Henry Sergent',
  'chal': 'Chal Sergent',
  'tyler': 'Tyler Paniagua',
};

// Shep's Category formula, same keywords, same order
var CATEGORY_RULES = [['q-zip', 'Q-Zip'], ['sweater', 'Sweater'], ['towel', 'Towel'], ['polo', 'Polo'], ['pullover', 'Pullover'], ['hat', 'Hat'], ['magazine', 'Magazine'], ['cards', 'Cards'], ['vest', 'Vest'], ['t-shirt', 'T-shirt'], ['pants', 'Pants'], ['shorts', 'Shorts']];

/* ── the hourly job ─────────────────────────────────────────────────── */

function processReceipts(limit) {
  var props = PropertiesService.getScriptProperties();
  var seen = JSON.parse(props.getProperty('SEEN_FILES') || '{}');
  var ss = inbox_(props);
  var root = financeChild_(ROOT_FOLDER);
  var added = 0;

  Object.keys(ROUTES).forEach(function (top) {
    var tops = root.getFoldersByName(top);
    if (!tops.hasNext()) return;
    walk_(tops.next(), function (file, path) {
      if (limit && added >= limit) return;
      if (seen[file.getId()]) return;
      var name = file.getName();
      if (name === 'desktop.ini' || name.indexOf('.') === 0) { seen[file.getId()] = 'skip'; return; }
      var row = rowFor_(file, path, ROUTES[top]);
      appendRow_(ss, ROUTES[top].tab, row);
      seen[file.getId()] = new Date().toISOString();
      added++;
      console.log(ROUTES[top].tab + ': ' + row[ROUTES[top].tab === 'Inventory' ? 1 : 1] + ' — ' + (row[ROUTES[top].tab === 'Inventory' ? 5 : 3] === '' ? 'no amount' : '$' + row[ROUTES[top].tab === 'Inventory' ? 5 : 3]));
    });
  });

  props.setProperty('SEEN_FILES', JSON.stringify(seen));
  console.log(added ? added + ' receipt(s) added to the inbox' : 'nothing new');
}

/** A trial: only the first three receipts not yet seen. Run resetSeen + clearDone to start over. */
function testFew() {
  processReceipts(3);
}

/** Every file under a folder, recursively; path is the folder names below the top. */
function walk_(folder, fn, path) {
  path = path || [];
  var files = folder.getFiles();
  while (files.hasNext()) fn(files.next(), path);
  var subs = folder.getFolders();
  while (subs.hasNext()) {
    var sub = subs.next();
    walk_(sub, fn, path.concat(sub.getName()));
  }
}

/* ── one receipt → one row ──────────────────────────────────────────── */

function rowFor_(file, path, route) {
  var folderMonth = monthFromPath(path);
  var parsed = parseName(file.getName(), folderMonth ? folderMonth.getFullYear() : null);
  var read = readAmounts_(file);
  var owner = file.getOwner() ? file.getOwner().getEmail() : '';
  var founder = founderFor(owner);
  var date = parsed.date || folderMonth || file.getDateCreated();
  var notes = [];
  if (read.error) notes.push(read.error);
  if (read.amounts.length > 1) notes.push(read.amounts.length + ' amounts on this receipt; check the split');
  if (parsed.several) notes.push('several items on one receipt; split the rows');
  if (parsed.dayUnknown) notes.push('name gives month and year only; day set to the 1st');
  if (!parsed.date) notes.push('date taken from the ' + (folderMonth ? 'folder' : 'file') + ', not the name');
  if (read.text && /pending/i.test(read.text)) notes.push('shows as pending');
  var extra = [
    file.getUrl(),
    read.error ? 'none' : read.amounts.length === 1 ? 'high' : read.amounts.length ? 'check' : 'none',
    read.amounts.length ? read.amounts.map(function (a) { return '$' + a.toFixed(2); }).join(', ') : '',
    new Date(),
    false,
  ];
  if (route.tab === 'Inventory') {
    return ['', parsed.description, categoryFor(parsed.description), date, 'In Stock', read.total === null ? '' : read.total, '', '', founder, notes.join('; ')].concat(extra);
  }
  return [date, parsed.description, route.category, read.total === null ? '' : read.total, founder, notes.join('; ')].concat(extra);
}

/**
 * "90's Haggar Polo 8 23 26" → { description: "90's Haggar Polo", date: 2026-08-23 }
 * Also "Scotty Q-zip 7 29" (no year → the folder's year), "Goodwill 8 26"
 * (month and year only → the 1st, flagged), "PM Q 7 29 26 & Slaz Polo W
 * 7 31 26" (first date wins; the rest stays in the description, flagged),
 * "Goodwill" (no date). Extensions are dropped.
 */
function parseName(name, defaultYear) {
  var base = name.replace(/\.(jpe?g|png|heic|pdf|gif|webp)$/i, '').trim();
  var year = defaultYear || new Date().getFullYear();
  var date = null;
  var dayUnknown = false;
  var m = base.match(/(?:^|\s)(\d{1,2})\s+(\d{1,2})\s+(\d{2})(?=\s|$|[,&])/); // M D YY
  if (m) {
    date = new Date(2000 + Number(m[3]), Number(m[1]) - 1, Number(m[2]));
    base = (base.slice(0, m.index) + base.slice(m.index + m[0].length)).trim();
  } else {
    m = base.match(/(?:^|\s)(\d{1,2})\s+(\d{1,2})$/); // two numbers at the end
    if (m) {
      var a = Number(m[1]);
      var b = Number(m[2]);
      if (b >= 24 && b <= 27) { // M YY: month and year, no day
        date = new Date(2000 + b, a - 1, 1);
        dayUnknown = true;
      } else if (a >= 1 && a <= 12 && b >= 1 && b <= 31) { // M D, year from the folder
        date = new Date(year, a - 1, b);
      }
      if (date) base = base.slice(0, m.index).trim();
    }
  }
  var more = /(?:^|\s)\d{1,2}\s+\d{1,2}\s+\d{2}(?=\s|$|[,&])/.test(base); // other dates still in the name
  base = base.replace(/\s*[,&]\s*$/, '').replace(/\s{2,}/g, ' ').trim();
  return { description: base, date: date, dayUnknown: dayUnknown, several: more };
}

/** A folder like "September 2026" or "July Aug 2026" → the 1st of that (first) month. */
function monthFromPath(path) {
  var months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  for (var i = 0; i < (path || []).length; i++) {
    var m = path[i].match(/([A-Za-z]{3})[A-Za-z]*.*?(\d{4})/);
    if (m && months.indexOf(m[1].toLowerCase()) >= 0) return new Date(Number(m[2]), months.indexOf(m[1].toLowerCase()), 1);
  }
  return null;
}

function categoryFor(description) {
  var d = String(description).toLowerCase();
  for (var i = 0; i < CATEGORY_RULES.length; i++) if (d.indexOf(CATEGORY_RULES[i][0]) >= 0) return CATEGORY_RULES[i][1];
  return 'Other';
}

function founderFor(email) {
  var local = String(email).toLowerCase().split('@')[0];
  for (var k in FOUNDERS) if (local.indexOf(k) === 0) return FOUNDERS[k];
  return '';
}

/**
 * The dollar amounts in a receipt, by Drive's OCR: the image is turned into
 * a Google Doc, its text read, the Doc binned. Needs the Drive API advanced
 * service (v3) switched on in the editor.
 */
function readAmounts_(file) {
  var mime = file.getMimeType();
  if (/heic|heif/i.test(mime) || /\.heic$/i.test(file.getName())) return { amounts: [], total: null, text: '', error: 'HEIC: open the receipt for the amount' };
  if (!/^image\/|pdf$/.test(mime)) return { amounts: [], total: null, text: '', error: 'not an image or PDF (' + mime + ')' };
  var text = '';
  try {
    var doc = Drive.Files.create({ name: 'ocr ' + file.getName(), mimeType: 'application/vnd.google-apps.document' }, file.getBlob(), { ocrLanguage: 'en' });
    try {
      text = DocumentApp.openById(doc.id).getBody().getText();
    } finally {
      DriveApp.getFileById(doc.id).setTrashed(true);
    }
  } catch (err) {
    return { amounts: [], total: null, text: '', error: 'could not read the receipt (' + String(err.message || err).slice(0, 80) + ')' };
  }
  return amountsIn(text);
}

/** "$11.00 … $5.50 PM polo x2" → amounts [11, 5.5], total 11 (the largest). */
function amountsIn(text) {
  var found = [];
  var re = /\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})|\d+\.\d{2})/g;
  var m;
  while ((m = re.exec(text)) !== null) found.push(Number(m[1].replace(/,/g, '')));
  var uniq = found.filter(function (v, i) { return found.indexOf(v) === i; });
  var total = uniq.length ? Math.max.apply(null, uniq) : null;
  return { amounts: uniq, total: total, text: text, error: uniq.length ? '' : 'no dollar amount found; open the receipt' };
}

/* ── the inbox spreadsheet ──────────────────────────────────────────── */

function inbox_(props) {
  var id = props.getProperty('INBOX_ID');
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) { /* recreated below */ }
  }
  var folder = financeChild_(SHEETS_FOLDER);
  var existing = folder.getFilesByName(INBOX_NAME);
  var ss;
  if (existing.hasNext()) {
    ss = SpreadsheetApp.open(existing.next());
  } else {
    ss = SpreadsheetApp.create(INBOX_NAME);
    var f = DriveApp.getFileById(ss.getId());
    folder.addFile(f);
    DriveApp.getRootFolder().removeFile(f);
  }
  tab_(ss, 'Inventory', INVENTORY_HEAD.concat(EXTRA_HEAD));
  tab_(ss, 'Expenses', EXPENSES_HEAD.concat(EXTRA_HEAD));
  var s1 = ss.getSheetByName('Sheet1');
  if (s1 && ss.getSheets().length > 2) ss.deleteSheet(s1);
  props.setProperty('INBOX_ID', ss.getId());
  return ss;
}

function tab_(ss, name, head) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.appendRow(head);
    sh.getRange(1, 1, 1, head.length).setFontWeight('bold');
    sh.setFrozenRows(1);
    var doneCol = head.indexOf('Done') + 1;
    sh.getRange(2, doneCol, 1000, 1).insertCheckboxes();
    var dateCols = [head.indexOf('Date Purchased') + 1, head.indexOf('Date') + 1, head.indexOf('Added') + 1];
    dateCols.forEach(function (c) { if (c > 0) sh.getRange(2, c, 1000, 1).setNumberFormat('yyyy-mm-dd'); });
    var money = ['Cost', 'Selling Price', 'Selling Fees', 'Amount'].map(function (h) { return head.indexOf(h) + 1; });
    money.forEach(function (c) { if (c > 0) sh.getRange(2, c, 1000, 1).setNumberFormat('0.00'); });
    sh.autoResizeColumns(1, head.length);
  }
  return sh;
}

function appendRow_(ss, tabName, row) {
  var sh = ss.getSheetByName(tabName);
  sh.appendRow(row);
  var r = sh.getLastRow();
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var link = head.indexOf('Receipt') + 1;
  if (link > 0) sh.getRange(r, link).setFormula('=HYPERLINK("' + row[link - 1] + '","open")');
}

/** My Drive/Finance/<name> */
function financeChild_(name) {
  var fin = DriveApp.getRootFolder().getFoldersByName('Finance');
  if (!fin.hasNext()) throw new Error('No "Finance" folder in My Drive');
  var it = fin.next().getFoldersByName(name);
  if (!it.hasNext()) throw new Error('No "Finance/' + name + '" folder');
  return it.next();
}

/* ── housekeeping ───────────────────────────────────────────────────── */

/** Installs the hourly check (replacing any earlier one) and creates the inbox. Run once. */
function installTrigger() {
  inbox_(PropertiesService.getScriptProperties());
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'processReceipts') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('processReceipts').timeBased().everyHours(1).create();
  console.log('hourly check installed; inbox: ' + SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('INBOX_ID')).getUrl());
}

/** Removes every row whose Done box is ticked, on both tabs. */
function clearDone() {
  var ss = inbox_(PropertiesService.getScriptProperties());
  ['Inventory', 'Expenses'].forEach(function (name) {
    var sh = ss.getSheetByName(name);
    var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    var done = head.indexOf('Done') + 1;
    var last = sh.getLastRow();
    for (var r = last; r >= 2; r--) if (sh.getRange(r, done).getValue() === true) sh.deleteRow(r);
  });
}

/** Forget which receipts were processed, so the next run adds them all again. */
function resetSeen() {
  PropertiesService.getScriptProperties().deleteProperty('SEEN_FILES');
}
