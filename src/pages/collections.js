import {
  launchCollections,
  itemsIn,
  isAvailable,
  getCollection,
  featuredEvent,
  dateRange,
} from '../data/store.js';
import { collectionTile, productCard, breadcrumb, sectionHead, marquee } from '../components/ui.js';

/* ------------------------------------------------------------------ */
/* /collections — index                                                */
/* ------------------------------------------------------------------ */

export function collectionsIndex() {
  const launch = launchCollections();
  const ev = featuredEvent();
  const reel = launch.map((c) => `${c.drop} — ${c.name} · ${c.place}`);

  return `
  <section class="section" style="padding-top:calc(var(--header-h) + 4rem)">
    <div class="wrap">
      ${breadcrumb([{ label: 'Home', href: '/' }, { label: 'Collections' }])}
      <div class="coll-hero-grid" data-hero>
        <div>
          <p class="eyebrow" data-hero-meta><span>One drop · one open shelf</span></p>
          <h1 class="display" style="margin:.6rem 0 1.4rem;font-size:clamp(3rem,8vw,7.5rem)">
            <span class="line-mask"><span>The Collections</span></span>
          </h1>
          <p class="lede" data-hero-cta>
            Every piece we buy is placed into the championship era it came from. Drop No. 01
            opens ${ev ? dateRange(ev) : 'tournament week'} at East Lake, and Basic Stock —
            the open shelf — is listed continuously as pieces are photographed.
          </p>
        </div>
        <div data-hero-cta>
          <p class="eyebrow" style="margin-bottom:.9rem">Drop register</p>
          <ul class="facts facts--links">
            ${launch
              .map(
                (c) => `<li><a href="/collections/${c.id}">
                  <span class="status-dot" data-status="${c.status}">${c.drop}</span>
                  <b>${c.name}</b>
                </a></li>`
              )
              .join('')}
          </ul>
        </div>
      </div>
    </div>
  </section>

  ${marquee([...reel, ...reel])}

  <section class="section">
    <div class="wrap">
      <div class="grid-collections" data-stagger>
        ${launch.map(collectionTile).join('')}
      </div>
    </div>
  </section>`;
}

/* ------------------------------------------------------------------ */
/* /collections/:id — detail                                           */
/* ------------------------------------------------------------------ */

/**
 * The status rows under the fact list. With zero stock, what they say depends
 * entirely on WHY there is zero stock: an upcoming drop is being assembled, an
 * archive file is research. The old `live-count : 'Fully archived'` ternary
 * told visitors the first drop was already over — the worst possible copy on
 * the flagship page.
 */
function statusRows(c, stock, live) {
  if (stock.length) {
    return `<li><span>In this collection</span><b>${stock.length} piece${
      stock.length === 1 ? '' : 's'
    }</b></li>
    <li><span>Status</span><b>${live ? `${live} available` : 'Fully archived'}</b></li>`;
  }
  if (c.status === 'upcoming') {
    return `<li><span>Drop opens</span><b>Tournament week</b></li>
    <li><span>Status</span><b>Wardrobe in assembly</b></li>`;
  }
  if (c.status === 'live') {
    return `<li><span>Type</span><b>Open stock</b></li>
    <li><span>Status</span><b>Listed continuously</b></li>`;
  }
  return `<li><span>Type</span><b>Research file</b></li>
  <li><span>Status</span><b>Feeding the sourcing list</b></li>`;
}

