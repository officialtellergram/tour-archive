/**
 * The cart and the thank-you page.
 *
 * /cart lists the pieces held in localStorage (src/lib/cart.js) against the
 * live stock, works the order out with src/data/sale.js (piece discounts,
 * the cart tier, the next tier's distance) and hands the ids to the Worker
 * for a Stripe Checkout Session. The arithmetic shown here is the same
 * function the Worker runs, so the total on this page is the total Stripe
 * asks for — the page is a preview, the Worker is the authority.
 *
 * /thanks is where Stripe sends a paid order back. It empties the cart.
 * Neither page is indexed (scripts/prerender.mjs marks them noindex).
 */
import { breadcrumb, pictureTag, escapeHtml, isPlaceholder } from '../components/ui.js';
import { SALE, orderMath, saleOn, fmt, fmtShort } from '../data/sale.js';
import { cartItems, removeFromCart, clearCart, checkout, CART_MAX } from '../lib/cart.js';
import { toast } from '../lib/motion.js';

const SHIPPING_CENTS = 800;

function lineHTML(l) {
  const it = l.item;
  const meta = [it.brand, isPlaceholder(it.size) ? '' : `Size ${escapeHtml(it.size)}`].filter(Boolean).join(' · ');
  return `
        <li class="cart-line" data-line="${it.id}">
          <a class="cart-thumb plate plate--photo" href="/item/${it.id}">
            ${it.photo ? pictureTag(it.photo, { className: 'plate-photo', alt: escapeHtml(it.name) }) : ''}
          </a>
          <div class="cart-line-body">
            <a class="cart-line-name" href="/item/${it.id}">${escapeHtml(it.name)}</a>
            <p class="cart-line-meta">${meta}</p>
            ${l.select ? `<p class="cart-line-sale">${SALE.item.percent}% off</p>` : ''}
          </div>
          <div class="cart-line-price">
            ${l.off ? `<s>${fmtShort(l.full)}</s>` : ''}<b>${fmt(l.unit)}</b>
            <button type="button" class="cart-remove" data-remove="${it.id}">Remove</button>
          </div>
        </li>`;
}

function summaryHTML(m) {
  const n = m.lines.length;
  const rows = [
    [`${n} piece${n === 1 ? '' : 's'}`, fmt(m.list)],
    ...(m.pieceOff ? [[`${SALE.name} · ${SALE.item.percent}% off select pieces`, `−${fmt(m.pieceOff)}`]] : []),
    ...(m.tier ? [[`Cart over $${m.tier.min} · $${m.tier.off} off`, `−${fmt(m.tierOff)}`]] : []),
    ['Shipping, one charge', fmt(SHIPPING_CENTS)],
  ];
  const nudge = m.next
    ? `<p class="cart-nudge">Add ${fmt(m.next.gap)} more and $${m.next.off} comes off at checkout.</p>`
    : m.tier
    ? `<p class="cart-nudge">The top tier. $${m.tier.off} comes off at checkout.</p>`
    : '';
  return `
      <aside class="cart-summary" data-cart-summary>
        <p class="eyebrow">Order</p>
        <dl class="cart-rows">
          ${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}
        </dl>
        <div class="cart-total"><span>Total</span><b>${fmt(m.total + SHIPPING_CENTS)}</b></div>
        ${m.sale ? nudge : ''}
        <button class="btn btn--solid cart-checkout" data-checkout data-magnetic>Checkout <span aria-hidden="true">↗</span></button>
        <p class="cart-fine">Secure checkout by Stripe — you’ll be taken to our payment page. US addresses. Tracked, out within 3 business days. <a href="/terms">Terms of sale</a>.</p>
        <p class="cart-err" data-cart-err aria-live="polite"></p>
      </aside>`;
}

