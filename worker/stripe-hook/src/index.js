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

/**
 * eBay seller sign-in and token broker.
 *
 * The API acts as the Tour Archive eBay account, which needs the account
 * holder's one-time consent. /ebay/oauth/start sends them to eBay; eBay
 * sends them back to /ebay/oauth/callback (the "auth accepted URL" of the
 * RuName) with a code; the code is swapped for a refresh token (18 months)
 * that is kept in KV and never leaves Cloudflare. The sync job then asks
 * /ebay/token, with the shared EBAY_SYNC_SECRET, for a short-lived access
 * token (2 h, cached in KV). Secrets: EBAY_CLIENT_ID (App ID),
 * EBAY_CLIENT_SECRET (Cert ID), EBAY_RUNAME (the redirect URL name),
 * EBAY_SYNC_SECRET.
 */
const EBAY_AUTH = 'https://auth.ebay.com/oauth2/authorize';
const EBAY_TOKEN = 'https://api.ebay.com/identity/v1/oauth2/token';
const EBAY_SCOPES = [
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
  'https://api.ebay.com/oauth/api_scope/sell.account.readonly',
];
const KV_REFRESH = 'ebay:refresh';
const KV_ACCESS = 'ebay:access';

const page = (title, body, status = 200) => new Response(
  `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font:16px/1.5 Georgia,serif;max-width:40rem;margin:4rem auto;padding:0 1rem;color:#1d1b16;background:#f4f0e6"><h1 style="font-weight:400">${title}</h1>${body}</body>`,
  { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } }
);

/** HMAC of a timestamp with the sync secret: the OAuth `state`, no storage needed. */
async function stateFor(ts, env) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.EBAY_SYNC_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return `${ts}.${hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`ebay-oauth:${ts}`))).slice(0, 32)}`;
}
async function stateOk(state, env) {
  const ts = Number(String(state || '').split('.')[0]);
  if (!ts || Math.abs(Date.now() - ts) > 15 * 60 * 1000) return false;
  return sameHex(await stateFor(ts, env), String(state));
}

