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
 *
 * The cron (wrangler.jsonc) also starts the sales report job on GitHub —
 * Mondays the all-time report, the 1st of the month last month's statement
 * — and /report/* is the hand-off: the job PUTs the CSV here, the Apps
 * Script in the team's Drive GETs it and files it (REPORT_SECRET).
 */

const REPO = 'officialtellergram/tour-archive';
const WORKFLOW = 'stripe-drift.yml';
const REPORT_WORKFLOW = 'sales-report.yml';
// Cloudflare cron runs in UTC: 13:00 UTC is 09:00 in New York (08:00 in winter).
const CRON_WEEKLY = '0 13 * * 1';
const CRON_MONTHLY = '5 13 1 * *';
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

// ── Report store: the sales report job on GitHub PUTs its CSV here; the
//    Apps Script in Karen's Drive GETs it on its own timer and writes it
//    into the Transaction Invoices folder. No Google credentials anywhere.
//    Bearer REPORT_SECRET on every call (a narrow secret: it can only read
//    and write reports, never touch eBay or Stripe).
const KV_REPORT = 'report:'; // + file name → { csv, updated }

function reportAuth(request, env) {
  const auth = request.headers.get('authorization') || '';
  return !!env.REPORT_SECRET && auth === `Bearer ${env.REPORT_SECRET}`;
}
const reportName = (pathname) => {
  const name = decodeURIComponent(pathname.slice('/report/'.length));
  return /^[a-z0-9][a-z0-9._-]{0,80}\.csv$/i.test(name) ? name : '';
};

async function reportRoute(request, env) {
  if (!reportAuth(request, env)) return text('unauthorised', 401);
  const { pathname } = new URL(request.url);
  if (pathname === '/report' || pathname === '/report/') {
    // the index: every stored report and when it was last written
    const list = await env.EBAY.list({ prefix: KV_REPORT });
    const files = [];
    for (const k of list.keys) files.push({ name: k.name.slice(KV_REPORT.length), updated: k.metadata?.updated || '' });
    return Response.json({ files });
  }
  const name = reportName(pathname);
  if (!name) return text('bad name', 400);
  if (request.method === 'PUT') {
    const csv = await request.text();
    if (!csv || csv.length > 5_000_000) return text('empty or too large', 400);
    const updated = new Date().toISOString();
    await env.EBAY.put(KV_REPORT + name, csv, { metadata: { updated } });
    console.log(`report stored: ${name} (${csv.length} bytes)`);
    return Response.json({ name, updated, bytes: csv.length });
  }
  if (request.method === 'GET') {
    const got = await env.EBAY.getWithMetadata(KV_REPORT + name);
    if (!got.value) return text('no such report', 404);
    return new Response(got.value, { headers: { 'content-type': 'text/csv; charset=utf-8', 'x-updated': got.metadata?.updated || '', 'cache-control': 'no-store' } });
  }
  return text('method not allowed', 405);
}

/** Start a job on GitHub. Shared by the Stripe webhook and the cron. */
async function dispatch(env, why, workflow = WORKFLOW, inputs) {
  if (!env.GITHUB_TOKEN) return { ok: false, status: 500, text: 'GITHUB_TOKEN is not set' };
  const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${workflow}/dispatches`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'tour-archive-stripe-hook',
      'content-type': 'application/json',
    },
    body: JSON.stringify(inputs ? { ref: 'main', inputs } : { ref: 'main' }),
  });
  const text = res.ok ? '' : (await res.text()).slice(0, 200);
  console.log(res.ok ? `dispatched ${workflow} (${why})` : `dispatch ${workflow} failed (${why}): ${res.status} ${text}`);
  return { ok: res.ok, status: res.status, text };
}
const dispatchSync = (env, why) => dispatch(env, why);

export default {
  /** Cloudflare cron (wrangler.jsonc triggers): the ten-minute sync tick,
      the Monday report, the first-of-the-month statement. */
  async scheduled(event, env, ctx) {
    if (event.cron === CRON_WEEKLY) ctx.waitUntil(dispatch(env, 'weekly report', REPORT_WORKFLOW, { month: '' }));
    else if (event.cron === CRON_MONTHLY) ctx.waitUntil(dispatch(env, 'monthly statement', REPORT_WORKFLOW, { month: 'previous' }));
    else ctx.waitUntil(dispatchSync(env, `cron ${event.cron}`));
  },

  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === EBAY_DELETION_PATH) return ebayAccountDeletion(request, env);
    if (pathname === '/ebay/app-token') return ebayAppToken(request, env);
    if (pathname === '/ebay/oauth/start') return ebayOAuthStart(request, env);
    if (pathname === '/ebay/oauth/callback') return ebayOAuthCallback(request, env);
    if (pathname === '/ebay/token') return ebayToken(request, env);
    if (pathname === '/report' || pathname.startsWith('/report/')) return reportRoute(request, env);
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
