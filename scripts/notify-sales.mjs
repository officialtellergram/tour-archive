/**
 * Tell the team about every sale, from either channel, in one shape.
 *
 *   node scripts/notify-sales.mjs            report: what would be sent
 *   node scripts/notify-sales.mjs --write    send, then stamp the piece
 *   node scripts/notify-sales.mjs --test     send a test note to the recipients
 *
 * Runs in stripe-drift.yml after the Stripe sold sweep and the eBay sync have
 * marked pieces sold. A sold piece without _saleNotified gets one email —
 * piece, channel, price, buyer and address, where to ship by — to SALE_EMAILS,
 * sent from the Tour Archive Gmail with an App Password. The stamp is written
 * to the manifest so a piece is never announced twice.
 *
 * Env (or .env): SALE_MAIL_USER (the Gmail address), SALE_MAIL_PASS (its App
 * Password), SALE_EMAILS (comma-separated recipients), STRIPE_SECRET_KEY
 * (Checkout Sessions read, for the buyer's details), EBAY_SYNC_SECRET.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sendMail } from './lib/mail.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MANIFEST = join(ROOT, 'public', 'stock', 'manifest.json');
const BROKER = 'https://tour-archive-stripe-hook.officialtellergram.workers.dev/ebay/token';
const C = { red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', dim: '\x1b[2m', off: '\x1b[0m' };
const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const TEST = args.includes('--test');

const envFile = join(ROOT, '.env');
const env = {
  ...(existsSync(envFile)
    ? Object.fromEntries(readFileSync(envFile, 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
    : {}),
  ...Object.fromEntries(['SALE_MAIL_USER', 'SALE_MAIL_PASS', 'SALE_EMAILS', 'STRIPE_SECRET_KEY', 'EBAY_SYNC_SECRET'].filter((k) => process.env[k]).map((k) => [k, process.env[k]])),
};
const ready = env.SALE_MAIL_USER && env.SALE_MAIL_PASS && env.SALE_EMAILS;

const money = (n) => `$${Number(n).toFixed(2)}`;
const addr = (a) => [a?.line1 || a?.addressLine1, a?.line2 || a?.addressLine2, [a?.city, a?.state || a?.stateOrProvince, a?.postal_code || a?.postalCode].filter(Boolean).join(' '), a?.country || a?.countryCode].filter(Boolean).join('\n');

async function stripeDetails(sessionId) {
  if (!env.STRIPE_SECRET_KEY || !sessionId) return {};
  const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, { headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } });
  if (!r.ok) return {};
  const s = await r.json();
  const ship = s.collected_information?.shipping_details || s.shipping_details || {};
  return {
    buyer: ship.name || s.customer_details?.name || '',
    email: s.customer_details?.email || '',
    address: addr(ship.address),
    paid: s.amount_total != null ? money(s.amount_total / 100) : '',
    when: s.created ? new Date(s.created * 1000) : null,
    link: s.payment_intent ? `https://dashboard.stripe.com/payments/${s.payment_intent}` : 'https://dashboard.stripe.com/payments',
    shipBy: 'within 3 business days of the order (our terms)',
  };
}

/** A Tap to Pay charge taken in the Dashboard app at a stall. */
async function chargeDetails(chargeId) {
  if (!env.STRIPE_SECRET_KEY || !chargeId) return { inPerson: true };
  const r = await fetch(`https://api.stripe.com/v1/charges/${chargeId}`, { headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } });
  if (!r.ok) return { inPerson: true };
  const c = await r.json();
  const card = c.payment_method_details?.card_present || c.payment_method_details?.card || {};
  return {
    inPerson: true,
    buyer: c.billing_details?.name || '',
    email: c.receipt_email || c.billing_details?.email || '',
    address: '',
    paid: c.amount != null ? money(c.amount / 100) : '',
    card: card.brand ? `${card.brand} ending ${card.last4 || '????'}` : '',
    description: c.description || '',
    when: c.created ? new Date(c.created * 1000) : null,
    link: `https://dashboard.stripe.com/payments/${c.payment_intent || c.id}`,
  };
}

