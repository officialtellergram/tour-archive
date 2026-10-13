/**
 * Hand a report to the Worker's report store, for the Apps Script in the
 * team's Drive to collect.
 *
 *   node scripts/report-publish.mjs <local file> [<name>]
 *
 * PUT https://…workers.dev/report/<name> with Bearer REPORT_SECRET. The
 * Apps Script (scripts/apps-script/sales-report-sync.gs) polls the index at
 * /report once an hour and writes anything new into the Transaction
 * Invoices folder. Never runs git.
 */
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const STORE = 'https://tour-archive-stripe-hook.officialtellergram.workers.dev/report/';
const C = process.stdout.isTTY ? { red: '\x1b[31m', green: '\x1b[32m', dim: '\x1b[2m', off: '\x1b[0m' } : { red: '', green: '', dim: '', off: '' };

const [file, nameArg] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!file || !existsSync(file)) {
  console.log(`${C.red}✖ usage: node scripts/report-publish.mjs <file> [<name>]${C.off}`);
  process.exit(1);
}
const name = nameArg || basename(file);

const envFile = join(ROOT, '.env');
const env = {
  ...(existsSync(envFile) ? Object.fromEntries(readFileSync(envFile, 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])) : {}),
  ...(process.env.REPORT_SECRET ? { REPORT_SECRET: process.env.REPORT_SECRET } : {}),
};
if (!env.REPORT_SECRET) {
  console.log(`${C.red}✖ REPORT_SECRET is needed${C.off}`);
  process.exit(1);
}

const r = await fetch(STORE + encodeURIComponent(name), {
  method: 'PUT',
  headers: { authorization: `Bearer ${env.REPORT_SECRET}`, 'content-type': 'text/csv' },
  body: readFileSync(file),
});
const body = await r.text();
if (!r.ok) {
  console.log(`${C.red}✖ report store: ${r.status} ${body.slice(0, 160)}${C.off}`);
  process.exit(1);
}
const j = JSON.parse(body);
console.log(`${C.green}   ✔ ${j.name} handed to the Worker (${j.bytes} bytes, ${j.updated}); Drive picks it up within the hour${C.off}`);
