import { getItem, getCollection, itemsIn, itemStatus, isAvailable, featuredEvent, dateRange } from '../data/store.js';
import { garmentSVG } from '../components/garment.js';
import { productCard, breadcrumb, money, plateTag, plateMedia, sectionHead } from '../components/ui.js';
import { toast } from '../lib/motion.js';

export const channelName = (item) =>
  item.channel === 'depop' ? 'Depop' : item.channel === 'ebay' ? 'eBay' : 'the archive';

/**
 * Commerce model: we hold no checkout of our own for marketplace stock. A piece
 * that is live on eBay or Depop sends the buyer to that listing to complete the
 * purchase — which is also what keeps us the right side of Depop's rule against
 * diverting sales away from their platform.
 *
 * Site-only drop pieces (listed here ahead of the event, not yet syndicated)
 * still use the prototype reserve button; that flow needs a real decision about
 * payments before it means anything.
 */
function primaryAction(item) {
  if (isAvailable(item) && item.syndicated) {
    // One button per marketplace the piece is listed on. Today that is usually
    // one; the intended end state is every piece on both, and this is already
    // the simple checkout choice for that day.
    const listings = item.listings?.length
      ? item.listings
      : [{ channel: item.channel, url: item.market.url }];
    return listings
      .map(
        (l) => `<a class="btn btn--solid" href="${l.url}" target="_blank" rel="noopener"
      data-magnetic>Buy on ${l.channel === 'depop' ? 'Depop' : 'eBay'} <span aria-hidden="true">↗</span></a>`
      )
      .join('');
  }
  if (isAvailable(item)) {
    return `<button class="btn btn--solid" data-reserve data-magnetic>Reserve this piece</button>`;
  }
  if (item.upcoming) {
    const ev = featuredEvent();
    return `<button class="btn btn--solid" data-notify data-magnetic>Notify me — opens ${
      ev ? dateRange(ev) : 'with the drop'
    }</button>`;
  }
  return `<button class="btn is-disabled" disabled>Sold — archive reference</button>`;
}

function secondaryAction(item) {
  // For syndicated stock the primary button already is the listing, so the
  // secondary slot is better spent on a way to ask us about the piece.
  if (isAvailable(item) && item.syndicated) {
    return `<a class="btn btn--ghost" href="mailto:officialtellergram@gmail.com?subject=${encodeURIComponent(
      `${item.name} (${item.id})`
    )}">Ask about this piece</a>`;
  }
  return `<a class="btn btn--ghost" href="${item.market.url}" target="_blank" rel="noopener">
    ${item.syndicated ? 'View listing' : 'Comparables'} ↗
  </a>`;
}

