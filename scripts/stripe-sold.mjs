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
 * IN PERSON (from the 25 Oct 2026 stall): a Tap to Pay charge taken in the
 * Stripe Dashboard app is just an amount — no link, no session. The sweep
 * lists card-present charges and matches each to a live piece by the
 * Description typed in the app (the piece's name), falling back to the
 * price when exactly one live piece has it. A match is marked sold the
 * same way; a charge that fits no piece, or several, is recorded as
 * unmatched for the team's notice (notify-sales.mjs) rather than guessed.
 * A matched charge refunded later reopens its piece. Ledger: manifest
 * _inPerson[chargeId]. --simulate "<description>" <amount> tries the
 * matcher offline.
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
/* Mode comes from the key prefix. Restricted keys (rk_) are accepted and
   preferred: they carry only the handful of permissions these scripts need,
   so a leaked one cannot touch payouts, bank details or account settings. */
const MODE = /^[sr]k_test_/.test(KEY) ? 'test' : /^[sr]k_live_/.test(KEY) ? 'live' : null;
const RESTRICTED = KEY.startsWith('rk_');
if (!MODE) {
  say(`${C.red}✖ STRIPE_SECRET_KEY missing or not an sk_/rk_ test/live key${C.off}`);
  process.exit(1);
}

say(`\n${C.dim}── Tour Archive · stripe sold sweep (${MODE}${RESTRICTED ? ', restricted' : ''}${DRY ? ', dry' : ''}) ──${C.off}`);

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
    // A sold piece keeps its record and offers no checkout: the public link
    // goes, the _stripe ledger (product, price, link id, session) stays.
    // integration.mjs enforces this; the first real sale (2 Oct 2026) is
    // what showed the sweep was not doing it.
    delete target.channel;
    delete target.listingUrl;
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

/* ---------------- 3b. in person: Tap to Pay charges from the Dashboard app ---------------- */

const SIM = (() => {
  const i = args.indexOf('--simulate');
  return i >= 0 ? { description: args[i + 1] || '', amount: Math.round(Number(args[i + 2] || 0) * 100) } : null;
})();
const OTHER = (() => {
  const i = args.indexOf('--other');
  return i >= 0 && args[i + 1] ? { charge: args[i + 1], name: args[i + 2] || 'not catalogued' } : null;
})();
const REMATCH = (() => { const i = args.indexOf('--rematch'); return i >= 0 ? args[i + 1] || '' : ''; })();
/** A charge shared evenly between the pieces of a bundle, in cents; the odd cents go to the first. */
const shareOf = (cents, n) => { const base = Math.floor(cents / n); return Array.from({ length: n }, (_, i) => base + (i === 0 ? cents - base * n : 0)); };
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** The live piece a card-present charge was for, or why none. */
function matchPiece(ch, live) {
  const d = norm(ch.description);
  const squash = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); // "TA_GS_01" and "tags01" are the same number
  const ds = squash(ch.description);
  if (d.length >= 4) {
    // A catalogue number matches whole or not at all: "tags107" holds
    // "tags10" but is not TA_GS_10 (25 Oct 2026, the first three-digit numbers).
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Squashing "TAGS22 TAGS23" runs the numbers together, so each typed word
    // is also compared whole: the second number was lost at the stall (25 Oct 2026).
    const words = d.split(' ');
    const wholeSku = (sku, skus) => (sku && new RegExp(`(^|[^a-z0-9])${esc(sku)}(?!\\d)`).test(d)) || (skus && (words.includes(skus) || new RegExp(`(^|[^a-z0-9])${esc(skus)}(?!\\d)`).test(ds)));
    const byNumber = (e) => { const sku = norm(e.sku); return Boolean(sku && sku.length >= 4 && wholeSku(sku, squash(e.sku))); };
    const hits = live.filter((e) => {
      const name = norm(e.name);
      const id = norm(e.id.replace(/^stock-/, ''));
      return (name && (d.includes(name) || name.includes(d))) || (id && d.includes(id)) || byNumber(e);
    });
    if (hits.length === 1) return { piece: hits[0], how: 'by description' };
    if (hits.length > 1) {
      // Two or more catalogue numbers typed on one charge are a bundle: every
      // numbered piece sold at once, the amount shared out evenly between them.
      if (hits.every(byNumber)) return { pieces: hits, how: 'by description (bundle)' };
      return { piece: null, why: `the description fits ${hits.length} pieces (${hits.map((e) => e.id).join(', ')})` };
    }
  }
  const byPrice = live.filter((e) => Math.round(Number(e.price) * 100) === ch.amount);
  if (byPrice.length === 1) return { piece: byPrice[0], how: d ? 'by price (the description named no piece)' : 'by price (no description)' };
  return { piece: null, why: byPrice.length ? `${byPrice.length} live pieces have this price and the description names none` : 'no live piece has this price and the description names none' };
}

