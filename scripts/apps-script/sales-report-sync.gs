/**
 * Tour Archive · sales report → Drive
 *
 * Lives in Karen's Google account as an Apps Script (script.google.com).
 * Once an hour it asks the Cloudflare Worker whether a new sales report has
 * been handed over (the GitHub job puts one there on Mondays and on the 1st)
 * and writes anything new into the "Transaction Invoices" folder, replacing
 * a file of the same name in place so its link and version history stay.
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
    var existing = folder.getFilesByName(f.name);
    if (existing.hasNext()) {
      existing.next().setContent(csv); // same file, new version
    } else {
      folder.createFile(f.name, csv, 'text/csv');
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
