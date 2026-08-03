/**
 * Minimal static server for probing a base-path build locally.
 *
 * Serves dist/ under the /tour-archive/ prefix with the same SPA fallback
 * GitHub Pages provides via 404.html — so click-probe and manual checks can
 * run against exactly the URL shape production uses.
 *
 * Usage: node scripts/serve-dist.mjs   → http://localhost:4180/tour-archive/
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('../dist', import.meta.url));
const PREFIX = '/tour-archive';
const PORT = Number(process.env.PORT || 4180);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  let path = decodeURIComponent(url.pathname);
  if (path === '/' || path === PREFIX || path === `${PREFIX}/`) path = `${PREFIX}/index.html`;
  if (!path.startsWith(`${PREFIX}/`)) {
    res.writeHead(404).end('outside base path');
    return;
  }
  const rel = normalize(path.slice(PREFIX.length + 1)).replace(/^([/\\.])+/, '');
  const candidates = [join(DIST, rel)];
  if (!extname(rel)) candidates.push(join(DIST, '404.html'), join(DIST, 'index.html'));
  for (const file of candidates) {
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(body);
      return;
    } catch {
      /* next candidate */
    }
  }
  res.writeHead(404).end('not found');
}).listen(PORT, '127.0.0.1', () => {
  console.log(`serving dist at http://localhost:${PORT}${PREFIX}/`);
});
