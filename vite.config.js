import { defineConfig } from 'vite';
import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * `BASE_PATH` handles where the site is served from:
 *   "/"            a user/org site (username.github.io) or a custom domain
 *   "/repo-name/"  a GitHub Pages project site
 *
 * The GitHub Actions workflow sets it automatically. Everything else — asset
 * URLs, the router, the inventory snapshot — reads Vite's BASE_URL, so nothing
 * else needs to know.
 */
const base = process.env.BASE_PATH || '/';

/**
 * GitHub Pages has no redirect rules, so a client-routed deep link like
 * /collections/duel-in-the-sun would 404 on direct load or refresh. Pages does
 * serve `404.html` for unmatched paths, and since the router reads
 * location.pathname, an identical copy of index.html makes that a working
 * entry point rather than an error page.
 */
function githubPagesSpaFallback() {
  return {
    name: 'gh-pages-spa-fallback',
    apply: 'build',
    closeBundle() {
      const dist = resolve(process.cwd(), 'dist');
      const index = resolve(dist, 'index.html');
      if (existsSync(index)) {
        copyFileSync(index, resolve(dist, '404.html'));
        console.log('  ✔ 404.html written (SPA fallback for GitHub Pages)');
      }
    },
  };
}

export default defineConfig({
  base,
  // appType 'spa' (default) gives us index.html fallback for client-side routes
  // like /collections/:id in both `vite dev` and `vite preview`.
  appType: 'spa',
  plugins: [githubPagesSpaFallback()],
  server: {
    port: 5180,
    open: false,
  },
  preview: { port: 5180 },
});
