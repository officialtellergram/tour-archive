/**
 * eBay channel adapter.
 *
 * Read path: application (client-credentials) OAuth token → Browse API
 * `item_summary/search` filtered to our seller. Browse is the right surface for
 * this job because it returns publicly visible listings and needs only an
 * application token — no per-user consent flow, no refresh-token storage.
 *
 * Error handling follows eBay's RESTful conventions:
 *   https://developer.ebay.com/develop/guides-v2/using-ebay-restful-apis#handling-errors
 * Errors come back as { errors: [{ errorId, domain, category, message,
 * longMessage, parameters }] }, with `warnings` carrying non-fatal notes on
 * otherwise-successful calls. We surface errorId/domain/category because those
 * are what make an eBay failure diagnosable — the HTTP status alone rarely is.
 */

import { config } from '../config.mjs';

const HOSTS = {
  sandbox: { api: 'https://api.sandbox.ebay.com', auth: 'https://api.sandbox.ebay.com' },
  production: { api: 'https://api.ebay.com', auth: 'https://api.ebay.com' },
};

/** Public-data scope — all Browse API methods sit under it. */
const SCOPE = 'https://api.ebay.com/oauth/api_scope';

export class EbayApiError extends Error {
  constructor(message, { status, errors = [], retryable = false } = {}) {
    super(message);
    this.name = 'EbayApiError';
    this.status = status;
    this.errors = errors;
    this.retryable = retryable;
  }

  /** Compact, log-friendly summary of eBay's structured error array. */
  get detail() {
    if (!this.errors.length) return '';
    return this.errors
      .map(
        (e) =>
          `[${e.errorId ?? '?'} ${e.domain ?? '?'}/${e.category ?? '?'}] ${
            e.longMessage || e.message || ''
          }`
      )
      .join('; ');
  }
}

/* ------------------------------------------------------------------ */
/* Token management                                                    */
/* ------------------------------------------------------------------ */

let token = null; // { value, expiresAt }

/** eBay application tokens last ~2h; refresh a minute early to avoid a race. */
async function getAppToken({ force = false } = {}) {
  if (!force && token && Date.now() < token.expiresAt) return token.value;

  const { clientId, clientSecret, env } = config.ebay;
  if (!clientId || !clientSecret) {
    throw new EbayApiError('eBay client credentials are not configured', { status: 0 });
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(`${HOSTS[env].auth}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: SCOPE }),
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    // The token endpoint uses OAuth-style {error, error_description}, not the
    // {errors:[…]} envelope the REST APIs use.
    throw new EbayApiError(
      `eBay token request failed (${res.status}): ${body.error_description || body.error || 'unknown'}`,
      { status: res.status, retryable: res.status >= 500 || res.status === 429 }
    );
  }

  token = {
    value: body.access_token,
    expiresAt: Date.now() + (Number(body.expires_in || 7200) - 60) * 1000,
  };
  return token.value;
}

/* ------------------------------------------------------------------ */
/* Request plumbing                                                    */
/* ------------------------------------------------------------------ */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * A single Browse request with eBay-aware retry:
 *  401 → token may have been revoked early; refresh once and retry.
 *  429 → rate limited; honour Retry-After, then exponential backoff.
 *  5xx → transient; exponential backoff.
 * Everything else fails fast — retrying a 400 just burns call quota.
 */
async function browseRequest(path, { attempt = 0, maxAttempts = 4, forceToken = false } = {}) {
  const { env, marketplaceId } = config.ebay;
  const accessToken = await getAppToken({ force: forceToken });

  const res = await fetch(`${HOSTS[env].api}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'X-EBAY-C-MARKETPLACE-ID': marketplaceId,
      Accept: 'application/json',
    },
  });

  if (res.ok) {
    const json = await res.json();
    if (Array.isArray(json.warnings) && json.warnings.length) {
      // Non-fatal, but worth knowing about — e.g. a filter eBay ignored.
      console.warn(
        `[ebay] warnings: ${json.warnings
          .map((w) => `[${w.errorId}] ${w.message}`)
          .join('; ')}`
      );
    }
    return json;
  }

  const body = await res.json().catch(() => ({}));
  const errors = Array.isArray(body.errors) ? body.errors : [];
  const err = new EbayApiError(`eBay Browse request failed (${res.status})`, {
    status: res.status,
    errors,
    retryable: res.status === 429 || res.status >= 500,
  });

  if (attempt + 1 >= maxAttempts) throw err;

  if (res.status === 401) {
    token = null;
    return browseRequest(path, { attempt: attempt + 1, maxAttempts, forceToken: true });
  }

  if (err.retryable) {
    const retryAfter = Number(res.headers.get('retry-after'));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : 2 ** attempt * 600;
    console.warn(`[ebay] ${res.status} ${err.detail} — retrying in ${wait}ms`);
    await sleep(wait);
    return browseRequest(path, { attempt: attempt + 1, maxAttempts });
  }

  throw err;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Every active listing for the configured seller, paged out in full.
 *
 * Browse requires a query anchor alongside `filter=sellers:{…}` — a bare seller
 * filter is rejected — so we anchor on the golf-apparel category by default.
 */
export async function fetchEbayListings() {
  const { sellerUsername, categoryIds, limit } = config.ebay;
  if (!sellerUsername) {
    throw new EbayApiError('EBAY_SELLER_USERNAME is not configured', { status: 0 });
  }

  const pageSize = Math.min(Number(limit) || 200, 200); // Browse caps at 200
  const collected = [];
  let offset = 0;
  let total = null;

  while (collected.length < Number(limit)) {
    const params = new URLSearchParams({
      category_ids: categoryIds,
      filter: `sellers:{${sellerUsername}}`,
      limit: String(pageSize),
      offset: String(offset),
    });
    const page = await browseRequest(`/buy/browse/v1/item_summary/search?${params}`);

    const items = page.itemSummaries || [];
    collected.push(...items);
    total = page.total ?? total;

    if (!items.length || collected.length >= (total ?? 0)) break;
    offset += pageSize;
    if (offset >= 10000) break; // Browse hard-caps deep paging
  }

  return collected.slice(0, Number(limit));
}

/** Cheap credential check used by /api/health. */
export async function pingEbay() {
  await getAppToken({ force: true });
  return { ok: true, env: config.ebay.env, marketplace: config.ebay.marketplaceId };
}