const live = () => manifest.items.filter((e) => !e.sold && !e.retired && e._stripe?.link && e._stripe.mode === MODE);

/**
 * HELD pieces: Stripe products Henry marks with metadata held = true (or a
 * name starting "HOLD:"). They are kept off the site and eBay for a future
 * drop (the drain skips them) but can be sold at a stall, so they join the
 * matcher as candidates. A held sale archives the product in Stripe and is
 * recorded only in the _inPerson ledger — there is no catalogue entry to
 * mark. Read fresh each run; the stall sheet lists them.
 */
// Held = metadata held=true, a name starting "HOLD:", or a line in the
// description reading just "HELD" (the field Henry is already typing in).
// Metadata typed by hand may carry a stray space in the key or the value
// ("held " / "true "): 25 Oct 2026, nine pieces hid behind one.
const heldMeta = (p) => Object.entries(p.metadata || {}).some(([k, v]) => k.trim().toLowerCase() === 'held' && /^(true|yes|1)$/i.test(String(v).trim()));
const isHeld = (p) => heldMeta(p) || /^\s*\[?hold\]?\s*[:\-–]/i.test(p.name) || /(^|\n)\s*\[?held\]?\s*:?\s*(\r?\n|$)/i.test(String(p.description || ''));
const cleanName = (n) => n.replace(/^\s*\[?hold\]?\s*[:\-–]\s*/i, '').trim();
async function heldPieces() {
  const out = [];
  let after = '';
  for (;;) {
    const page = await stripe('GET', `/v1/products?active=true&limit=100&expand[]=data.default_price${after ? `&starting_after=${after}` : ''}`);
    for (const p of page.data) {
      if (!isHeld(p) || (p.livemode ? 'live' : 'test') !== MODE) continue;
      const skuText = String(p.metadata?.sku || '').match(/\bTA[_\s-]?[A-Z]{2,6}\d{0,2}[_\s-]?\d{2,3}\b/i) || String(p.description || '').match(/\bTA[_\s-]?[A-Z]{2,6}\d{0,2}[_\s-]?\d{2,3}\b/i);
      out.push({ held: true, id: `held:${p.id}`, product: p.id, name: cleanName(p.name), sku: skuText ? skuText[0].toUpperCase().replace(/[\s-]+/g, '_') : '', price: (p.default_price?.unit_amount || 0) / 100 });
    }
    if (!page.has_more || !page.data.length) break;
    after = page.data[page.data.length - 1].id;
  }
  return out;
}

