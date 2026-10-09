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
    const due = manifest.items.filter((e) => e.sold && !e._saleNotified && (e._stripe?.soldSession || e._ebay?.soldOrder));
    console.log(`${C.dim}   ${due.length} sale(s) not yet announced${C.off}`);
    for (const e of due) {
      const channel = e._ebay?.soldOrder ? 'eBay' : 'the site (Stripe)';
      const d = e._ebay?.soldOrder ? await ebayDetails(e._ebay.soldOrder) : await stripeDetails(e._stripe.soldSession);
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
  }
} catch (err) {
  failures += 1;
  console.log(`${C.red}✖ ${err.message}${C.off}`);
}
process.exitCode = failures ? 1 : 0;
