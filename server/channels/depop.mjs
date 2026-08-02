/**
 * Depop channel adapter.
 *
 * ⚠ UNVERIFIED AGAINST A LIVE ENDPOINT.
 *
 * Depop's Selling API is not self-serve: access is granted under an executed
 * partnership Order Form, and credentials are issued by Depop to approved
 * partners. Until that lands we have the terms but not the endpoint reference,
 * so the request/response shapes below are a documented best guess.
 *
 * Everything Depop-specific is deliberately confined to this file and to
 * `mapDepopProduct` in particular. When the OpenAPI spec arrives, correcting
 * this one function and the path constants should be the whole job — nothing
 * downstream knows what a Depop payload looks like.
 *
 * Terms we are already bound by (partnerapi.depop.com/api-docs/terms):
 *  • Rate limits: 20 rps for product create/update, 100 rps for everything else.
 *    Our read path is far under that, and the cache layer keeps it there.
 *  • Acceptable Use forbids diverting sales away from Depop and mirroring
 *    Depop's look and feel. This integration therefore links *out* to the Depop
 *    listing rather than transacting on our own site for syndicated stock.
 *  • Credentials must be encrypted at rest and in transit, and never reach the
 *    browser bundle — hence the server-side-only config.
 */

import { config } from '../config.mjs';

export class DepopApiError extends Error {
  constructor(message, { status, body, retryable = false } = {}) {
    super(message);
    this.name = 'DepopApiError';
    this.status = status;
    this.body = body;
    this.retryable = retryable;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Paths are isolated here so the spec can correct them in one place. */
export const DEPOP_PATHS = {
  products: '/v1/shops/:shopId/products',
};

async function depopRequest(path, { attempt = 0, maxAttempts = 4 } = {}) {
  const { baseUrl, apiKey } = config.depop;
  if (!apiKey) throw new DepopApiError('DEPOP_API_KEY is not configured', { status: 0 });

  const res = await fetch(`${baseUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });

  if (res.ok) return res.json();

  const body = await res.json().catch(() => ({}));
  const retryable = res.status === 429 || res.status >= 500;
  const err = new DepopApiError(
    `Depop request failed (${res.status}): ${body.message || body.error || 'unknown'}`,
    { status: res.status, body, retryable }
  );

  if (retryable && attempt + 1 < maxAttempts) {
    const retryAfter = Number(res.headers.get('retry-after'));
    const wait =
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 600;
    console.warn(`[depop] ${res.status} — retrying in ${wait}ms`);
    await sleep(wait);
    return depopRequest(path, { attempt: attempt + 1, maxAttempts });
  }

  throw err;
}

/**
 * Active products for the configured shop.
 * Returns [] rather than throwing when the channel is switched off, so the rest
 * of the pipeline treats "no partnership yet" as simply having no Depop stock.
 */
export async function fetchDepopListings() {
  if (!config.depop.enabled) return [];

  const { shopId, limit } = config.depop;
  if (!shopId) throw new DepopApiError('DEPOP_SHOP_ID is not configured', { status: 0 });

  const path = DEPOP_PATHS.products.replace(':shopId', encodeURIComponent(shopId));
  const collected = [];
  let cursor = null;

  // Cursor pagination is the common shape for this style of API; confirm the
  // parameter names against the spec before trusting this in production.
  do {
    const params = new URLSearchParams({ limit: String(Math.min(limit, 100)) });
    if (cursor) params.set('cursor', cursor);
    const page = await depopRequest(`${path}?${params}`);
    const items = page.products || page.data || page.items || [];
    collected.push(...items);
    cursor = page.next_cursor || page.nextCursor || null;
  } while (cursor && collected.length < limit);

  return collected.slice(0, limit);
}

export async function pingDepop() {
  if (!config.depop.enabled) {
    return { ok: false, reason: 'channel disabled — awaiting Depop partnership credentials' };
  }
  await fetchDepopListings();
  return { ok: true };
}