export function product({ id }) {
  const item = getItem(id);
  if (!item) return missingItem(id);

  const coll = getCollection(item.collection);
  const related = itemsIn(item.collection).filter((i) => i.id !== item.id).slice(0, 4);
  const views = ['front', 'detail', 'flat'];

  return `
  <article class="pdp">
    <div class="wrap">
      ${breadcrumb([
        { label: 'Home', href: '/' },
        { label: 'Collections', href: '/collections' },
        ...(coll ? [{ label: coll.name, href: `/collections/${coll.id}` }] : []),
        { label: item.name },
      ])}

      <div class="pdp-grid">
        <!-- media: photography when we have it, drawn views otherwise -->
        <div class="pdp-media" data-reveal>
          <div class="plate plate--lg ${item.photo ? 'plate--photo' : ''}" data-pdp-stage>
            ${plateTag(item)}
            ${plateMedia(item, { view: 'front' })}
          </div>
          ${
            item.photo
              ? ''
              : `<div class="pdp-thumbs" data-pdp-thumbs>
                  ${views
                    .map(
                      (v, i) => `
                    <button class="plate" data-view="${v}" aria-pressed="${i === 0}"
                      aria-label="View ${v}">${garmentSVG(item, { view: v })}</button>`
                    )
                    .join('')}
                </div>`
          }
        </div>

        <!-- info -->
        <div class="pdp-info" data-reveal data-reveal-delay="0.08">
          <div>
            <p class="eyebrow">${item.brand} · ${item.year}${
    coll ? ` · <a href="/collections/${coll.id}" style="color:var(--brass)">${coll.name}</a>` : ''
  }</p>
            <h1 class="display" style="font-size:clamp(2rem,3.6vw,3.4rem);margin:.6rem 0">
              ${item.name}
            </h1>
            <p class="eyebrow eyebrow--brass">${item.colorName} · ${item.condition} · Size ${item.size}</p>
          </div>

          <p style="color:var(--ink-soft);font-weight:300;margin:0">${item.story}</p>

          <div style="display:flex;align-items:baseline;gap:1rem;padding-top:.6rem;border-top:1px solid var(--rule)">
            <span class="pdp-price">${money(item.price)}</span>
            <span class="eyebrow">${itemStatus(item)}</span>
          </div>

          ${
            isAvailable(item) && item.syndicated
              ? `<p class="eyebrow" style="margin:-.4rem 0 0">
                   Checkout completes on ${
                     item.listings?.length > 1 ? 'the marketplace you choose' : channelName(item)
                   } — you’ll be taken to the listing
                 </p>`
              : ''
          }

          <div class="pdp-actions">
            ${primaryAction(item)}
            ${secondaryAction(item)}
          </div>

          <ul class="detail-list">
            ${item.details.map((d) => `<li>${d}</li>`).join('')}
          </ul>

          <div class="accordion">
            <div class="accordion-item is-open">
              <button class="accordion-trigger">${
                Object.keys(item.measurements).length ? 'Measurements, flat' : 'Sizing &amp; condition'
              } <i>+</i></button>
              <div class="accordion-panel"><div>
                <table class="spec-table">
                  ${Object.entries(item.measurements)
                    .map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`)
                    .join('')}
                  <tr><th>Labelled size</th><td>${item.size}</td></tr>
                  <tr><th>Condition</th><td>${item.condition}</td></tr>
                </table>
                ${
                  Object.keys(item.measurements).length
                    ? ''
                    : `<p style="margin:.9rem 0 0;color:var(--ink-faint);font-size:.9rem">
                        Flat measurements are taken before shipping — ask and we'll send them same day.
                      </p>`
                }
              </div></div>
            </div>
            <div class="accordion-item">
              <button class="accordion-trigger">Provenance <i>+</i></button>
              <div class="accordion-panel"><div>
                <p style="color:var(--ink-soft);font-weight:300;margin:0 0 1rem">
                  Catalogued under ${coll ? coll.name : 'the archive'}${
    coll ? ` — ${coll.place}, ${coll.years}` : ''
  }. Dated from label construction and fibre content; see our
                  <a href="/method" style="border-bottom:1px solid var(--rule-strong)">method</a>.
                </p>
                <p style="margin:0">
                  <a class="text-link" href="${item.market.url}" target="_blank" rel="noopener">
                    ${item.market.label} <span>↗</span>
                  </a>
                </p>
              </div></div>
            </div>
            <div class="accordion-item">
              <button class="accordion-trigger">Shipping &amp; returns <i>+</i></button>
              <div class="accordion-panel"><div>
                <p style="color:var(--ink-soft);font-weight:300;margin:0">
                  Marketplace listings ship on that marketplace's terms. For pieces sold here,
                  shipping and returns are agreed when you reserve — tracked, and never sold
                  unseen. Sizing runs to period cut, so buy on measurements rather than the label.
                  <a href="/sizing" style="border-bottom:1px solid var(--rule-strong)">Sizing &amp; condition guide</a>.
                </p>
              </div></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    ${
      related.length
        ? `<section class="section">
             <div class="wrap">
               ${sectionHead({
                 eyebrow: 'From the same drop',
                 title: coll ? coll.name : 'Related',
                 link: coll
                   ? { href: `/collections/${coll.id}`, label: 'Open collection' }
                   : null,
               })}
               <div class="grid-products" data-stagger>${related.map(productCard).join('')}</div>
             </div>
           </section>`
        : ''
    }
  </article>`;
}

export function mountProduct(outlet) {
  const item = getItem(window.location.pathname.split('/').pop());

  const stage = outlet.querySelector('[data-pdp-stage]');
  const thumbs = outlet.querySelector('[data-pdp-thumbs]');
  if (stage && thumbs && item) {
    thumbs.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-view]');
      if (!btn) return;
      thumbs
        .querySelectorAll('[data-view]')
        .forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      const svg = stage.querySelector('svg');
      if (svg) svg.remove();
      stage.insertAdjacentHTML('beforeend', garmentSVG(item, { view: btn.dataset.view }));
    });
  }

  outlet.querySelector('[data-reserve]')?.addEventListener('click', () => {
    toast(`${item?.name || 'Piece'} held for 20 minutes`);
  });
  outlet.querySelector('[data-notify]')?.addEventListener('click', () => {
    toast('You’ll be emailed when the drop opens');
  });
}

function missingItem(id) {
  return `
  <section class="section" style="padding-top:calc(var(--header-h) + 5rem)">
    <div class="wrap empty-state">
      <p class="eyebrow">Not in the archive</p>
      <h1 class="display" style="font-size:clamp(2.2rem,5vw,4rem)">“${id}” isn’t a catalogue number</h1>
      <p class="lede" style="text-align:center">
        Pieces are one of one — if it sold, it may have been retired from the index.
      </p>
      <a class="btn btn--solid" href="/archive" data-magnetic>Browse the archive</a>
    </div>
  </section>`;
}