if (SIM) {
  const fake = { id: 'ch_simulated', amount: SIM.amount, description: SIM.description };
  let held = [];
  try { held = await heldPieces(); } catch (err) { say(`${C.yellow}   ⚠ held pieces not read — ${err.message}${C.off}`); }
  const m = matchPiece(fake, [...live(), ...held]);
  say(m.pieces
    ? `${C.green}   ✔ simulate "${SIM.description}" $${(SIM.amount / 100).toFixed(2)} → bundle of ${m.pieces.length}: ${m.pieces.map((e) => `${e.id} $${(shareOf(SIM.amount, m.pieces.length)[m.pieces.indexOf(e)] / 100).toFixed(2)}`).join(', ')} (${m.how})${C.off}`
    : m.piece
      ? `${C.green}   ✔ simulate "${SIM.description}" $${(SIM.amount / 100).toFixed(2)} → ${m.piece.id} (${m.how})${C.off}`
      : `${C.yellow}   ⚠ simulate "${SIM.description}" $${(SIM.amount / 100).toFixed(2)} → unmatched: ${m.why}${C.off}`);
} else if (OTHER) {
  // A charge the matcher could not place that was a real sale of something not
  // in the catalogue (a print, a belt): recorded so the report carries it and
  // the team is not asked again.
  const ledger = (manifest._inPerson = manifest._inPerson || {});
  const ch = await stripe('GET', `/v1/charges/${OTHER.charge}`);
  ledger[ch.id] = { status: 'other', name: OTHER.name, amount: ch.amount / 100, description: ch.description || '', at: new Date(ch.created * 1000).toISOString(), notified: new Date().toISOString().slice(0, 10) };
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  say(`${C.green}   ✔ ${ch.id} $${(ch.amount / 100).toFixed(2)} recorded as a sale of "${OTHER.name}" (not catalogued)${C.off}`);
} else if (REMATCH) {
  // Forget what the ledger decided about a charge so the next pass reads it
  // afresh (after a matcher fix, or a corrected description in Stripe).
  const ledger = (manifest._inPerson = manifest._inPerson || {});
  const known = ledger[REMATCH];
  if (!known) { say(`${C.yellow}   ⚠ ${REMATCH} is not in the ledger${C.off}`); }
  else {
    for (const id of [known.piece, ...(known.pieces || [])].filter(Boolean)) {
      const t = manifest.items.find((x) => x.id === id);
      if (!t) continue;
      t.sold = false;
      for (const k of ['soldCharge', 'soldAt', 'soldAmount', 'soldInPerson']) delete t._stripe[k];
      delete t._saleNotified;
    }
    delete ledger[REMATCH];
    writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    say(`${C.green}   ✔ ${REMATCH} forgotten; run again to match it afresh${C.off}`);
  }
} else {
  const charges = [];
  try {
    const since = Math.floor(Date.now() / 1000) - 45 * 86400;
    let after = '';
    for (;;) {
      const page = await stripe('GET', `/v1/charges?limit=100&created[gte]=${since}${after ? `&starting_after=${after}` : ''}`);
      for (const ch of page.data) {
        if (ch.status === 'succeeded' && ch.payment_method_details?.type === 'card_present' && (ch.livemode ? 'live' : 'test') === MODE) charges.push(ch);
      }
      if (!page.has_more || !page.data.length) break;
      after = page.data[page.data.length - 1].id;
    }
  } catch (err) {
    say(`${C.yellow}   ⚠ in-person charges not read — ${err.message}${C.off}`);
  }
  const ledger = (manifest._inPerson = manifest._inPerson || {});
  let changed = 0;
  let held = [];
  if (charges.length) {
    try { held = await heldPieces(); } catch (err) { say(`${C.yellow}   ⚠ held pieces not read — ${err.message}${C.off}`); }
  }
  for (const ch of charges.sort((a, b) => a.created - b.created)) {
    const amount = `$${(ch.amount / 100).toFixed(2)}`;
    const known = ledger[ch.id];
    const refunded = ch.refunded || (ch.amount_refunded || 0) >= ch.amount;
    if (known) {
      if (known.status === 'matched-held' && refunded) {
        // A held piece refunded: back into the held pen (the product is active again in Stripe).
        say(`${C.yellow}   ↩ held "${known.name}" — in-person charge ${ch.id} refunded; ${DRY ? 'would restore' : 'restoring'} the Stripe product${C.off}`);
        if (DRY) continue;
        try { await stripe('POST', `/v1/products/${known.product}`, { active: 'true' }); } catch (err) { say(`${C.yellow}   ⚠ could not restore ${known.product}: ${err.message}${C.off}`); }
        known.status = 'refunded';
        known.refundedAt = new Date().toISOString().slice(0, 10);
        changed += 1;
        continue;
      }
      if (known.status === 'matched' && refunded) {
        // The buyer was refunded: the piece (every piece of a bundle) is for
        // sale again, as after an eBay cancellation; a bundled held piece
        // goes back into the held pen.
        const ids = known.pieces || [known.piece];
        say(`${C.yellow}   ↩ ${ids.join(' + ')} — in-person charge ${ch.id} refunded; ${DRY ? 'would reopen' : 'reopening'} the piece(s)${C.off}`);
        if (DRY) continue;
        for (const [key, row] of Object.entries(ledger)) {
          if (!key.startsWith(`${ch.id}#`) || row.status !== 'matched-held') continue;
          try { await stripe('POST', `/v1/products/${row.product}`, { active: 'true' }); } catch (err) { say(`${C.yellow}   ⚠ could not restore ${row.product}: ${err.message}${C.off}`); }
          row.status = 'refunded';
          row.refundedAt = new Date().toISOString().slice(0, 10);
        }
        for (const id of ids) {
          const target = manifest.items.find((x) => x.id === id);
          if (!target) continue;
          target.sold = false;
          delete target._stripe.soldCharge;
          delete target._stripe.soldAt;
          delete target._stripe.soldAmount;
          delete target._stripe.soldInPerson;
          delete target._saleNotified;
          try {
            const link = await stripe('POST', `/v1/payment_links/${target._stripe.link}`, { active: 'true' });
            target.channel = 'stripe';
            target.listingUrl = link.url;
          } catch (err) {
            say(`${C.yellow}   ⚠ could not reactivate ${target._stripe.link}: ${err.message}${C.off}`);
          }
        }
        known.status = 'refunded';
        known.refundedAt = new Date().toISOString().slice(0, 10);
        changed += 1;
      }
      continue;
    }
    if (refunded) { ledger[ch.id] = { status: 'refunded-before-seen', amount: ch.amount / 100, description: ch.description || '', at: new Date(ch.created * 1000).toISOString() }; changed += 1; continue; }
    const m = matchPiece(ch, [...live(), ...held]);
    if (m.piece && m.piece.held) {
      // A held piece sold early at the stall: no catalogue entry to mark, so
      // the ledger is the record and the product leaves Stripe's active list.
      say(`${C.green}   ✔ held "${m.piece.name}" — SOLD IN PERSON (${amount}, Tap to Pay, ${m.how}; ${ch.id})${C.off}`);
      if (DRY) continue;
      ledger[ch.id] = { status: 'matched-held', product: m.piece.product, name: m.piece.name, sku: m.piece.sku, listPrice: m.piece.price, how: m.how, amount: ch.amount / 100, description: ch.description || '', at: new Date(ch.created * 1000).toISOString() };
      changed += 1;
      try {
        await stripe('POST', `/v1/products/${m.piece.product}`, { active: 'false', 'metadata[ta_sold_in_person]': ch.id });
        say(`${C.dim}   archived Stripe product ${m.piece.product}${C.off}`);
      } catch (err) {
        say(`${C.yellow}   ⚠ could not archive ${m.piece.product}: ${err.message}${C.off}`);
      }
      continue;
    }
    if (m.piece || m.pieces) {
      // One piece, or a bundle of several numbered on one charge: each is
      // marked sold with its share of the amount. A held piece in a bundle
      // gets its own ledger row (keyed charge#product) so the report and the
      // notices treat it like any other held sale.
      const pieces = m.pieces || [m.piece];
      const shares = shareOf(ch.amount, pieces.length);
      say(`${C.green}   ✔ ${pieces.map((e) => e.id).join(' + ')} — SOLD IN PERSON (${amount}, Tap to Pay, ${m.how}; ${ch.id})${C.off}`);
      if (DRY) continue;
      const at = new Date(ch.created * 1000).toISOString();
      const entry = { status: 'matched', how: m.how, amount: ch.amount / 100, description: ch.description || '', at };
      if (pieces.length > 1) { entry.bundle = true; entry.pieces = []; entry.shares = {}; }
      for (const [i, target] of pieces.entries()) {
        const share = shares[i] / 100;
        if (target.held) {
          const key = pieces.length > 1 ? `${ch.id}#${target.product}` : ch.id;
          ledger[key] = { status: 'matched-held', charge: ch.id, product: target.product, name: target.name, sku: target.sku, listPrice: target.price, how: m.how, amount: share, description: ch.description || '', at };
          if (entry.pieces) { entry.pieces.push(target.id); entry.shares[target.id] = share; }
          try {
            await stripe('POST', `/v1/products/${target.product}`, { active: 'false', 'metadata[ta_sold_in_person]': ch.id });
            say(`${C.dim}   archived Stripe product ${target.product}${C.off}`);
          } catch (err) {
            say(`${C.yellow}   ⚠ could not archive ${target.product}: ${err.message}${C.off}`);
          }
          continue;
        }
        target.sold = true;
        delete target.channel;
        delete target.listingUrl;
        target._stripe.soldCharge = ch.id;
        target._stripe.soldAt = at.slice(0, 10);
        target._stripe.soldAmount = share;
        target._stripe.soldInPerson = true;
        if (!entry.piece) entry.piece = target.id;
        if (entry.pieces) { entry.pieces.push(target.id); entry.shares[target.id] = share; }
        try {
          await stripe('POST', `/v1/payment_links/${target._stripe.link}`, { active: 'false' });
          say(`${C.dim}   deactivated ${target._stripe.link}${C.off}`);
        } catch (err) {
          say(`${C.yellow}   ⚠ could not deactivate ${target._stripe.link}: ${err.message}${C.off}`);
        }
      }
      if (entry.piece || entry.pieces) { ledger[ch.id] = entry; }
      changed += 1;
    } else {
      say(`${C.yellow}   ⚠ in-person charge ${ch.id} (${amount}, "${ch.description || ''}") matches no piece — ${m.why}; the team will be asked${C.off}`);
      if (DRY) continue;
      ledger[ch.id] = { status: 'unmatched', why: m.why, amount: ch.amount / 100, description: ch.description || '', at: new Date(ch.created * 1000).toISOString() };
      changed += 1;
    }
  }
  if (charges.length) say(`${C.dim}   ${charges.length} in-person charge(s) on record · ${changed} change(s)${C.off}`);
  if (changed && !DRY) {
    writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    say(`${C.green}✔ wrote the in-person ledger${C.off}`);
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