export function collectionDetail({ id }) {
  const c = getCollection(id);
  if (!c) return missingCollection(id);

  const stock = itemsIn(c.id);
  const live = stock.filter(isAvailable).length;
  // With two launch collections visible, prev === next — one cross-link, not
  // two arrows to the same page. Deep-linked research files cross-link to the drop.
  const launch = launchCollections();
  const coll = launch.find((x) => x.id !== c.id) || launch[0] || null;

  return `
  <article>
    <section class="coll-hero" style="--accent:${c.accent}">
      <div class="coll-hero-tint" aria-hidden="true"></div>
      <div class="wrap" data-hero>
        ${breadcrumb([
          { label: 'Home', href: '/' },
          { label: 'Collections', href: '/collections' },
          { label: c.name },
        ])}
        <div class="coll-hero-grid">
          <div>
            <p class="eyebrow" data-hero-meta>
              <span>${c.drop}</span> · <span>${c.place}</span> · <span>${c.years}</span>
            </p>
            <h1 class="display" style="margin:.8rem 0 1.2rem">
              <span class="line-mask"><span>${c.name}</span></span>
            </h1>
            <div class="palette-bar" data-hero-cta aria-label="Collection palette">
              ${c.palette.map((p) => `<i style="background:${p}"></i>`).join('')}
              <span class="eyebrow" style="margin-left:.9rem">${c.statusLabel} · ${c.releaseNote}</span>
            </div>
            <p class="lede" data-hero-cta style="margin-top:1.2rem">${c.heroLine}</p>
          </div>
          <div data-hero-cta>
            <ul class="facts">
              ${c.facts.map((f) => `<li><span>${f.k}</span><b>${f.v}</b></li>`).join('')}
              ${statusRows(c, stock, live)}
            </ul>
          </div>
        </div>
      </div>
    </section>

    ${
      stock.length
        ? `<section class="section" id="pieces">
            <div class="wrap">
              ${sectionHead({
                eyebrow: `${stock.length} piece${stock.length === 1 ? '' : 's'} · one of each`,
                title: 'The pieces',
                link: { href: '/archive', label: 'Search everything' },
              })}
              <div class="grid-products" data-stagger>
                ${stock.map(productCard).join('')}
              </div>
            </div>
          </section>`
        : `<section class="section" id="pieces">
            <div class="wrap">
              <div class="empty-state" style="border-bottom:0">
                <p class="eyebrow">${
                  c.status === 'upcoming'
                    ? 'Wardrobe in assembly'
                    : c.status === 'live'
                    ? 'Open stock'
                    : 'Research file'
                }</p>
                <h3 class="display" style="font-size:clamp(1.8rem,3vw,2.8rem)">
                  ${
                    c.status === 'upcoming'
                      ? 'The pieces arrive with the drop'
                      : c.status === 'live'
                      ? 'New stock is listed as it is photographed'
                      : 'This file feeds the sourcing list'
                  }
                </h3>
                <p class="lede" style="text-align:center">
                  ${
                    c.status === 'upcoming'
                      ? 'Pieces are photographed and catalogued as they are acquired — check the shop for what is already available.'
                      : c.status === 'live'
                      ? 'Pieces are photographed in house and syndicated to eBay and Depop as they are listed — the shop shows what is live right now.'
                      : 'When pieces surface that belong under this file, they are photographed, catalogued and listed in the shop.'
                  }
                </p>
                <div style="display:flex;gap:.75rem;flex-wrap:wrap;justify-content:center">
                  <a class="btn btn--solid" href="/archive?filter=available" data-magnetic>In the shop now</a>
                  <a class="btn" href="/sell" data-magnetic>Sell to the archive</a>
                </div>
              </div>
            </div>
          </section>`
    }

    <!-- The pieces lead; the history reads below them. -->
    <section class="section--tight section">
      <div class="wrap">
        <div class="essay-grid">
          <div class="sticky" data-reveal>
            <p class="eyebrow">The history</p>
            <h2 class="display" style="font-size:clamp(1.8rem,3vw,3rem);margin:.5rem 0 1.2rem">
              ${c.place}
            </h2>
            <p style="color:var(--ink-faint);font-size:.95rem;font-weight:300">${c.years}</p>
            ${
              c.sources?.length
                ? `<div style="margin-top:2rem;border-top:1px solid var(--rule);padding-top:1rem">
                     <p class="eyebrow" style="margin-bottom:.8rem">Sources</p>
                     ${c.sources
                       .map(
                         (s) =>
                           `<p style="margin:0 0 .6rem"><a class="text-link" href="${s.url}" target="_blank" rel="noopener">${s.label} <span>↗</span></a></p>`
                       )
                       .join('')}
                   </div>`
                : ''
            }
          </div>
          <div class="prose" data-reveal data-reveal-delay="0.08">
            ${c.essay.map((p) => `<p>${p}</p>`).join('')}
            ${
              c.essayBy
                ? `<p class="eyebrow" style="margin-top:2rem;padding-top:1rem;border-top:1px solid var(--rule)">
                     — ${c.essayBy}${c.essayDate ? ` · ${c.essayDate}` : ''}
                   </p>`
                : ''
            }
          </div>
        </div>
      </div>
    </section>

    <section class="section--tight section" style="border-top:1px solid var(--rule)">
      <div class="wrap" style="display:flex;justify-content:space-between;gap:2rem;flex-wrap:wrap">
        <a class="text-link" href="/collections">All collections</a>
        ${coll ? `<a class="text-link" href="/collections/${coll.id}">${coll.name} <span>→</span></a>` : ''}
      </div>
    </section>
  </article>`;
}

function missingCollection(id) {
  return `
  <section class="section" style="padding-top:calc(var(--header-h) + 5rem)">
    <div class="wrap empty-state">
      <p class="eyebrow">No such collection</p>
      <h1 class="display" style="font-size:clamp(2.2rem,5vw,4rem)">“${id}” isn’t in the archive</h1>
      <p class="lede" style="text-align:center">It may have been renamed. Here is everything we hold.</p>
      <a class="btn btn--solid" href="/collections" data-magnetic>View all collections</a>
    </div>
  </section>`;
}
