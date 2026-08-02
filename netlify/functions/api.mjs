/**
 * Netlify Function — the inventory API, serverless.
 *
 * Same `buildInventory` the standalone server uses, so a preview deploy is real
 * evidence about production rather than a separate code path that merely looks
 * similar.
 *
 * Two differences from the long-lived server, both inherent to serverless:
 *  • The disk cache doesn't persist. `cache.mjs` already treats a failed write
 *    as non-fatal, so it degrades to an in-memory cache that survives while the
 *    function stays warm and refetches when it doesn't. At a 15-minute TTL and
 *    preview-level traffic that is well inside eBay's daily call allowance.
 *  • No `POST /api/sync` — there is no persistent cache to invalidate, and a
 *    cold start does the same job.
 *
 * Secrets come from Netlify environment variables, never from a committed file.
 */

import { config as settings, channelStatus } from '../../server/config.mjs';
import { withCache } from '../../server/cache.mjs';
import { buildInventory, CACHE_KEY } from '../../server/inventory.mjs';
import { pingEbay } from '../../server/channels/ebay.mjs';
import { pingDepop } from '../../server/channels/depop.mjs';

const json = (payload, status = 200, extra = {}) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Same-origin on Netlify, but preview deploys are sometimes opened from a
      // different branch URL, so keep this permissive for read-only data.
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
      ...extra,
    },
  });

export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api/, '') || '/';

  try {
    if (path === '/health') {
      const probes = {};
      if (url.searchParams.get('probe') === '1') {
        probes.ebay = settings.ebay.enabled
          ? await pingEbay().catch((e) => ({ ok: false, error: e.message }))
          : { ok: false, reason: 'disabled' };
        probes.depop = await pingDepop().catch((e) => ({ ok: false, error: e.message }));
      }
      return json({
        ok: true,
        runtime: 'netlify-function',
        mock: settings.mockChannels,
        channels: channelStatus(),
        probes,
        cacheTtl: settings.cache.ttl,
      });
    }

    if (path === '/inventory') {
      const result = await withCache(CACHE_KEY, buildInventory);
      return json(
        { ...result.data, cache: { state: result.state, age: result.age, error: result.error } },
        200,
        { 'X-Cache-State': result.state }
      );
    }

    return json({ error: 'not found', path: url.pathname }, 404);
  } catch (err) {
    console.error('[function]', err);
    return json({ error: err.message }, 500);
  }
};

/** Netlify Functions 2.0 routing — both endpoints served by this one function. */
export const config = {
  path: ['/api/health', '/api/inventory'],
};
