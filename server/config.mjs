/**
 * Server configuration.
 *
 * Secrets live here and ONLY here — never in src/. The browser bundle must not
 * contain an eBay client secret or a Depop API key, which is the whole reason
 * this server exists.
 *
 * Loads .env if present (no dependency — we parse it ourselves).
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/* ---------- minimal .env loader ---------- */

const envPath = `${ROOT}.env`;
if (existsSync(envPath)) {
  // Strip a UTF-8 BOM: PowerShell's `Out-File -Encoding utf8` writes one, and it
  // would otherwise become part of the first key — so the very first variable in
  // the file silently reads as undefined. Painful to diagnose, trivial to avoid.
  const raw = readFileSync(envPath, 'utf8').replace(/^﻿/, '');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

const bool = (v, fallback = false) =>
  v === undefined ? fallback : /^(1|true|yes|on)$/i.test(String(v));
const num = (v, fallback) => (v === undefined || v === '' ? fallback : Number(v));

export const config = {
  port: num(process.env.PORT, 5181),
  root: ROOT,

  /* --------------------------- eBay --------------------------- */
  ebay: {
    enabled: bool(process.env.EBAY_ENABLED, false),
    /** 'sandbox' | 'production' */
    env: process.env.EBAY_ENV === 'production' ? 'production' : 'sandbox',
    clientId: process.env.EBAY_CLIENT_ID || '',
    clientSecret: process.env.EBAY_CLIENT_SECRET || '',
    /** The seller account whose listings populate the site. */
    sellerUsername: process.env.EBAY_SELLER_USERNAME || '',
    /** EBAY_US, EBAY_GB, … — controls the X-EBAY-C-MARKETPLACE-ID header. */
    marketplaceId: process.env.EBAY_MARKETPLACE_ID || 'EBAY_US',
    /**
     * The Browse API requires a query anchor alongside the sellers filter.
     * A broad category is more reliable than a keyword: 137084 is
     * Sporting Goods > Golf > Golf Clothing, Shoes & Accessories.
     */
    categoryIds: process.env.EBAY_CATEGORY_IDS || '137084',
    limit: num(process.env.EBAY_LIMIT, 200),
  },

  /* --------------------------- Depop -------------------------- */
  depop: {
    /**
     * Off until a Depop partnership Order Form is executed and credentials
     * are issued — access is not self-serve. See ACTIONS.md.
     */
    enabled: bool(process.env.DEPOP_ENABLED, false),
    baseUrl: process.env.DEPOP_BASE_URL || 'https://partnerapi.depop.com',
    apiKey: process.env.DEPOP_API_KEY || '',
    shopId: process.env.DEPOP_SHOP_ID || '',
    limit: num(process.env.DEPOP_LIMIT, 200),
  },

  /* --------------------------- cache -------------------------- */
  cache: {
    /** How long a successful channel fetch stays fresh, in seconds. */
    ttl: num(process.env.CACHE_TTL_SECONDS, 900),
    /** Serve stale cache rather than failing when a channel is down. */
    staleIfError: bool(process.env.CACHE_STALE_IF_ERROR, true),
    dir: process.env.CACHE_DIR || `${ROOT}.cache`,
  },

  /** Allow the Vite dev origin to call this API. */
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5180',

  /**
   * Demo mode. Feeds realistic fixture listings through the exact same mapping
   * and merge path as a live channel, so the syndicated experience — the eBay
   * and Depop badges, the "Buy on eBay" redirect — can be shown before any
   * credentials exist. Never enable in production; /api/health flags it.
   */
  mockChannels: bool(process.env.MOCK_CHANNELS, false),
};

/**
 * Report which channels are actually usable, and why not if they aren't.
 * Surfaced at /api/health so the state of the integration is never a mystery.
 */
export function channelStatus() {
  const out = [];

  if (!config.ebay.enabled) {
    out.push({ channel: 'ebay', ready: false, reason: 'EBAY_ENABLED is not set' });
  } else {
    const missing = [
      !config.ebay.clientId && 'EBAY_CLIENT_ID',
      !config.ebay.clientSecret && 'EBAY_CLIENT_SECRET',
      !config.ebay.sellerUsername && 'EBAY_SELLER_USERNAME',
    ].filter(Boolean);
    out.push(
      missing.length
        ? { channel: 'ebay', ready: false, reason: `missing ${missing.join(', ')}` }
        : { channel: 'ebay', ready: true, env: config.ebay.env }
    );
  }

  if (!config.depop.enabled) {
    out.push({
      channel: 'depop',
      ready: false,
      reason: 'DEPOP_ENABLED is not set — Depop API access requires an executed partnership Order Form, not a self-serve signup',
    });
  } else {
    const missing = [
      !config.depop.apiKey && 'DEPOP_API_KEY',
      !config.depop.shopId && 'DEPOP_SHOP_ID',
    ].filter(Boolean);
    out.push(
      missing.length
        ? { channel: 'depop', ready: false, reason: `missing ${missing.join(', ')}` }
        : { channel: 'depop', ready: true }
    );
  }

  return out;
}
