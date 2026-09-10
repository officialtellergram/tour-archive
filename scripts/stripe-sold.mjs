/**
 * Stripe sold sweep — sold-sync's successor, Stripe → manifest.
 *
 * The eBay era had to prove a sale forensically (banner text + JSON-LD,
 * through a bot wall). Here the payment processor simply tells us: a
 * completed Checkout Session with payment_status "paid" against a piece's
 * Payment Link IS the sale. No probes, no browser, no ambiguity.
 *
 * IMPORTANT: a limit-reached link stays `active: true` — the restriction
 * blocks NEW sessions; it never flips the flag. The sessions list is the
 * sold signal; this sweep then deactivates the link explicitly so the
 * public page state is deterministic (and shows its inactive_message).
 *
 * Modes:  --dry   report only
 *         (none)  write sold flags locally — no git, per the house rule
 *                 that scheduled tasks never commit
 *         --push  GUARDED commit+push, copied from sold-sync: clean tree,
 *                 pull --rebase --autostash, manifest.json alone.
 *
 * Env: STRIPE_SOLD_LOG=<file> mirrors output for a scheduled task.
 * Exit: 0 clean · 1 the API or a write failed.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MANIFEST = join(ROOT, 'public', 'stock', 'manifest.json');
const API = 'https://api.stripe.com';

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const PUSH = args.includes('--push');
const C = { red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', dim: '\x1b[2m', off: '\x1b[0m' };

const logFile = process.env.STRIPE_SOLD_LOG;
function say(line) {
  console.log(line);
  if (logFile) {
    try { appendFileSync(logFile, `${new Date().toISOString()}  ${line.replace(/\x1b\[\d+m/g, '')}\n`); } catch { /* best effort */ }
  }
}

/* ---------------- key + mode (same discipline as the mint) ---------------- */

function envKey() {
  if (process.env.STRIPE_SECRET_KEY) return process.env.STRIPE_SECRET_KEY.trim();
  const envPath = join(ROOT, '.env');
  if (!existsSync(envPath)) return '';
  for (const line of readFileSync(envPath, 'utf8').replace(/^﻿/, '').split('\n')) {
    if (line.startsWith('STRIPE_SECRET_KEY=')) return line.slice('STRIPE_SECRET_KEY='.length).replace(/\r$/, '').trim();
  }
  return '';
}
const KEY = envKey();
const MODE = KEY.startsWith('sk_test_') ? 'test' : KEY.startsWith('sk_live_') ? 'live' : null;
if (!MODE) {
  say(`${C.red}✖ STRIPE_SECRET_KEY missing or malformed${C.off}`);
  process.exit(1);
}

say(`\n${C.dim}── Tour Archive · stripe sold sweep (${MODE}${DRY ? ', dry' : ''}) ──${C.off}`);

const AUTH = 'Basic ' + Buffer.from(KEY + ':').toString('base64');
async function stripe(method, path, params) {
  const opts = { method, headers: { Authorization: AUTH } };
  if (params) {
    opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    opts.body = new URLSearchParams(params).toString();
  }
  const res = await fetch(API + path, opts);
  const body = await res.json();
  if (!res.ok) throw new Error(`${method} ${path}: ${body?.error?.message || `HTTP ${res.status}`}`);
  return body;
}

/* ---------------- 1. every completed, paid session ---------------- */

const paidByLink = new Map(); // plink id -> newest paid session
try {
  let after = '';
  for (;;) {
    const page = await stripe('GET', `/v1/checkout/sessions?status=complete&limit=100${after ? `&starting_after=${after}` : ''}`);
    for (const s of page.data) {
      if (s.payment_link && s.payment_status === 'paid' && !paidByLink.has(s.payment_link))
        paidByLink.set(s.payment_link, s);
    }
    if (!page.has_more || !page.data.length) break;
    after = page.data[page.data.length - 1].id;
  }
} catch (err) {
  say(`${C.red}✖ sessions list failed — ${err.message}${C.off}`);
  process.exit(1);
}
say(`${C.dim}   ${paidByLink.size} paid checkout(s) on record${C.off}`);

/* ---------------- 2. reconcile ---------------- */

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const sold = [];
for (const e of manifest.items) {
  if (!e._stripe?.link || e.sold || e.retired) continue;
  if (e._stripe.mode !== MODE) continue; // never judge test entries by live data or vice versa
  const session = paidByLink.get(e._stripe.link);
  if (session) {
    const when = new Date(session.created * 1000).toISOString().slice(0, 10);
    sold.push({ e, session, when });
    say(`${C.green}   ✔ ${e.id} — SOLD (session ${session.id}, ${when})${C.off}`);
  }
}
if (!sold.length) say(`${C.dim}   nothing new — every linked piece is still for sale${C.off}`);

/* ---------------- 3. write + deactivate ---------------- */

if (sold.length && !DRY) {
  for (const { e, session } of sold) {
    const target = manifest.items.find((x) => x.id === e.id);
    target.sold = true;
    target._stripe.soldSession = session.id;
  }
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  say(`${C.green}✔ wrote sold:true for ${sold.length} piece(s)${C.off}`);

  // Belt: the restriction already blocks new sessions; deactivating makes
  // the public page deterministic (it shows the link's inactive_message).
  for (const { e } of sold) {
    try {
      await stripe('POST', `/v1/payment_links/${e._stripe.link}`, { active: 'false' });
      say(`${C.dim}   deactivated ${e._stripe.link}${C.off}`);
    } catch (err) {
      say(`${C.yellow}   ⚠ could not deactivate ${e._stripe.link}: ${err.message}${C.off}`);
    }
  }
}

/* ---------------- 4. guarded push (opt-in) — sold-sync's block ---------------- */

if (PUSH && sold.length && !DRY) {
  const git = (...a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' });
  const dirty = (git('status', '--porcelain').stdout || '')
    .split('\n')
    .filter((l) => l.trim() && !l.includes('public/stock/manifest.json'));
  if (dirty.length) {
    say(`${C.yellow}⚠ push skipped — working tree has other changes (${dirty.length} path(s)); sold flags are written locally${C.off}`);
  } else {
    const pull = git('pull', '--rebase', '--autostash', '--quiet');
    if (pull.status !== 0) {
      say(`${C.red}✖ push aborted — pull --rebase failed: ${(pull.stderr || '').trim().slice(0, 200)}${C.off}`);
      process.exit(1);
    }
    git('add', 'public/stock/manifest.json');
    const names = sold.map(({ e }) => e.id.replace(/^stock-/, '')).join(', ');
    const commit = git('commit', '-q', '-m', `Sold sweep: ${names}\n\nPaid checkout sessions on the Stripe account; links deactivated.`);
    if (commit.status !== 0) {
      say(`${C.red}✖ commit failed: ${(commit.stderr || '').trim().slice(0, 200)}${C.off}`);
      process.exit(1);
    }
    const push = git('push', '--quiet');
    if (push.status !== 0) {
      say(`${C.red}✖ push rejected — commit left local for the next run: ${(push.stderr || '').trim().slice(0, 200)}${C.off}`);
      process.exit(1);
    }
    say(`${C.green}✔ pushed — the deploy will carry the sold flags live${C.off}`);
  }
}

// exitCode, never process.exit(): a hard exit races undici's keep-alive
// teardown on Windows (libuv async.c assertion) — let the loop drain.
process.exitCode = 0;
