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

/**
 * eBay "marketplace account deletion" notifications. eBay requires every
 * production keyset to subscribe to these or it disables the keyset. Two
 * calls arrive here:
 *   GET  ?challenge_code=…   eBay checking the endpoint is ours: answer with
 *                            SHA-256(challengeCode + verificationToken + endpointURL)
 *                            as hex, in JSON. The URL in the hash is the one
 *                            registered in the portal, character for character.
 *   POST { notification… }   a user asked eBay to delete their account. We
 *                            hold no eBay user data (orders are read live from
 *                            the API, nothing is stored), so there is nothing
 *                            to erase; eBay only needs a 200 within a few
 *                            seconds. The event is logged.
 * Secret: EBAY_VERIFICATION_TOKEN (32–80 chars, the same value entered in
 * the portal next to this URL).
 */
const EBAY_DELETION_PATH = '/ebay/account-deletion';

async function ebayAccountDeletion(request, env) {
  if (!env.EBAY_VERIFICATION_TOKEN) return text('EBAY_VERIFICATION_TOKEN is not set', 500);
  const url = new URL(request.url);
  if (request.method === 'GET') {
    const code = url.searchParams.get('challenge_code');
    if (!code) return text('missing challenge_code', 400);
    const endpoint = `${url.origin}${url.pathname}`;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code + env.EBAY_VERIFICATION_TOKEN + endpoint));
    return new Response(JSON.stringify({ challengeResponse: hex(digest) }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (request.method === 'POST') {
    let body = null;
    try {
      body = await request.json();
    } catch {
      return text('bad json', 400);
    }
    const topic = body?.metadata?.topic || 'unknown';
    const id = body?.notification?.notificationId || '-';
    console.log(`ebay notification ${topic} ${id}: acknowledged, nothing stored for eBay users`);
    return text('ok');
  }
  return text('method not allowed', 405);
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === EBAY_DELETION_PATH) return ebayAccountDeletion(request, env);
    if (pathname !== '/') return text('not found', 404);
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