export function cart() {
  const lines = cartItems();
  const m = orderMath(lines);
  const head = breadcrumb([{ label: 'Home', href: '/' }, { label: 'Your cart' }]);
  // `shop.href` by name: the audit reads a `…href` expression as a nav href
  // audited where it is defined (both targets are routes it already knows).
  const shop = saleOn() ? { href: '/archive?filter=sale', label: 'Shop the sale' } : { href: '/archive', label: 'Browse the archive' };
  if (!lines.length) {
    return `
  <section class="section cart-page" style="padding-top:calc(var(--header-h) + 4rem)">
    <div class="wrap">
      ${head}
      <div class="empty-state" style="border-bottom:0">
        <p class="eyebrow">Your cart</p>
        <h1 class="display" style="font-size:clamp(2.2rem,5vw,4rem)">Nothing in it yet</h1>
        <p class="lede" style="text-align:center">
          Every piece is one of one. Put several in the cart and they ship together for one $8 charge${
            saleOn() ? `, and the ${SALE.name} tiers take $${SALE.tiers[0].off} to $${SALE.tiers[SALE.tiers.length - 1].off} off larger orders` : ''
          }.
        </p>
        <a class="btn btn--solid" href="${shop.href}" data-magnetic>${shop.label}</a>
      </div>
    </div>
  </section>`;
  }
  return `
  <section class="section cart-page" style="padding-top:calc(var(--header-h) + 4rem)">
    <div class="wrap">
      ${head}
      <div class="section-head" style="margin-bottom:clamp(1.5rem,3vw,2.5rem)">
        <div>
          <p class="eyebrow">Your cart${lines.length >= CART_MAX ? ' · full' : ''}</p>
          <h1 class="display" style="margin-top:.5rem">${lines.length} piece${lines.length === 1 ? '' : 's'}</h1>
        </div>
        <a class="text-link" href="${shop.href}">Keep looking <span>→</span></a>
      </div>
      <div class="cart-grid">
        <ul class="cart-lines" data-cart-lines>
          ${m.lines.map(lineHTML).join('')}
        </ul>
        ${summaryHTML(m)}
      </div>
    </div>
  </section>`;
}

export function mountCart(outlet) {
  const rerender = () => {
    outlet.innerHTML = cart();
    mountCart(outlet);
  };
  outlet.querySelectorAll('[data-remove]').forEach((b) =>
    b.addEventListener('click', () => {
      removeFromCart(b.dataset.remove);
      rerender();
    })
  );
  const btn = outlet.querySelector('[data-checkout]');
  btn?.addEventListener('click', async () => {
    if (btn.disabled) return;
    const err = outlet.querySelector('[data-cart-err]');
    err.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Opening checkout';
    const ids = cartItems().map((it) => it.id);
    const r = await checkout(ids);
    if (r.ok) {
      window.location.assign(r.url);
      return;
    }
    btn.disabled = false;
    btn.innerHTML = 'Checkout <span aria-hidden="true">↗</span>';
    if (r.error === 'gone' && r.gone?.length) {
      r.gone.forEach(removeFromCart);
      toast(r.gone.length === 1 ? 'One piece in your cart has just sold' : `${r.gone.length} pieces in your cart have just sold`);
      rerender();
      return;
    }
    err.textContent = r.error === 'empty'
      ? 'Your cart is empty.'
      : r.error === 'network'
      ? 'We could not reach checkout. Check your connection and try again.'
      : 'Checkout did not open. Try again in a moment, or email tourarchive.help@gmail.com.';
  });
}

export function thanks() {
  return `
  <section class="section" style="padding-top:calc(var(--header-h) + 5rem)">
    <div class="wrap empty-state" style="border-bottom:0">
      <p class="eyebrow">Order received</p>
      <h1 class="display" style="font-size:clamp(2.2rem,5vw,4rem)">Thank you.</h1>
      <p class="lede" style="text-align:center">
        Your pieces ship within 3 business days; tracking follows by email. Every piece is one of one, and these are now yours.
      </p>
      <a class="btn btn--solid" href="/archive" data-magnetic>Back to the archive</a>
    </div>
  </section>`;
}

export function mountThanks() {
  clearCart();
}
