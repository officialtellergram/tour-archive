/**
 * Shared stock-pipeline constants. Side-effect-free on purpose: ingest.mjs and
 * ebay-peek.mjs run on import, so anything they share has to live here where
 * importing costs nothing. One definition, imported everywhere.
 */

/** Photos ship with the site — the "compress it" budget per file. */
export const MAX_BYTES = 1.5 * 1024 * 1024;

/**
 * The headed-Edge user agent. Headless mode advertises itself in the UA and
 * eBay error-pages it; both the CDP probe and the CDN downloads present this
 * equivalent headed UA instead.
 */
export const PEEK_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0';
