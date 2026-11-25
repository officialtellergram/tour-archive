/**
 * Tour Archive · sales report → Drive
 *
 * Lives in Karen's Google account as an Apps Script (script.google.com).
 * Once an hour it asks the Cloudflare Worker whether a new sales report has
 * been handed over (the GitHub job puts one there on Mondays and on the 1st)
 * and writes anything new into the "Transaction Invoices" folder (week and
 * month statements into their month's subfolder, e.g. "November Sales
 * 2026"), replacing a file of the same name in place so its link and version
 * history stay.
 *
 * Setup, once:
 *   1. script.google.com → New project → paste this file over Code.gs → save.
 *   2. Project Settings (gear) → Script Properties → add
 *        REPORT_SECRET   the Worker's report secret
 *      (optional) FOLDER_ID  the folder's id, the last part of its URL in Drive;
 *                 without it the first folder called "Transaction Invoices" is used.
 *   3. Run → installTrigger. Google asks for permission once (Drive and
 *      "connect to an external service"); allow. That installs the hourly check.
 *   4. Run → syncReports once to fetch whatever is already there.
 */

var WORKER = 'https://tour-archive-stripe-hook.officialtellergram.workers.dev';
var FOLDER_NAME = 'Transaction Invoices';

function syncReports() {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty('REPORT_SECRET');
  if (!secret) throw new Error('Script property REPORT_SECRET is not set');
  var headers = { Authorization: 'Bearer ' + secret };

  var index = UrlFetchApp.fetch(WORKER + '/report', { headers: headers, muteHttpExceptions: true });
  if (index.getResponseCode() !== 200) throw new Error('Worker index: ' + index.getResponseCode() + ' ' + index.getContentText().slice(0, 120));
  var files = JSON.parse(index.getContentText()).files || [];

  var folder = targetFolder_(props);
  var seen = JSON.parse(props.getProperty('SEEN') || '{}');
  var written = [];
  files.forEach(function (f) {
    if (seen[f.name] === f.updated) return; // already filed this version
    var res = UrlFetchApp.fetch(WORKER + '/report/' + encodeURIComponent(f.name), { headers: headers, muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) { console.warn('fetch ' + f.name + ': ' + res.getResponseCode()); return; }
    var csv = res.getContentText('UTF-8');
    // the mailing list is not a finance record: it goes to its own folder;
    // a week or month statement is filed in its month's subfolder, where the
    // team keeps them ("November Sales 2026"); the all-time report stays at
    // the top of the folder
    var dest = /^mailing-list/i.test(f.name) ? listFolder_() : monthFolder_(folder, f.name);
    var existing = dest.getFilesByName(f.name);
    if (existing.hasNext()) {
      existing.next().setContent(csv); // same file, new version
    } else {
      dest.createFile(f.name, csv, 'text/csv');
    }
    seen[f.name] = f.updated;
    written.push(f.name);
  });
  props.setProperty('SEEN', JSON.stringify(seen));
  console.log(written.length ? 'filed: ' + written.join(', ') : 'nothing new (' + files.length + ' report(s) on the Worker)');
}

function targetFolder_(props) {
  var id = props.getProperty('FOLDER_ID');
  if (id) return DriveApp.getFolderById(id);
  var it = DriveApp.getFoldersByName(FOLDER_NAME);
  if (!it.hasNext()) throw new Error('No folder called "' + FOLDER_NAME + '" in this Drive; set FOLDER_ID');
  return it.next();
}

/**
 * The subfolder a statement belongs in, made on first use:
 *   sales-report-week-2026-11-16.csv → "November Sales 2026" (the Monday's month)
 *   sales-report-2026-10.csv         → "October Sales 2026"
 * Anything else (sales-report.csv, sku lists) stays in the folder itself.
 */
function monthFolder_(folder, name) {
  var m = /^sales-report-(?:week-)?(\d{4})-(\d{2})/.exec(name);
  if (!m) return folder;
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var sub = MONTHS[Number(m[2]) - 1] + ' Sales ' + m[1];
  var it = folder.getFoldersByName(sub);
  return it.hasNext() ? it.next() : folder.createFolder(sub);
}

/** Installs the hourly check (replacing any earlier one). Run once. */
function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncReports') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncReports').timeBased().everyHours(1).create();
  console.log('hourly check installed');
}

/** Forget what has been filed, so the next run rewrites every report. */
function resetSeen() {
  PropertiesService.getScriptProperties().deleteProperty('SEEN');
}

/** "Mailing List" at the top of My Drive, made on first use. */
function listFolder_() {
  var it = DriveApp.getRootFolder().getFoldersByName('Mailing List');
  return it.hasNext() ? it.next() : DriveApp.createFolder('Mailing List');
}
