/**
 * Sale fragments: the tag a select piece wears, the struck-through price,
 * the home banner and the ticker line. All of it keys off src/data/sale.js,
 * so when the window shuts (or a preview word is absent) every fragment
 * renders as if the sale never existed — nothing here is wired by hand.
 */
import { SALE, saleOn, onSale, isSelect, unitCents, cents, fmt, fmtShort } from '../data/sale.js';
import { items, isAvailable } from '../data/store.js';

/* A small brass ticket, drawn: the sale's glyph where New has its star. */
export const TICKET =
  '<svg class="plate-star" viewBox="0 0 10 10" aria-hidden="true" focusable="false"><path d="M1 1h4.2L9.4 5.2 5.2 9.4 1 5.2z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><circle cx="3.1" cy="3.1" r=".8" fill="currentColor"/></svg>';

export const saleTag = () => `<span class="plate-tag plate-tag--sale" aria-label="${SALE.item.percent} percent off">${TICKET}Sale</span>`;

/** "$24.99" → "<s>$24.99</s> $18.74" while the piece is on sale; the plain price otherwise. */
export function priceHTML(item, className = '') {
  const full = cents(item.price);
  const sale = onSale(item);
  const cls = [className, sale ? `${className || 'price'}--sale` : ''].filter(Boolean).join(' ');
  const inner = sale ? `<s>${fmtShort(full)}</s> ${fmt(unitCents(item))}` : fmtShort(full);
  return `<span class="${cls}">${inner}</span>`;
}

/** The sale line under a piece's price. '' when the sale is off. */
export function saleNote(item) {
  if (!saleOn()) return '';
  const tiers = SALE.tiers.map((t) => `$${t.min} saves $${t.off}`).join(', ');
  const lead = isSelect(item) && isAvailable(item)
    ? `${SALE.name}: ${SALE.item.percent}% off this piece.`
    : `${SALE.name}.`;
  return `<p class="eyebrow eyebrow--brass sale-note">${lead} At checkout the cart saves more: ${tiers}. ${SALE.endsLabel}.</p>`;
}

/** The words the home ticker runs while the sale is on. */
export function tickerWords() {
  return [
    `${SALE.name} — ${SALE.item.percent}% off every piece under $${SALE.item.under}`,
    ...SALE.tiers.map((t) => `Spend $${t.min}, save $${t.off}`),
    'One shipping charge per order',
    SALE.endsLabel,
  ];
}

const WORDS = { 25: 'Twenty-five', 20: 'Twenty', 30: 'Thirty', 40: 'Forty', 50: 'Fifty' };

/** The home banner. '' when the sale is off. */
export function saleBanner() {
  if (!saleOn()) return '';
  const select = items().filter((i) => isAvailable(i) && isSelect(i)).length;
  const pct = WORDS[SALE.item.percent] || String(SALE.item.percent);
  return `
  <section class="sale-banner" aria-labelledby="sale-title">
    <div class="sale-screen" aria-hidden="true"></div>
    <div class="wrap sale-inner">
      <div class="sale-head" data-reveal>
        <p class="eyebrow sale-eyebrow">${SALE.name} · Friday through Cyber Monday</p>
        <h2 id="sale-title" class="display sale-title">${pct} percent off<br class="sale-br" />every piece under $${SALE.item.under}.</h2>
        <p class="sale-lede">${select ? `${select} piece${select === 1 ? ' wears' : 's wear'} the sale tag.` : 'Every piece under the line wears the sale tag.'} Then the more you put in the cart, the more comes off at checkout.</p>
      </div>
      <ol class="sale-tiers" data-reveal data-reveal-delay="0.08">
        ${SALE.tiers
          .map(
            (t) => `<li><span class="sale-tier-min">$${t.min}<small>+</small></span><span class="sale-tier-off">$${t.off} off</span></li>`
          )
          .join('')}
      </ol>
      <div class="sale-foot" data-reveal data-reveal-delay="0.14">
        <p class="sale-fine">Tiers count the pieces after their discounts, before shipping. One $8 shipping charge per order, however many pieces. ${SALE.endsLabel}.</p>
        <div class="sale-cta">
          <a class="btn sale-btn" href="/archive?filter=sale" data-magnetic>Shop the sale</a>
          <a class="btn sale-btn sale-btn--ghost" href="/cart">Your cart</a>
        </div>
      </div>
    </div>
  </section>`;
}
