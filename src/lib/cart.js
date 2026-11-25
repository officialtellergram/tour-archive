/**
 * The cart: a list of piece ids in localStorage, and the one call that turns
 * it into a Stripe Checkout Session on the Worker (POST /checkout — see
 * worker/stripe-hook/src/index.js and docs/SALE.md).
 *
 * Every piece is one of one, so a line is a piece, never a quantity. The
 * cart exists so an order can hold several pieces at once: one shipping
 * charge, and the sale's cart tiers (src/data/sale.js). Pieces that sold
 * while they sat in a cart are dropped the next time the cart is read
 * against stock, and the Worker refuses them at checkout with their ids,
 * so a visitor is told which piece went rather than paying for it.
 *
 * `ta:cart` fires on the document after every change; the header count
 * listens for it.
 */
import { getItem, isAvailable } from '../data/store.js';
import { previewWord } from '../data/sale.js';

export const CHECKOUT_API = 'https://tour-archive-stripe-hook.officialtellergram.workers.dev/checkout';
const KEY = 'ta_cart';
export const CART_MAX = 8;

function readIds() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    return Array.isArray(raw?.ids) ? raw.ids.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}
function writeIds(ids) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ids, at: Date.now() }));
  } catch {
    /* private mode: the cart lives for this page only */
  }
  document.dispatchEvent(new CustomEvent('ta:cart', { detail: { ids } }));
}

/** The ids in the cart, in the order they were added. */
export const cartIds = () => readIds();
export const cartCount = () => readIds().length;
export const inCart = (id) => readIds().includes(id);

/** The cart as stock records, dropping anything no longer for sale. */
export function cartItems() {
  const ids = readIds();
  const live = ids.map((id) => getItem(id)).filter((it) => it && isAvailable(it) && it.channel === 'stripe');
  if (live.length !== ids.length) writeIds(live.map((it) => it.id));
  return live;
}

/** Add a piece. Returns false when the cart is full or the piece is not for sale. */
export function addToCart(id) {
  const it = getItem(id);
  if (!it || !isAvailable(it) || it.channel !== 'stripe') return false;
  const ids = readIds();
  if (ids.includes(id)) return true;
  if (ids.length >= CART_MAX) return false;
  writeIds([...ids, id]);
  return true;
}

export function removeFromCart(id) {
  writeIds(readIds().filter((x) => x !== id));
}

export function clearCart() {
  writeIds([]);
}

/**
 * Ask the Worker for a Checkout Session for these pieces.
 * @returns {Promise<{ok:true,url:string}|{ok:false,error:string,gone?:string[]}>}
 *   error: 'gone' (some pieces sold — `gone` names them), 'empty', 'network',
 *   or the Worker's own short code.
 */
export async function checkout(ids) {
  const list = [...new Set(ids)].slice(0, CART_MAX);
  if (!list.length) return { ok: false, error: 'empty' };
  const headers = { 'content-type': 'application/json' };
  const preview = previewWord();
  if (preview) headers['x-sale-preview'] = preview;
  try {
    const r = await fetch(CHECKOUT_API, { method: 'POST', headers, body: JSON.stringify({ ids: list, page: location.pathname }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.url) return { ok: true, url: j.url };
    return { ok: false, error: j.error || `http ${r.status}`, gone: Array.isArray(j.gone) ? j.gone : undefined };
  } catch {
    return { ok: false, error: 'network' };
  }
}
