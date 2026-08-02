import { collections, itemsIn, isAvailable, getCollection } from '../data/store.js';
import { collectionTile, productCard, breadcrumb, sectionHead, marquee } from '../components/ui.js';

/* ------------------------------------------------------------------ */
/* /collections — index                                                */
/* ------------------------------------------------------------------ */

export function collectionsIndex() {
  const order = { live: 0, upcoming: 1, archived: 2 };
  const sorted = [...collections()].sort((a, b) => order[a.status] - order[b.status]);

  return `
  <section class="section" style="padding-top:calc(var(--header-h) + 4rem)">
    <div class="wrap">
      ${breadcrumb([{ label: 'Home', href: '/' }, { label: 'Collections' }])}
      <div class="coll-hero-grid" data-hero>
        <div>
          <p class="eyebrow" data-hero-meta><span>${collections().length} drops to date · ${
    collections().filter((c) => c.status === 'live').length
  } open now</span></p>
          <h1 class="display" style="margin:.6rem 0 1.4rem;font-size:clamp(3rem,8vw,7.5rem)">
            <span class="line-mask"><span>The Collections</span></span>
          </h1>
          <p class="lede" data-hero-cta>
            Every piece we buy is placed into the championship era it came from —
            ${collections().length} groupings, released as drops. Live, archived, and one still to open.
          </p>
        </div>
        <div data-hero-cta>
          <p class="eyebrow" style="margin-bottom:.9rem">Drop register</p>
          <ul class="facts facts--links">
            ${sorted
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

  ${marquee(collections().map((c) => `${c.drop} — ${c.name} · ${c.place}`))}

  <section class="section">
    <div class="wrap">
      <div class="grid-collections" data-stagger>
        ${sorted.map(collectionTile).join('')}
      </div>
    </div>
  </section>`;
}

/* ------------------------------------------------------------------ */
/* /collections/:id — detail                                           */
/* ------------------------------------------------------------------ */

export function collectionDetail({ id }) {
  const c = getCollection(id);
  if (!c) return missingCollection(id);

  const stock = itemsIn(c.id);
  const live = stock.filter(isAvailable).length;
  const idx = collections().findIndex((x) => x.id === c.id);
  const next = collections()[(idx + 1) % collections().length];
  const prev = collections()[(idx - 1 + collections().length) % collections().length];

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
              <li><span>In this drop</span><b>${stock.length} pieces</b></li>
              <li><span>Status</span><b>${live ? `${live} available` : 'Fully archived'}</b></li>
            </ul>
          </div>
        </div>
      </div>
    </section>

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
          </div>
        </div>
      </div>
    </section>

    <section class="section" id="pieces">
      <div class="wrap">
        ${sectionHead({
          eyebrow: `${stock.length} pieces · one of each`,
          title: 'The pieces',
          link: { href: '/archive', label: 'Search everything' },
        })}
        <div class="grid-products" data-stagger>
          ${stock.map(productCard).join('')}
        </div>
      </div>
    </section>

    <section class="section--tight section" style="border-top:1px solid var(--rule)">
      <div class="wrap" style="display:flex;justify-content:space-between;gap:2rem;flex-wrap:wrap">
        <a class="text-link" href="/collections/${prev.id}"><span>←</span> ${prev.name}</a>
        <a class="text-link" href="/collections">All collections</a>
        <a class="text-link" href="/collections/${next.id}">${next.name} <span>→</span></a>
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
