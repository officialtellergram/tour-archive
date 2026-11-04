/**
 * Welcome new subscribers: one promotion code each, one email each, and the
 * mailing list filed to Drive.
 *
 *   node scripts/welcome-mail.mjs            do it
 *   node scripts/welcome-mail.mjs --dry      say what would be done
 *
 * The site's signup (footer form, first-visit offer) POSTs to the Worker,
 * which stores the subscriber and starts this job on GitHub. Here, for each
 * subscriber not yet welcomed:
 *   1. a Stripe promotion code is minted on the WELCOME10 coupon (10% off,
 *      once): unique to them, ONE redemption, first purchase only, 30 days.
 *      A code passed around is a code already spent.
 *   2. the welcome email carries the code and an unsubscribe link.
 *   3. the Worker's record is marked welcomed.
 * Then the whole list goes to the report store as mailing-list.csv, which
 * the Apps Script files into Drive like the sales reports.
 *
 * Env (or .env): REPORT_SECRET (Worker), SALE_MAIL_USER / SALE_MAIL_PASS
 * (Gmail App Password), STRIPE_SECRET_KEY with Promotion Codes: Write.
 * Never runs git. Nothing is sent without a code: a missing Stripe
 * permission is reported and the subscriber waits for the next run.
 */
import { createHmac } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sendMail } from './lib/mail.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WORKER = 'https://tour-archive-stripe-hook.officialtellergram.workers.dev';
const COUPON = 'WELCOME10';
const DAYS = 30;
const DRY = process.argv.includes('--dry');
const C = process.stdout.isTTY ? { red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', dim: '\x1b[2m', off: '\x1b[0m' } : { red: '', yellow: '', green: '', dim: '', off: '' };

const envFile = join(ROOT, '.env');
const env = {
  ...(existsSync(envFile) ? Object.fromEntries(readFileSync(envFile, 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])) : {}),
  ...Object.fromEntries(['REPORT_SECRET', 'SALE_MAIL_USER', 'SALE_MAIL_PASS', 'STRIPE_SECRET_KEY'].filter((k) => process.env[k]).map((k) => [k, process.env[k]])),
};
const say = (s) => console.log(s);
say(`\n${C.dim}── Tour Archive · welcome mail (${DRY ? 'dry' : 'live'}) ──${C.off}`);
for (const k of ['REPORT_SECRET', 'STRIPE_SECRET_KEY']) if (!env[k]) { say(`${C.red}✖ ${k} is needed${C.off}`); process.exit(1); }
const mailReady = env.SALE_MAIL_USER && env.SALE_MAIL_PASS;
if (!mailReady) say(`${C.yellow}⚠ mail is not configured (SALE_MAIL_USER, SALE_MAIL_PASS) — codes are not minted until it is${C.off}`);

const W = { Authorization: `Bearer ${env.REPORT_SECRET}` };
async function worker(method, path, body) {
  const r = await fetch(WORKER + path, { method, headers: { ...W, ...(body ? { 'content-type': body.startsWith?.('{') ? 'application/json' : 'text/csv' } : {}) }, body });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${t.slice(0, 120)}`);
  return t ? JSON.parse(t) : {};
}
const S = { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' };
async function stripe(method, path, params) {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, { method, headers: S, body: params ? new URLSearchParams(params).toString() : undefined });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || `${r.status}`);
  return j;
}

/** The unsubscribe token the Worker checks: HMAC of the address under the report secret. */
const unsubToken = (email) => createHmac('sha256', env.REPORT_SECRET).update(email.toLowerCase()).digest('hex').slice(0, 32);
const unsubLink = (email) => `${WORKER}/unsubscribe?e=${encodeURIComponent(email)}&t=${unsubToken(email)}`;

/** ARCHIVE-XXXX from an alphabet without 0/O/1/I; a clash is caught by Stripe and retried. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => `ARCHIVE-${Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('')}`;

async function mintCode(email) {
  const expires = Math.floor(Date.now() / 1000) + DAYS * 86400;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = newCode();
    try {
      const body = {
        code, max_redemptions: '1', expires_at: String(expires), active: 'true',
        'restrictions[first_time_transaction]': 'true', 'metadata[email]': email, 'metadata[ta]': 'welcome',
      };
      // Current API versions take the coupon as promotion[type]=coupon +
      // promotion[coupon]; older ones as a bare coupon parameter.
      const p = await stripe('POST', 'promotion_codes', { ...body, 'promotion[type]': 'coupon', 'promotion[coupon]': COUPON })
        .catch((err) => (/unknown parameter: promotion/i.test(err.message) ? stripe('POST', 'promotion_codes', { ...body, coupon: COUPON }) : Promise.reject(err)));
      return { code: p.code, expiresAt: new Date(expires * 1000).toISOString().slice(0, 10) };
    } catch (err) {
      if (/already exists|already been taken/i.test(err.message)) continue;
      throw err;
    }
  }
  throw new Error('could not find a free code in five tries');
}

function welcomeText(email, code, expiresAt) {
  return [
    'Welcome to the Tour Archive list.',
    '',
    `Your code: ${code}`,
    `10% off your first piece. One use, good until ${expiresAt}. At checkout choose "Add promotion code" and enter it.`,
    '',
    'Drops are announced here first. Every piece is one of one: when it is gone, it is gone.',
    '',
    'https://tourarchive.us',
    '',
    `Not you, or changed your mind? Leave the list: ${unsubLink(email)}`,
  ].join('\n');
}

// 1. who is waiting
let subscribers = [];
try { ({ subscribers = [] } = await worker('GET', '/subscribers')); } catch (err) { say(`${C.red}✖ the Worker's list could not be read — ${err.message} (is the Worker deployed with /subscribers?)${C.off}`); process.exit(1); }
const due = subscribers.filter((s) => !s.welcomed && !s.unsubscribed);
say(`${C.dim}   ${subscribers.length} on the list · ${due.length} to welcome${C.off}`);

// 2. a code and a mail each
let sent = 0;
let failed = 0;
if (due.length && mailReady) {
  try { await stripe('GET', `coupons/${COUPON}`); } catch (err) { say(`${C.red}✖ coupon ${COUPON}: ${err.message} — the Stripe key needs Coupons: Read and Promotion Codes: Write${C.off}`); process.exit(1); }
}
for (const s of due) {
  if (!mailReady) break;
  if (DRY) { say(`${C.dim}   would welcome ${s.email} (joined ${s.at.slice(0, 10)}, ${s.source})${C.off}`); continue; }
  try {
    const { code, expiresAt } = s.code ? { code: s.code, expiresAt: s.expiresAt } : await mintCode(s.email);
    if (!s.code) await worker('PUT', `/subscribers/${encodeURIComponent(s.email)}`, JSON.stringify({ code, codeAt: new Date().toISOString(), expiresAt }));
    await sendMail({ user: env.SALE_MAIL_USER, pass: env.SALE_MAIL_PASS, to: s.email, subject: 'Your 10% at Tour Archive', text: welcomeText(s.email, code, expiresAt) });
    await worker('PUT', `/subscribers/${encodeURIComponent(s.email)}`, JSON.stringify({ welcomed: new Date().toISOString() }));
    sent += 1;
    say(`${C.green}   ✔ ${s.email} — ${code}${C.off}`);
  } catch (err) {
    failed += 1;
    say(`${C.red}   ✖ ${s.email}: ${err.message}${C.off}`);
  }
}

// 3. the list, filed to Drive by the Apps Script
if (!DRY) {
  const esc = (v) => (/[",\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''));
  const rows = [['email', 'joined', 'source', 'page', 'code', 'code_expires', 'welcomed', 'unsubscribed']];
  for (const s of [...subscribers].sort((a, b) => (a.at || '').localeCompare(b.at || ''))) rows.push([s.email, (s.at || '').slice(0, 10), s.source || '', s.page || '', s.code || '', s.expiresAt || '', (s.welcomed || '').slice(0, 10), (s.unsubscribed || '').slice(0, 10)]);
  const csv = rows.map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';
  try { await worker('PUT', '/report/mailing-list.csv', csv); say(`${C.dim}   mailing-list.csv stored (${subscribers.length} rows) → Drive on the next pass${C.off}`); } catch (err) { say(`${C.yellow}   ⚠ list not stored: ${err.message}${C.off}`); }
}
say(`${C.dim}   ${sent} welcomed · ${failed} failed${C.off}`);
process.exitCode = failed ? 1 : 0;