async function ebayDetails(orderId) {
  if (!env.EBAY_SYNC_SECRET || !orderId) return {};
  const tok = await (await fetch(BROKER, { headers: { authorization: `Bearer ${env.EBAY_SYNC_SECRET}` } })).json().catch(() => ({}));
  if (!tok.access_token) return {};
  const r = await fetch(`https://api.ebay.com/sell/fulfillment/v1/order/${orderId}`, { headers: { authorization: `Bearer ${tok.access_token}` } });
  if (!r.ok) return {};
  const o = await r.json();
  const to = o.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo || {};
  const shipBy = o.lineItems?.[0]?.lineItemFulfillmentInstructions?.shipByDate;
  return {
    buyer: to.fullName || o.buyer?.username || '',
    email: to.email || '',
    address: addr(to.contactAddress),
    paid: o.pricingSummary?.total?.value ? money(o.pricingSummary.total.value) : '',
    when: o.creationDate ? new Date(o.creationDate) : null,
    link: `https://www.ebay.com/sh/ord/details?orderid=${orderId}`,
    shipBy: shipBy ? `by ${new Date(shipBy).toDateString()} (eBay's ship-by date)` : 'within 3 business days',
  };
}

function compose(e, channel, d) {
  const subject = `Sold: ${e.name} — ${money(e.price)} on ${channel}`;
  if (d.inPerson) {
    const text = [
      `${e.name} has sold in person (Tap to Pay in the Stripe Dashboard app).`,
      '',
      `Paid: ${d.paid || money(e.price)}${d.paid && d.paid !== money(e.price) ? ` (list price ${money(e.price)})` : ''}${d.card ? ` · ${d.card}` : ''}`,
      `Size: ${e.size || 'see record'}${e.sku ? `   Catalogue: ${e.sku}` : ''}`,
      d.description ? `Description typed at the stall: "${d.description}"` : '',
      d.when ? `When: ${d.when.toUTCString()}` : '',
      d.buyer || d.email ? `Buyer: ${[d.buyer, d.email].filter(Boolean).join(' · ')}` : '',
      '',
      'Handed over at the stall; nothing to ship.',
      '',
      `Payment: ${d.link}`,
      `Piece: https://tourarchive.us/item/${e.id}`,
      '',
      'Sent by the Tour Archive sync. The site already shows this piece as sold and its eBay listing is ending.',
    ].filter((l) => l !== '').join('\n');
    return { subject: `Sold in person: ${e.name} — ${d.paid || money(e.price)}`, text };
  }
  const text = [
    `${e.name} has sold on ${channel}.`,
    '',
    `Price: ${money(e.price)}${d.paid ? ` (buyer paid ${d.paid} including shipping)` : ''}`,
    `Size: ${e.size || 'see record'}${e.sku ? `   Catalogue: ${e.sku}` : ''}`,
    d.when ? `When: ${d.when.toUTCString()}` : '',
    '',
    'Ship to:',
    d.buyer || '(name not on record)',
    d.address || '(address on the order page)',
    d.email ? `Buyer email: ${d.email}` : '',
    '',
    `Ship ${d.shipBy}. Tracked, and send the tracking number to the buyer.`,
    '',
    `Order: ${d.link}`,
    `Piece: https://tourarchive.us/item/${e.id}`,
    '',
    'Sent by the Tour Archive sync. The site already shows this piece as sold and its other listing is closed.',
  ].filter((l) => l !== '').join('\n');
  return { subject, text };
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const save = () => writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(`\n${C.dim}── Tour Archive · sale notices (${TEST ? 'TEST' : WRITE ? 'SEND' : 'report'}) ──${C.off}`);
if (!ready) console.log(`${C.yellow}   ⚠ mail is not configured (SALE_MAIL_USER, SALE_MAIL_PASS, SALE_EMAILS) — nothing can be sent${C.off}`);

let failures = 0;
try {
  if (TEST) {
    if (!ready) throw new Error('mail not configured');
    const rcpts = await sendMail({ user: env.SALE_MAIL_USER, pass: env.SALE_MAIL_PASS, to: env.SALE_EMAILS, subject: 'Tour Archive sale notices: test', text: 'This is a test from the Tour Archive sync. Sale notices for Stripe and eBay will arrive here.' });
    console.log(`${C.green}   ✔ test sent to ${rcpts.join(', ')}${C.off}`);
  } else {
    const due = manifest.items.filter((e) => e.sold && !e._saleNotified && (e._stripe?.soldSession || e._stripe?.soldCharge || e._ebay?.soldOrder));
    console.log(`${C.dim}   ${due.length} sale(s) not yet announced${C.off}`);
    for (const e of due) {
      const channel = e._ebay?.soldOrder ? 'eBay' : e._stripe?.soldCharge ? 'in person' : 'the site (Stripe)';
      const d = e._ebay?.soldOrder ? await ebayDetails(e._ebay.soldOrder) : e._stripe?.soldCharge ? await chargeDetails(e._stripe.soldCharge) : await stripeDetails(e._stripe.soldSession);
      const { subject, text } = compose(e, channel, d);
      if (!WRITE || !ready) {
        console.log(`${C.yellow}   · ${subject}${C.off}`);
        continue;
      }
      try {
        await sendMail({ user: env.SALE_MAIL_USER, pass: env.SALE_MAIL_PASS, to: env.SALE_EMAILS, subject, text });
        e._saleNotified = new Date().toISOString().slice(0, 10);
        save();
        console.log(`${C.green}   ✔ ${subject}${C.off}`);
      } catch (err) {
        failures += 1;
        console.log(`${C.red}   ✖ ${e.id}: ${err.message}${C.off}`);
      }
    }
    // Held pieces sold early at the stall live only in the ledger.
    const heldSold = Object.entries(manifest._inPerson || {}).filter(([, v]) => v.status === 'matched-held' && !v.notified);
    for (const [id, v] of heldSold) {
      const d = await chargeDetails(id);
      const subject = `Sold in person (held piece): ${v.name} — ${money(v.amount)}`;
      const text = [
        `${v.name} — a piece held back for a future drop — sold in person at the stall (Tap to Pay).`,
        '',
        `Paid: ${money(v.amount)}${v.listPrice && v.listPrice !== v.amount ? ` (list price ${money(v.listPrice)})` : ''}${d.card ? ` · ${d.card}` : ''}`,
        v.sku ? `Catalogue: ${v.sku}` : '',
        v.description ? `Description typed at the stall: "${v.description}"` : '',
        d.when ? `When: ${d.when.toUTCString()}` : '',
        d.buyer || d.email ? `Buyer: ${[d.buyer, d.email].filter(Boolean).join(' · ')}` : '',
        '',
        'Handed over at the stall; nothing to ship. The Stripe product has been archived so it will not be drained into the drop.',
        '',
        `Payment: ${d.link || `https://dashboard.stripe.com/payments/${id}`}`,
        `Product: https://dashboard.stripe.com/products/${v.product}`,
      ].filter((l) => l !== '').join('\n');
      if (!WRITE || !ready) { console.log(`${C.yellow}   · ${subject}${C.off}`); continue; }
      try {
        await sendMail({ user: env.SALE_MAIL_USER, pass: env.SALE_MAIL_PASS, to: env.SALE_EMAILS, subject, text });
        v.notified = new Date().toISOString().slice(0, 10);
        save();
        console.log(`${C.green}   ✔ ${subject}${C.off}`);
      } catch (err) {
        failures += 1;
        console.log(`${C.red}   ✖ ${id}: ${err.message}${C.off}`);
      }
    }
    // In-person payments the sweep could not tie to a piece: the team is
    // asked once, so the catalogue can be put right by hand.
    const open = Object.entries(manifest._inPerson || {}).filter(([, v]) => v.status === 'unmatched' && !v.notified);
    for (const [id, v] of open) {
      const subject = `In-person payment ${money(v.amount)} not matched to a piece`;
      const text = [
        `A Tap to Pay payment of ${money(v.amount)} was taken in the Stripe Dashboard app but the sync could not tell which piece it was for.`,
        '',
        `Description typed: "${v.description || '(none)'}"`,
        `Why: ${v.why}`,
        `When: ${new Date(v.at).toUTCString()}`,
        `Payment: https://dashboard.stripe.com/payments/${id}`,
        '',
        'The piece is still showing as available on the site and on eBay. Tell Karen which piece it was so it can be marked sold.',
        'Next time, type the piece\'s name (as it reads on the site) in the Description before tapping, and the sync will handle it on its own.',
      ].join('\n');
      if (!WRITE || !ready) { console.log(`${C.yellow}   · ${subject}${C.off}`); continue; }
      try {
        await sendMail({ user: env.SALE_MAIL_USER, pass: env.SALE_MAIL_PASS, to: env.SALE_EMAILS, subject, text });
        v.notified = new Date().toISOString().slice(0, 10);
        save();
        console.log(`${C.green}   ✔ ${subject}${C.off}`);
      } catch (err) {
        failures += 1;
        console.log(`${C.red}   ✖ ${id}: ${err.message}${C.off}`);
      }
    }
  }
} catch (err) {
  failures += 1;
  console.log(`${C.red}✖ ${err.message}${C.off}`);
}
process.exitCode = failures ? 1 : 0;
