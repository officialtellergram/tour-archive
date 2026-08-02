import {
  BRAND,
  collections,
  items,
  journal,
  isAvailable,
  itemsIn,
  featuredCollection,
  daysUntil,
  dateRange,
  BASIC_STOCK,
} from '../data/store.js';
import { productCard, collectionTile, marquee, sectionHead } from '../components/ui.js';

const BASE_URL = (import.meta.env?.BASE_URL || '/').replace(/\/*$/, '/');

/** Phase-aware status line for the featured event. */
function eventStatus(event) {
  switch (event.phase) {
    case 'live':
      return { chip: 'Now open', line: 'Tournament week. The drop is open — one of each, while it lasts.' };
    case 'closing':
      return { chip: 'Final days', line: 'The trophy is handed over; the drop closes shortly.' };
    case 'past':
      return { chip: 'Closed', line: 'This drop has closed. The next event is on the calendar.' };
    default: {
      const days = daysUntil(event);
      return {
        chip: `Opens in ${days} day${days === 1 ? '' : 's'}`,
        line: 'Pieces are being photographed and catalogued now. Register below for first look.',
      };
    }
  }
}

export function home() {
  const featured = featuredCollection();
  const stock = items().filter(isAvailable);
  const files = collections().filter(
    (c) => c.status === 'archived' && c.id !== BASIC_STOCK
  );

  const ev = featured?.event;
  const coll = featured?.collection;
  const status = ev ? eventStatus(ev) : null;
  const drop = coll ? itemsIn(coll.id).filter(isAvailable) : [];

  return `
  <section class="hero" data-hero>
    <div class="hero-bg"></div>
    <div class="wrap hero-inner">
      <img class="hero-logo" src="${BASE_URL}brand/logo.png" alt="Tour Archive" data-hero-cta />
      ${
        ev && coll
          ? `
      <p class="eyebrow eyebrow--brass" data-hero-meta>
        <span>${coll.drop} · ${ev.venue} · ${dateRange(ev)}</span>
      </p>
      <h1 class="display">
        <span class="line-mask"><span>The Tour</span></span>
        <span class="line-mask"><span><em>Championship</em>.</span></span>
      </h1>
      <p class="lede" data-hero-cta style="text-align:center">
        ${coll.heroLine}
      </p>
      <div class="hero-meta" data-hero-meta>
        <span>Status <b>${status.chip}</b></span>
        <span>Venue <b>East Lake, Atlanta</b></span>
        <span>Field <b>Final 30</b></span>
        <span>Every piece <b>1 of 1</b></span>
      </div>
      <div style="display:flex;gap:.85rem;flex-wrap:wrap;justify-content:center" data-hero-cta>
        <a class="btn btn--solid" href="/collections/${coll.id}" data-magnetic>
          Preview ${coll.drop}
        </a>
        <a class="btn" href="/archive?filter=available" data-magnetic>In the shop now</a>
      </div>
      <p class="eyebrow" data-hero-cta style="max-width:52ch;text-align:center;line-height:1.8">
        ${status.line}
      </p>`
          : `
      <h1 class="display">
        <span class="line-mask"><span>Vintage golf,</span></span>
        <span class="line-mask"><span>sourced by the</span></span>
        <span class="line-mask"><span><em>tournament</em>.</span></span>
      </h1>
      <p class="lede" data-hero-cta style="text-align:center">${BRAND.blurb}</p>`
      }
    </div>
    <div class="scroll-cue" aria-hidden="true"><i></i>Scroll</div>
  </section>

  ${marquee([
    'Drop No. 01 — The Tour Championship',
    'East Lake, Atlanta',
    'One of one, always',
    'Photographed in house',
    'Virginia thrift &amp; estate sourcing',
    'Global submissions welcome',
  ])}

  <!-- ============ IN THE SHOP NOW ============ -->
  <section class="section">
    <div class="wrap">
      ${sectionHead({
        eyebrow: stock.length ? `${stock.length} piece${stock.length === 1 ? '' : 's'} available` : 'The shop',
        title: 'In the shop now',
        link: { href: '/archive', label: 'The full archive' },
      })}
      ${
        stock.length
          ? `<div class="grid-products" data-stagger>${stock.map(productCard).join('')}</div>`
          : `<div class="empty-state" style="border-bottom:0">
               <p class="eyebrow">Between listings</p>
               <h3 class="display">The next pieces are being photographed</h3>
               <p class="lede" style="text-align:center">
                 Stock is photographed in house and listed one of one. Register for the drop
                 notice and you'll see them first.
               </p>
             </div>`
      }
    </div>
  </section>

  <!-- ============ FEATURED DROP ============ -->
  ${
    ev && coll
      ? `
  <section class="section" style="background:var(--parchment-deep)">
    <div class="wrap">
      ${sectionHead({
        eyebrow: `${coll.drop} · ${status.chip}`,
        title: coll.name,
        link: { href: `/collections/${coll.id}`, label: 'Open the collection' },
      })}
      <div class="split" style="align-items:start">
        <div data-reveal>
          <p class="lede">${coll.summary}</p>
          <p style="color:var(--ink-soft);font-weight:300;max-width:52ch">${coll.essay[0]}</p>
          <ul class="facts" style="margin-top:2rem">
            ${coll.facts.map((f) => `<li><span>${f.k}</span><b>${f.v}</b></li>`).join('')}
            <li><span>Dates</span><b>${dateRange(ev)}</b></li>
          </ul>
        </div>
        <div data-reveal data-reveal-delay="0.08">
          ${
            drop.length
              ? `<div class="grid-products" data-stagger style="grid-template-columns:repeat(2,minmax(0,1fr))">
                   ${drop.slice(0, 4).map(productCard).join('')}
                 </div>`
              : `<div class="empty-state" style="border-bottom:0;padding-top:1rem">
                   <p class="eyebrow">${status.chip}</p>
                   <h3 class="display" style="font-size:clamp(1.6rem,2.6vw,2.4rem)">
                     The wardrobe is being assembled
                   </h3>
                   <p style="color:var(--ink-soft);font-weight:300;max-width:44ch;text-align:center">
                     ${status.line}
                   </p>
                   <a class="btn btn--solid" href="/collections/${coll.id}" data-magnetic>
                     Read the ${coll.name} file
                   </a>
                 </div>`
          }
        </div>
      </div>
    </div>
  </section>`
      : ''
  }

  <!-- ============ THE FILES ============ -->
  <section class="section">
    <div class="wrap">
      ${sectionHead({
        eyebrow: 'The research behind the drops',
        title: 'The Files',
        link: { href: '/collections', label: 'All collections' },
      })}
      <p class="lede" data-reveal style="margin-bottom:clamp(2rem,4vw,3rem)">
        Every drop begins as a file — the championship, the course, the wardrobe that
        belongs to it. Six are open now, feeding the sourcing list for future drops.
      </p>
      <div class="grid-collections" data-stagger>
        ${files.map(collectionTile).join('')}
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
            purchase. Everything we list is dated, graded honestly, and photographed as found.
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
  </section>`;
}
