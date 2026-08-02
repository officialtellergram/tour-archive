import { BRAND, collections, items, journal, isAvailable, itemsIn } from '../data/store.js';
import { houseCrest } from '../components/garment.js';
import { productCard, collectionTile, marquee, sectionHead, money } from '../components/ui.js';

export function home() {
  const live = collections().filter((c) => c.status === 'live');
  const featured = live[0];
  const featuredStock = itemsIn(featured.id).slice(0, 4);
  const newest = items().filter(isAvailable).slice(0, 8);
  const availableCount = items().filter(isAvailable).length;

  return `
  <section class="hero" data-hero>
    <div class="hero-bg"></div>
    <div class="wrap hero-inner">
      ${houseCrest()}
      <h1 class="display">
        <span class="line-mask"><span>Vintage golf,</span></span>
        <span class="line-mask"><span>sourced by the</span></span>
        <span class="line-mask"><span><em>tournament</em>.</span></span>
      </h1>
      <p class="lede" data-hero-cta style="text-align:center">
        ${BRAND.blurb}
      </p>
      <div class="hero-meta" data-hero-meta>
        <span>Collections <b data-count="${collections().length}">${collections().length}</b></span>
        <span>Catalogued <b data-count="${items().length}">${items().length}</b></span>
        <span>Available now <b data-count="${availableCount}">${availableCount}</b></span>
        <span>Every piece <b>1 of 1</b></span>
      </div>
      <div style="display:flex;gap:.85rem;flex-wrap:wrap;justify-content:center" data-hero-cta>
        <a class="btn btn--solid" href="/collections/${featured.id}" data-magnetic>
          ${featured.drop} — ${featured.name}
        </a>
        <a class="btn" href="/archive" data-magnetic>Browse the archive</a>
      </div>
    </div>
    <div class="scroll-cue" aria-hidden="true"><i></i>Scroll</div>
  </section>

  ${marquee([
    'One of one',
    'Authenticated by hand',
    'Virginia thrift &amp; estate sourcing',
    'Global submissions welcome',
    'New drop monthly',
    'No restocks',
    'Free returns within 14 days',
  ])}

  <!-- ============ FEATURED DROP ============ -->
  <section class="section">
    <div class="wrap">
      ${sectionHead({
        eyebrow: `${featured.drop} · ${featured.statusLabel}`,
        title: featured.name,
        link: { href: `/collections/${featured.id}`, label: 'Open collection' },
      })}
      <div class="split" style="align-items:start">
        <div data-reveal>
          <p class="lede">${featured.heroLine}</p>
          <p style="color:var(--ink-soft);font-weight:300;max-width:52ch">${featured.essay[0]}</p>
          <ul class="facts" style="margin-top:2rem">
            ${featured.facts
              .map((f) => `<li><span>${f.k}</span><b>${f.v}</b></li>`)
              .join('')}
          </ul>
        </div>
        <div class="grid-products" data-stagger style="grid-template-columns:repeat(2,minmax(0,1fr))">
          ${featuredStock.map(productCard).join('')}
        </div>
      </div>
    </div>
  </section>

  <!-- ============ COLLECTIONS ============ -->
  <section class="section" style="background:var(--parchment-deep)">
    <div class="wrap">
      ${sectionHead({
        eyebrow: 'Grouped by championship',
        title: 'The Collections',
        link: { href: '/collections', label: 'All collections' },
      })}
      <div class="grid-collections" data-stagger>
        ${collections().map(collectionTile).join('')}
      </div>
    </div>
  </section>

  <!-- ============ NEW ARRIVALS ============ -->
  <section class="section">
    <div class="wrap">
      ${sectionHead({
        eyebrow: 'Available now',
        title: 'Recently catalogued',
        link: { href: '/archive?filter=available', label: 'Everything available' },
      })}
      <div class="grid-products" data-stagger>
        ${newest.map(productCard).join('')}
      </div>
    </div>
  </section>

  <!-- ============ METHOD ============ -->
  <section class="section" style="background:var(--green);color:var(--parchment)">
    <div class="wrap">
      <div class="split">
        <div data-reveal>
          <p class="eyebrow eyebrow--brass">Our method</p>
          <h2 class="display" style="margin:.6rem 0 1.4rem">Three agreements,<br />or we don't buy it.</h2>
          <p style="color:rgba(244,240,230,.74);font-weight:300;max-width:48ch">
            Label, construction, and the way a garment has aged. Two out of three is not a
            purchase. Everything we list is dated, measured flat, and photographed as found.
          </p>
          <a class="btn" href="/method" style="border-color:rgba(244,240,230,.4);color:var(--parchment);margin-top:1.6rem" data-magnetic>
            Read the standard
          </a>
        </div>
        <ol class="process-list" style="border-color:rgba(244,240,230,.2)" data-reveal data-reveal-delay="0.1">
          <li style="border-color:rgba(244,240,230,.2)">
            <div><h4 style="color:var(--parchment)">Source</h4>
            <p style="color:rgba(244,240,230,.62)">Virginia thrift and estate sourcing, worked on foot — then global submissions, appraised and bought outright from anywhere in the world.</p></div>
          </li>
          <li style="border-color:rgba(244,240,230,.2)">
            <div><h4 style="color:var(--parchment)">Authenticate</h4>
            <p style="color:rgba(244,240,230,.62)">Neck label, fibre content, union marks and construction are cross-checked before anything is catalogued.</p></div>
          </li>
          <li style="border-color:rgba(244,240,230,.2)">
            <div><h4 style="color:var(--parchment)">Attribute</h4>
            <p style="color:rgba(244,240,230,.62)">Each piece is placed into the championship era it belongs to, with the history written alongside it.</p></div>
          </li>
        </ol>
      </div>
    </div>
  </section>

  <!-- ============ JOURNAL ============ -->
  <section class="section">
    <div class="wrap">
      ${sectionHead({
        eyebrow: 'Journal',
        title: 'Field notes',
        link: { href: '/journal', label: 'All entries' },
      })}
      <div class="journal-list">
        ${journal
          .map(
            (j) => `
          <a class="journal-row" href="/journal/${j.id}" data-reveal data-cursor-text="Read">
            <span class="eyebrow">${j.kicker}</span>
            <h3>${j.title}</h3>
            <p>${j.excerpt}</p>
            <span class="eyebrow">${j.date}</span>
          </a>`
          )
          .join('')}
      </div>
    </div>
  </section>

  <!-- ============ NEXT DROP ============ -->
  <section class="section--tight section" style="border-top:1px solid var(--rule)">
    <div class="wrap" style="text-align:center;display:grid;gap:1.2rem;justify-items:center">
      <p class="eyebrow">${collections().find((c) => c.status === 'upcoming')?.drop || 'Next drop'}</p>
      <h2 class="display">${collections().find((c) => c.status === 'upcoming')?.name || 'Next drop'}</h2>
      <p class="lede" style="text-align:center">
        ${collections().find((c) => c.status === 'upcoming')?.heroLine || ''}
        Six pieces, one of each. Opens 14 August at nine.
      </p>
      <a class="btn btn--solid" href="/collections/the-amateur-line" data-magnetic>Preview the drop</a>
    </div>
  </section>`;
}
