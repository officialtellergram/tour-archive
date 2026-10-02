/**
 * Stripe → GitHub: start the Stripe sync the moment something changes.
 *
 * GitHub's scheduler proved unreliable for this repo (one run in sixteen
 * hours on a ten-minute cron, 2 Oct 2026), so the schedule is only the
 * backstop. This Worker is the trigger: Stripe calls it when a checkout
 * completes or a price or product changes, it checks the call really is
 * Stripe's, and it dispatches .github/workflows/stripe-drift.yml, which marks
 * sold pieces, repairs drifted links and redeploys the site through the usual
 * gates. A sale or a reprice reaches the site in about three minutes.
 *
 * It holds no Stripe API key and reads no customer data: it looks only at the
 * event's type. Secrets (wrangler secret put):
 *   STRIPE_WEBHOOK_SECRET  the endpoint's signing secret (whsec_…)
 *   GITHUB_TOKEN           fine-grained token, this repo only, Actions: write
 */

const REPO = 'officialtellergram/tour-archive';
const WORKFLOW = 'stripe-drift.yml';
const TOLERANCE_S = 300; // reject a signed payload older than five minutes (replay)

/** Events that can change what the site should show. */
const RELEVANT = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'price.created',
  'price.updated',
  'price.deleted',
  'product.updated',
  'product.deleted',
]);

const text = (body, status = 200) => new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Constant-time comparison of two hex strings. */
function sameHex(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Stripe signs `${timestamp}.${rawBody}` with HMAC-SHA256 and sends
 * `Stripe-Signature: t=<timestamp>,v1=<hex>[,v1=<hex>…]`.
 */
async function verified(rawBody, header, secret) {
  if (!header || !secret) return false;
  const parts = header.split(',').map((p) => p.trim().split('='));
  const t = parts.find(([k]) => k === 't')?.[1];
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > TOLERANCE_S) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${rawBody}`)));
  return sigs.some((s) => sameHex(s, expected));
}

export default {
  async fetch(request, env) {
    if (request.method === 'GET') return text('tour archive stripe hook: ok');
    if (request.method !== 'POST') return text('method not allowed', 405);

    const raw = await request.text();
    if (!(await verified(raw, request.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET))) {
      return text('bad signature', 400);
    }

    let event;
    try {
      event = JSON.parse(raw);
    } catch {
      return text('bad json', 400);
    }
    // Live mode only: a sandbox event must never touch the real site.
    if (!event.livemode) return text('ignored: test mode');
    if (!RELEVANT.has(event.type)) return text(`ignored: ${event.type}`);

    if (!env.GITHUB_TOKEN) return text('GITHUB_TOKEN is not set', 500); // Stripe will retry

    const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.GITHUB_TOKEN}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'tour-archive-stripe-hook',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
    });
    if (!res.ok) {
      // A non-2xx makes Stripe retry with backoff for up to three days.
      console.log(`dispatch failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
      return text(`dispatch failed: ${res.status}`, 502);
    }
    console.log(`dispatched for ${event.type} (${event.id})`);
    return text(`dispatched for ${event.type}`);
  },
};
