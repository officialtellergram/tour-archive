/**
 * Put a file in the team's Google Drive folder — from GitHub Actions, with no
 * PC involved.
 *
 *   node scripts/drive-upload.mjs <local file> [<name in Drive>]
 *
 * The Worker holds Karen's Google sign-in (/google/oauth/start, once) and
 * hands out short-lived access tokens at /google/token to callers with the
 * sync secret, exactly as it does for eBay. The file goes into the folder
 * named by DRIVE_FOLDER_ID (a repository variable; the id is the last part
 * of the folder's URL in Drive) or, failing that, the first folder called
 * "Transaction Invoices". A file of the same name already there is replaced
 * in place, so its link and version history stay.
 *
 * Needs: EBAY_SYNC_SECRET (the shared Worker secret). Never runs git.
 */
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BROKER = 'https://tour-archive-stripe-hook.officialtellergram.workers.dev/google/token';
const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const C = process.stdout.isTTY ? { red: '\x1b[31m', green: '\x1b[32m', dim: '\x1b[2m', off: '\x1b[0m' } : { red: '', green: '', dim: '', off: '' };

const [file, nameArg] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!file || !existsSync(file)) {
  console.log(`${C.red}✖ usage: node scripts/drive-upload.mjs <file> [<name in Drive>]${C.off}`);
  process.exit(1);
}
const name = nameArg || basename(file);

const envFile = join(ROOT, '.env');
const env = {
  ...(existsSync(envFile) ? Object.fromEntries(readFileSync(envFile, 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])) : {}),
  ...Object.fromEntries(['EBAY_SYNC_SECRET', 'DRIVE_FOLDER_ID'].filter((k) => process.env[k]).map((k) => [k, process.env[k]])),
};
if (!env.EBAY_SYNC_SECRET) {
  console.log(`${C.red}✖ EBAY_SYNC_SECRET is needed${C.off}`);
  process.exit(1);
}

const tok = await fetch(BROKER, { headers: { authorization: `Bearer ${env.EBAY_SYNC_SECRET}` } });
if (!tok.ok) {
  console.log(`${C.red}✖ Google token: ${tok.status} ${(await tok.text()).slice(0, 160)}${C.off}`);
  process.exit(1);
}
const { access_token: token } = await tok.json();
const H = { authorization: `Bearer ${token}` };

async function drive(method, url, body, headers = {}) {
  const r = await fetch(url, { method, headers: { ...H, ...headers }, body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${url.split('?')[0].slice(-40)}: ${r.status} ${j.error?.message || ''}`);
  return j;
}
const q = (s) => encodeURIComponent(s);

// the folder
let folderId = env.DRIVE_FOLDER_ID;
if (!folderId) {
  const found = await drive('GET', `${DRIVE}/files?q=${q("name = 'Transaction Invoices' and mimeType = 'application/vnd.google-apps.folder' and trashed = false")}&fields=files(id,name)&pageSize=2`);
  folderId = found.files?.[0]?.id;
  if (!folderId) throw new Error('no folder called "Transaction Invoices" in this Drive; set DRIVE_FOLDER_ID');
}

// replace in place, or create
const existing = await drive('GET', `${DRIVE}/files?q=${q(`name = '${name.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed = false`)}&fields=files(id,name)&pageSize=2`);
const bytes = readFileSync(file);
let out;
if (existing.files?.length) {
  out = await drive('PATCH', `${UPLOAD}/files/${existing.files[0].id}?uploadType=media&fields=id,name,webViewLink,modifiedTime`, bytes, { 'content-type': 'text/csv' });
  console.log(`${C.green}   ✔ replaced ${out.name} in Drive${C.off}`);
} else {
  const boundary = `ta${Date.now()}`;
  const meta = JSON.stringify({ name, parents: [folderId], mimeType: 'text/csv' });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\ncontent-type: text/csv\r\n\r\n`),
    bytes,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  out = await drive('POST', `${UPLOAD}/files?uploadType=multipart&fields=id,name,webViewLink,modifiedTime`, body, { 'content-type': `multipart/related; boundary=${boundary}` });
  console.log(`${C.green}   ✔ added ${out.name} to Drive${C.off}`);
}
console.log(`${C.dim}   ${out.webViewLink || out.id}${C.off}`);
