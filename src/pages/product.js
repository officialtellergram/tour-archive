import { getItem, getCollection, itemsIn, itemStatus, isAvailable, featuredEvent, dateRange } from '../data/store.js';
import { garmentSVG } from '../components/garment.js';
import { productCard, breadcrumb, money, plateTag, plateMedia, sectionHead, mediaURL, escapeHtml, isPlaceholder } from '../components/ui.js';
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
    return `<a class="btn btn--ghost" href="mailto:tourarchive.help@gmail.com?subject=${encodeURIComponent(
      `${item.name} (${item.id})`
    )}">Ask about this piece</a>`;
  }
  return `<a class="btn btn--ghost" href="${item.market.url}" target="_blank" rel="noopener">
    ${item.syndicated ? 'View listing' : 'Comparables'} ↗
  </a>`;
}

/**
 * PDP media block — the stage and its thumb rail. Exported pure so the render
 * smoke can hold each state to the leak checks directly:
 *   photos.length > 1  → photo stage + swappable thumb rail (our own eBay carousel, archived)
 *   photos.length <= 1 → the single hero photograph, exactly as before
 *   no photo at all    → the drawn views, exactly as before
 */
export function pdpMedia(item) {
  const photos = Array.isArray(item.photos) ? item.photos : [];

  if (photos.length > 1) {
    const alt = String(item.name).replace(/"/g, '&quot;');
    return `
        <div class="pdp-media" data-reveal>
          <div class="plate plate--lg plate--photo" data-pdp-stage>
            ${plateTag(item)}
            <img class="plate-photo" src="${mediaURL(photos[0])}"
              alt="${alt} — view 1 of ${photos.length}" />
            <button class="pdp-arrow pdp-arrow--prev" data-step="-1" aria-label="Previous photo">&lsaquo;</button>
            <button class="pdp-arrow pdp-arrow--next" data-step="1" aria-label="Next photo">&rsaquo;</button>
          </div>
          <div class="pdp-thumbs pdp-thumbs--photos" data-pdp-thumbs>
            ${photos
              .map(
                (p, i) => `
              <button class="plate plate--photo" data-idx="${i}" aria-pressed="${i === 0}">
                <img class="plate-photo" src="${mediaURL(p)}"
                  alt="${alt} — view ${i + 1} of ${photos.length}" loading="lazy" />
              </button>`
              )
              .join('')}
          </div>
        </div>`;
  }

  const views = ['front', 'detail', 'flat'];
  return `
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
        </div>`;
}

/**
 * The cofounder's eBay listing copy, verbatim from the archived pull —
 * plain-text paragraphs in item.description, escaped again at render (the
 * text originated on a remote page; the manifest contract is belt, this is
 * braces). Exported pure so the render smoke holds it to the escaping pins
 * directly. Sold pieces render it unchanged: it is archive record, like the
 * carousel. Returns '' when empty — never an empty wrapper, or every
 * undescribed PDP would grow a phantom grid-gap row.
 *
 * DISPLAY-STRIPPED from the PDP (19 Aug 2026): the house story carries the
 * page and the listing copy read as clutter beside it. Data and component
 * stay intact — restoring is one line in product().
 */
export function pdpDescription(item) {
  const paras = Array.isArray(item.description) ? item.description : [];
  if (!paras.length) return '';
  const label =
    item.channel === 'ebay' || item.channel === 'depop'
      ? `From the ${channelName(item)} listing`
      : 'From the original listing';
  return `
          <div class="pdp-listing-desc" style="display:grid;gap:.6rem">
            <p class="eyebrow">${label}</p>
            ${paras
              .map((d) => `<p style="color:var(--ink-soft);font-weight:300;margin:0">${escapeHtml(d)}</p>`)
              .join('')}
          </div>`;
}

/**
 * PDP header — eyebrow, title, meta line. Placeholder-shaped segments
 * ('See listing', 'See photos', '—') are dropped, never shown; an all-
 * placeholder meta line omits its element entirely. Exported pure for the
 * render smoke. Keep the param named `coll` — the collection href template
 * must stay ${coll.id} for the audit's link classifier.
 */
export function pdpHeader(item, coll = null) {
  const eyebrow = [
    item.brand,
    ...(isPlaceholder(item.year) ? [] : [item.year]),
    ...(coll ? [`<a href="/collections/${coll.id}" style="color:var(--brass)">${coll.name}</a>`] : []),
  ].join(' · ');
  const meta = [
    ...(isPlaceholder(item.colorName) ? [] : [escapeHtml(item.colorName)]),
    ...(isPlaceholder(item.condition) ? [] : [escapeHtml(item.condition)]),
    ...(isPlaceholder(item.size) ? [] : [`Size ${escapeHtml(item.size)}`]),
  ].join(' · ');
  return `
          <div>
            <p class="eyebrow">${eyebrow}</p>
            <h1 class="display" style="font-size:clamp(2rem,3.6vw,3.4rem);margin:.6rem 0">
              ${item.name}
            </h1>
            ${meta ? `<p class="eyebrow eyebrow--brass">${meta}</p>` : ''}
          </div>`;
}

/** eBay's About-this-item, COMPACTED for display: Size, then Brand, then
 *  measurements — any row whose VALUE is unit-shaped ("26 in", "76 cm"),
 *  whatever eBay titles the key. The value rule, not a key list, is the
 *  gate on purpose: a measurement-titled key holding a style descriptor
 *  ("Sleeve Length: Long Sleeve") is details noise and stays out. The full
 *  sheet stays archived in the manifest; this is a display filter, not a
 *  data cut. Measurement rows keep their listing order; Condition already
 *  lives in the header meta line. Keys AND values are remote text: both
 *  pipe through escapeHtml. Sold pieces render it unchanged — archive
 *  record, like the description. Returns '' when nothing survives — never
 *  an empty wrapper (phantom grid-gap row).
 *  TEXT-ONLY: no hrefs ever (the audit link classifier never sees output). */
const SPEC_UNIT_VALUE_RX = /^\d+(?:\.\d+)?\s*(?:in|cm|")\.?$/i;

export function pdpSpecifics(item) {
  const specs = item.specifics;
  const all =
    specs && typeof specs === 'object' && !Array.isArray(specs) ? Object.entries(specs) : [];
  const exact = (name) => all.filter(([k]) => String(k).trim().toLowerCase() === name);
  const rows = [
    ...exact('size'),
    ...exact('brand'),
    ...all.filter(
      ([k, v]) =>
        !['size', 'brand'].includes(String(k).trim().toLowerCase()) &&
        SPEC_UNIT_VALUE_RX.test(String(v ?? '').trim())
    ),
  ];
  if (!rows.length) return '';
  return `
          <div class="pdp-specs" style="display:grid;gap:.6rem">
            <p class="eyebrow">About this piece</p>
            <table class="spec-table">
              ${rows.map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v ?? '')}</td></tr>`).join('')}
            </table>
          </div>`;
}

/**
 * The sizing accordion. Three states: measurements exist → the flat table
 * (minus the Labelled size/Condition rows once specifics render them);
 * no measurements + specifics → '' (the placeholder rows WERE the leak, and
 * measurements prose lives in the pulled eBay description); no specifics →
 * byte-faithful to the original markup, ask-us note included.
 */
export function pdpSizing(item) {
  const meas = Object.entries(item.measurements || {});
  const hasSpecs =
    !!item.specifics && typeof item.specifics === 'object' && !Array.isArray(item.specifics) &&
    Object.keys(item.specifics).length > 0;
  if (!meas.length && hasSpecs) return '';
  const fixedRows = hasSpecs
    ? ''
    : `
                  <tr><th>Labelled size</th><td>${item.size}</td></tr>
                  <tr><th>Condition</th><td>${item.condition}</td></tr>`;
  return `
            <div class="accordion-item is-open">
              <button class="accordion-trigger">${
                meas.length ? 'Measurements, flat' : 'Sizing &amp; condition'
              } <i>+</i></button>
              <div class="accordion-panel"><div>
                <table class="spec-table">
                  ${meas.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}${fixedRows}
                </table>
                ${
                  meas.length
                    ? ''
                    : `<p style="margin:.9rem 0 0;color:var(--ink-faint);font-size:.9rem">
                        Flat measurements are taken before shipping — ask and we'll send them same day.
                      </p>`
                }
              </div></div>
            </div>`;
}

export function product({ id }) {
  const item = getItem(id);
  if (!item) return missingItem(id);

  const coll = getCollection(item.collection);
  const related = itemsIn(item.collection).filter((i) => i.id !== item.id).slice(0, 4);

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
        ${pdpMedia(item)}

        <!-- info -->
        <div class="pdp-info" data-reveal data-reveal-delay="0.08">
          ${pdpHeader(item, coll)}

          <p style="color:var(--ink-soft);font-weight:300;margin:0">${item.story}</p>
          ${pdpSpecifics(item)}

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
            ${pdpSizing(item)}
            <div class="accordion-item">
              <button class="accordion-trigger">Provenance <i>+</i></button>
              <div class="accordion-panel"><div>
                <p style="color:var(--ink-soft);font-weight:300;margin:0 0 1rem">
                  Catalogued under ${coll ? coll.name : 'the archive'}${
    coll ? ` — ${coll.place}, ${coll.years}` : ''
  }. Dated from label construction and fibre content; read our
                  <a href="/mission" style="border-bottom:1px solid var(--rule-strong)">mission</a>.
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
  if (stage && item) {
    // One frame-setter shared by the thumb rail and the stage arrows: swap
    // src on the existing stage img — never insert a second one — and keep
    // the pressed thumb in step. Index wraps in both directions.
    const photos = Array.isArray(item.photos) ? item.photos : [];
    let cur = 0;
    const showFrame = (i) => {
      const img = stage.querySelector('.plate-photo');
      if (!photos.length || !img) return;
      cur = ((i % photos.length) + photos.length) % photos.length;
      img.src = mediaURL(photos[cur]);
      img.alt = `${item.name} — view ${cur + 1} of ${photos.length}`;
      thumbs
        ?.querySelectorAll('[data-idx]')
        .forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.idx) === cur)));
    };

    stage.addEventListener('click', (e) => {
      const arrow = e.target.closest('[data-step]');
      if (arrow) showFrame(cur + Number(arrow.dataset.step));
    });

    thumbs?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-view], [data-idx]');
      if (!btn) return;
      if (btn.dataset.view) {
        thumbs
          .querySelectorAll('[data-view]')
          .forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
        const svg = stage.querySelector('svg');
        if (svg) svg.remove();
        stage.insertAdjacentHTML('beforeend', garmentSVG(item, { view: btn.dataset.view }));
        return;
      }
      showFrame(Number(btn.dataset.idx));
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