async function ebayTokenCall(env, params) {
  const basic = btoa(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`);
  const res = await fetch(EBAY_TOKEN, {
    method: 'POST',
    headers: { authorization: `Basic ${basic}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${json.error || ''} ${json.error_description || ''}`.trim());
  return json;
}

async function ebayOAuthStart(request, env) {
  const missing = ['EBAY_CLIENT_ID', 'EBAY_CLIENT_SECRET', 'EBAY_RUNAME', 'EBAY_SYNC_SECRET'].filter((k) => !env[k]);
  if (missing.length) return page('Not ready', `<p>Missing Worker secrets: ${missing.join(', ')}.</p>`, 500);
  const u = new URL(EBAY_AUTH);
  u.searchParams.set('client_id', env.EBAY_CLIENT_ID);
  u.searchParams.set('redirect_uri', env.EBAY_RUNAME);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', EBAY_SCOPES.join(' '));
  u.searchParams.set('state', await stateFor(Date.now(), env));
  return Response.redirect(u.toString(), 302);
}

async function ebayOAuthCallback(request, env) {
  const url = new URL(request.url);
  const state = url.searchParams.get('state');
  if (!(await stateOk(state, env))) {
    const ts = Number(String(state || '').split('.')[0]);
    const why = !state ? 'eBay sent no state value back' : !ts ? 'the state value was not one this site issued' : `the sign-in link was ${Math.round(Math.abs(Date.now() - ts) / 60000)} minutes old`;
    console.log(`ebay oauth state rejected: ${why}; params=${[...url.searchParams.keys()].join(',')}`);
    return page('Sign-in did not complete', `<p>Reason: ${why}.</p><p><a href="/ebay/oauth/start">Start the sign-in again</a> — the link is valid for fifteen minutes from when it opens.</p>`, 400);
  }
  const code = url.searchParams.get('code');
  if (!code) return page('No code', '<p>eBay sent no authorisation code. If you declined, nothing was changed.</p>', 400);
  try {
    const t = await ebayTokenCall(env, { grant_type: 'authorization_code', code, redirect_uri: env.EBAY_RUNAME });
    if (!t.refresh_token) throw new Error('no refresh token in the reply');
    await env.EBAY.put(KV_REFRESH, JSON.stringify({ token: t.refresh_token, expiresAt: Date.now() + (t.refresh_token_expires_in || 0) * 1000, since: new Date().toISOString() }));
    await env.EBAY.delete(KV_ACCESS);
    const months = Math.round((t.refresh_token_expires_in || 0) / 2592000);
    return page('eBay connected', `<p>Tour Archive can now read orders and manage listings on this eBay account.</p><p>This consent lasts about ${months} months; the site will say when it needs renewing.</p><p>You can close this tab.</p>`);
  } catch (err) {
    console.log(`ebay oauth exchange failed: ${err.message}`);
    return page('Sign-in failed', `<p>eBay refused the code exchange: ${String(err.message).replace(/</g, '&lt;')}</p>`, 502);
  }
}

/** GET /ebay/token — Authorization: Bearer <EBAY_SYNC_SECRET> → { access_token, expires_at }. */
async function ebayToken(request, env) {
  const auth = request.headers.get('authorization') || '';
  if (!env.EBAY_SYNC_SECRET || auth !== `Bearer ${env.EBAY_SYNC_SECRET}`) return text('unauthorised', 401);
  const cached = await env.EBAY.get(KV_ACCESS, 'json');
  if (cached && cached.expires_at - Date.now() > 5 * 60 * 1000) return Response.json(cached);
  const stored = await env.EBAY.get(KV_REFRESH, 'json');
  if (!stored) return text('eBay is not connected: open /ebay/oauth/start as the account holder', 409);
  try {
    const t = await ebayTokenCall(env, { grant_type: 'refresh_token', refresh_token: stored.token, scope: EBAY_SCOPES.join(' ') });
    const out = { access_token: t.access_token, expires_at: Date.now() + (t.expires_in || 7200) * 1000, refresh_expires_at: stored.expiresAt };
    await env.EBAY.put(KV_ACCESS, JSON.stringify(out), { expirationTtl: t.expires_in || 7200 });
    return Response.json(out);
  } catch (err) {
    console.log(`ebay refresh failed: ${err.message}`);
    return text(`refresh failed: ${err.message}`, 502);
  }
}

/** GET /ebay/app-token — an application token (client credentials) for the
 *  read-only catalogue APIs such as Taxonomy, which refuse a user token. */
const KV_APP = 'ebay:app';
async function ebayAppToken(request, env) {
  const auth = request.headers.get('authorization') || '';
  if (!env.EBAY_SYNC_SECRET || auth !== `Bearer ${env.EBAY_SYNC_SECRET}`) return text('unauthorised', 401);
  const cached = await env.EBAY.get(KV_APP, 'json');
  if (cached && cached.expires_at - Date.now() > 5 * 60 * 1000) return Response.json(cached);
  try {
    const t = await ebayTokenCall(env, { grant_type: 'client_credentials', scope: 'https://api.ebay.com/oauth/api_scope' });
    const out = { access_token: t.access_token, expires_at: Date.now() + (t.expires_in || 7200) * 1000 };
    await env.EBAY.put(KV_APP, JSON.stringify(out), { expirationTtl: t.expires_in || 7200 });
    return Response.json(out);
  } catch (err) {
    return text(`app token failed: ${err.message}`, 502);
  }
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === EBAY_DELETION_PATH) return ebayAccountDeletion(request, env);
    if (pathname === '/ebay/app-token') return ebayAppToken(request, env);
    if (pathname === '/ebay/oauth/start') return ebayOAuthStart(request, env);
    if (pathname === '/ebay/oauth/callback') return ebayOAuthCallback(request, env);
    if (pathname === '/ebay/token') return ebayToken(request, env);
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
