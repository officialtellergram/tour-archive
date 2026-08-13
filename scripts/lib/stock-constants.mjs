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

/** Item-specifics gate, shared by the pull's cowardly writer and the audit —
 *  one definition so they cannot drift. The buybox renders in
 *  ux-labels-values rows too; its keys are the fingerprint of a mis-scoped
 *  harvest. */
export const BUYBOX_KEY_RX = /^(shipping|returns|payments)$/i;
export const CONTAMINATION_RX = /read more|see all condition definitions/i;
export const SPEC_KEY_MAX = 40;
export const SPEC_VALUE_MAX = 400;
