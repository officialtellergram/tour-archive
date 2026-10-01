/**
 * Media constants and the WebP sibling rule — pure, no DOM, no import.meta:
 * this module is shared by the templates (src/components/ui.js), the hover /
 * stage swappers (motion.js, product.js) and the build step that writes the
 * WebP files (scripts/images.mjs), so it must load in Node as-is.
 *
 * Intrinsic sizes are pinned here so every <img> can carry width/height (the
 * browser reserves the box before the bytes land — no layout shift, and
 * Lighthouse's "unsized images" stops firing). The CSS still owns the visual
 * size (object-fit: cover inside aspect-ratio plates, width + height:auto on
 * the brand art), so these numbers only ever reserve space. scripts/images.mjs
 * reads the real files at build time and fails the build when a constant
 * drifts from disk.
 */

/** Stock photography: heroes and carousel frames ship at 1200x1600 (4:5). A
 *  handful of frames run a few pixels short (1197x1551, 1199x1500) and the
 *  eBay-era carousel WebPs vary — all of them sit in a 4:5 plate under
 *  object-fit: cover, so the plate's ratio is the only one that matters. */
export const STOCK_SIZE = { width: 1200, height: 1600 };

/** Landing backdrop plates (public/hero), built by scripts/hero-plates.py. */
export const HERO_SIZE = { width: 1760, height: 1320 };
export const HERO_SIZES = {
  'hero/ocean-hole.jpg': { width: 1760, height: 1372 },
  'hero/fairway-mackerel-sky.jpg': { width: 1760, height: 1230 },
};

/** Brand art (public/brand), by file. */
export const BRAND_SIZES = {
  'brand/logo.png': { width: 693, height: 778 },
  'brand/lockup.png': { width: 1067, height: 1419 },
  'brand/favicon.png': { width: 512, height: 512 },
  'brand/presidents-cup-title.webp': { width: 1400, height: 600 },
};

/** Strip a ?v= stamp (and any query) for the size lookups. */
const bare = (path) => String(path || '').replace(/[?#].*$/, '');

/** Intrinsic size for a public/-relative path, or null when unknown. */
export function imageSize(path) {
  const p = bare(path);
  if (/^stock\//.test(p)) return STOCK_SIZE;
  if (/^hero\//.test(p)) return HERO_SIZES[p] || HERO_SIZE;
  return BRAND_SIZES[p] || null;
}

/** `width="…" height="…"` for a public/-relative path — '' when unknown. */
export function sizeAttrs(path) {
  const s = imageSize(path);
  return s ? ` width="${s.width}" height="${s.height}"` : '';
}

/**
 * The WebP sibling of a JPEG URL, or '' when there is none to offer: only
 * repo-relative .jpg/.jpeg files get a sibling (scripts/images.mjs writes
 * `<name>.webp` beside every public/stock and public/hero JPEG into dist/).
 * Absolute (marketplace) URLs and files that are already WebP/PNG pass
 * through as '' — the <img> alone is right for them. A ?v= stamp survives
 * the swap so the Cloudflare cache sees the same version key.
 */
export function webpURL(url) {
  const u = String(url || '');
  if (!u || /^(https?:)?\/\//i.test(u)) return '';
  return /\.jpe?g(?=([?#]|$))/i.test(u) ? u.replace(/\.jpe?g(?=([?#]|$))/i, '.webp') : '';
}
