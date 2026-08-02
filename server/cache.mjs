/**
 * Disk-backed cache with stale-if-error.
 *
 * Two jobs:
 *  1. Stay inside the marketplaces' rate limits (Depop caps product writes at
 *     20 rps and everything else at 100 rps; eBay meters per-app daily calls).
 *  2. Keep the shop up when a marketplace is down. A vintage archive that goes
 *     blank because eBay returned a 503 is worse than one showing stock that is
 *     fifteen minutes stale, so a failed refresh falls back to the last good
 *     payload rather than propagating the error.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.mjs';

const memory = new Map();

function pathFor(key) {
  return join(config.cache.dir, `${key.replace(/[^a-z0-9._-]/gi, '_')}.json`);
}

function readDisk(key) {
  const file = pathFor(key);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function writeDisk(key, entry) {
  try {
    mkdirSync(config.cache.dir, { recursive: true });
    writeFileSync(pathFor(key), JSON.stringify(entry), 'utf8');
  } catch (err) {
    console.warn(`[cache] could not persist ${key}: ${err.message}`);
  }
}

function load(key) {
  if (memory.has(key)) return memory.get(key);
  const fromDisk = readDisk(key);
  if (fromDisk) memory.set(key, fromDisk);
  return fromDisk;
}

/**
 * Return cached data if fresh; otherwise call `produce()`.
 * On failure, fall back to stale data when we have it.
 *
 * @returns {Promise<{data:any, state:'fresh'|'cached'|'stale', age:number, error?:string}>}
 */
export async function withCache(key, produce, { ttl = config.cache.ttl } = {}) {
  const now = Date.now();
  const entry = load(key);
  const age = entry ? Math.round((now - entry.at) / 1000) : Infinity;

  if (entry && age < ttl) {
    return { data: entry.data, state: 'cached', age };
  }

  try {
    const data = await produce();
    const next = { at: now, data };
    memory.set(key, next);
    writeDisk(key, next);
    return { data, state: 'fresh', age: 0 };
  } catch (err) {
    if (entry && config.cache.staleIfError) {
      console.warn(`[cache] ${key} refresh failed, serving stale (${age}s): ${err.message}`);
      return { data: entry.data, state: 'stale', age, error: err.message };
    }
    throw err;
  }
}

/** Drop a cache entry so the next read refetches. */
export function invalidate(key) {
  memory.delete(key);
  try {
    const file = pathFor(key);
    if (existsSync(file)) writeFileSync(file, JSON.stringify({ at: 0, data: null }), 'utf8');
  } catch {
    /* best effort */
  }
}
