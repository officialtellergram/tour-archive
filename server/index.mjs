/**
 * Tour Archive inventory API.
 *
 * Sits between the marketplaces and the site. Exists for three reasons:
 *   1. Credentials. eBay's client secret and Depop's API key cannot ship in a
 *      browser bundle — Depop's terms require them encrypted at rest and in
 *      transit, and eBay's would let anyone spend our call quota.
 *   2. Rate limits and quota. One cached fetch serves every visitor.
 *   3. Uptime. A marketplace outage degrades to stale stock, not an empty shop.
 *
 * Endpoints
 *   GET /api/health     channel readiness + last sync state
 *   GET /api/inventory  merged, normalised inventory
 *   POST /api/sync      force a refresh (bypasses cache)
 */

import { createServer } from 'node:http';
import { config, channelStatus } from './config.mjs';
import { withCache, invalidate } from './cache.mjs';
import { pingEbay } from './channels/ebay.mjs';
import { pingDepop } from './channels/depop.mjs';
import { buildInventory, CACHE_KEY } from './inventory.mjs';

/* ------------------------------------------------------------------ */
/* HTTP                                                                */
/* ------------------------------------------------------------------ */

function send(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': config.corsOrigin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(body);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${config.port}`);

  if (req.method === 'OPTIONS') return send(res, 204, {});

  try {
    if (url.pathname === '/api/health') {
      const channels = channelStatus();
      const probes = {};
      if (url.searchParams.get('probe') === '1') {
        // Actually call out — proves the credentials work, not just that they exist.
        probes.ebay = config.ebay.enabled
          ? await pingEbay().catch((e) => ({ ok: false, error: e.message }))
          : { ok: false, reason: 'disabled' };
        probes.depop = await pingDepop().catch((e) => ({ ok: false, error: e.message }));
      }
      return send(res, 200, { ok: true, channels, probes, cacheTtl: config.cache.ttl });
    }

    if (url.pathname === '/api/inventory') {
      const result = await withCache(CACHE_KEY, buildInventory);
      return send(
        res,
        200,
        { ...result.data, cache: { state: result.state, age: result.age, error: result.error } },
        { 'X-Cache-State': result.state }
      );
    }

    if (url.pathname === '/api/sync' && req.method === 'POST') {
      invalidate(CACHE_KEY);
      const result = await withCache(CACHE_KEY, buildInventory);
      return send(res, 200, { synced: true, counts: result.data.counts, sources: result.data.sources });
    }

    return send(res, 404, { error: 'not found', path: url.pathname });
  } catch (err) {
    console.error('[server]', err);
    return send(res, 500, { error: err.message });
  }
});

server.listen(config.port, () => {
  console.log(`\n  Tour Archive inventory API → http://localhost:${config.port}`);
  for (const c of channelStatus()) {
    console.log(
      c.ready ? `    ✔ ${c.channel} ready${c.env ? ` (${c.env})` : ''}` : `    · ${c.channel} off — ${c.reason}`
    );
  }
  console.log('');
});
