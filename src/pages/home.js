import {
  BRAND,
  items,
  isAvailable,
  itemsIn,
  featuredCollection,
  getCollection,
  daysUntil,
} from '../data/store.js';
import { productCard, collectionTile, marquee, sectionHead } from '../components/ui.js';

const BASE_URL = (import.meta.env?.BASE_URL || '/').replace(/\/*$/, '/');

/**
 * The Tour Championship backdrop plates, in rotation order. Slide 1 is the
 * only plate near-native height in the hero slot, so it sits sharpest under
 * the display text; the format outlier ran last until it became a JPEG.
 * Paths are public/-relative; audit pins each to a file on disk, the 4-count,
 * the ?v stamp (Pages serves public/ unhashed behind a 600s cache), and the
 * index.html preload's agreement with slide 1.
 */
const HERO_BACKDROPS = [
  'hero/east-lake-seventh.jpg?v=1',
  'hero/east-lake-aerial.jpg?v=1',
  'hero/fleetwood-tour-championship.jpg?v=5',
  'hero/tour-championship-04.jpg?v=2',
];

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
  // Sold pieces STAY on the page, marked — the record of demand is the point.
  // Counts still speak to availability.
  const stock = items();
  const available = stock.filter(isAvailable);
  const tc = getCollection('tour-championship-2026');

  const ev = featured?.event;
  const coll = featured?.collection;
  const status = ev ? eventStatus(ev) : null;
  const drop = coll ? itemsIn(coll.id) : [];

  /* The drop pane LEADS the page while its window is open (live/closing);
     outside the window the shop leads and the drop trails as a preview. */
  const dropFirst = !!ev && (ev.phase === 'live' || ev.phase === 'closing');

  const shopSection = `
  <!-- ============ IN THE SHOP NOW ============ -->
  <section class="section">
    <div class="wrap">
      ${sectionHead({
        eyebrow: available.length ? `${available.length} piece${available.length === 1 ? '' : 's'} available` : 'The shop',
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
  </section>`;

  /* Landing pane is a SHOWCASE — the full drop in the same full-width grid
     as the shop pane. Tournament details and Chal's essay both live on the
     collection page; here the pieces carry it. */
  const featuredSection =
    ev && coll
      ? `
  <!-- ============ FEATURED DROP ============ -->
  <section class="section" style="background:var(--parchment-deep)">
    <div class="wrap">
      ${sectionHead({
        eyebrow: `${coll.drop} · ${status.chip}`,
        title: coll.name,
        link: { href: `/collections/${coll.id}`, label: 'Open the collection' },
      })}
      ${
        drop.length
          ? `<div class="grid-products" data-stagger>${drop.map(productCard).join('')}</div>`
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
  </section>`
      : '';

  return `
  <section class="hero" data-hero>
    <div class="hero-bg" data-hero-backdrop>
      ${HERO_BACKDROPS.map((p, i) =>
        i === 0
          ? `<img class="hero-slide is-on" src="${BASE_URL}${p}" alt="" aria-hidden="true"
              fetchpriority="high" decoding="async" />`
          : `<img class="hero-slide" data-src="${BASE_URL}${p}" alt="" aria-hidden="true"
              decoding="async" />`
      ).join('')}
    </div>
    <div class="wrap hero-inner">
      <img class="hero-logo" src="${BASE_URL}brand/logo.png?v=2" alt="Tour Archive" data-hero-cta />
      ${
        ev && coll
          ? `
      <p class="eyebrow" data-hero-lead style="color:var(--claret)">
        <span>${ev.phase === 'live' ? `${coll.drop} · Out Now` : coll.drop}</span>
      </p>
      <h1 class="display">
        <span class="line-mask"><span style="color:var(--navy)">The Tour</span></span>
        <span class="line-mask"><span><em>Championship</em><span style="color:var(--navy)">.</span></span></span>
      </h1>
      <p class="lede" data-hero-cta style="text-align:center;font-weight:500;color:var(--ink)">
        ${coll.heroLine}
      </p>
      <div class="hero-meta" data-hero-meta>
        <span>Status <b>${status.chip}</b></span>
        <span>Venue <b>East Lake, Atlanta</b></span>
      </div>
      <div style="display:flex;gap:.85rem;flex-wrap:wrap;justify-content:center" data-hero-cta>
        <a class="btn btn--solid" href="/collections/${coll.id}" data-magnetic>
          ${ev.phase === 'live' ? `Shop ${coll.drop}` : `Preview ${coll.drop}`}
        </a>
        ${ev.phase === 'live' ? '' : `<a class="btn" href="/archive?filter=available" data-magnetic>In the shop now</a>`}
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

  ${dropFirst ? featuredSection + shopSection : shopSection + featuredSection}

  <!-- ============ THE FILES ============ -->
  <section class="section">
    <div class="wrap">
      ${sectionHead({
        eyebrow: 'The research behind the drop',
        title: 'The Files',
        link: { href: '/collections', label: 'All collections' },
      })}
      <p class="lede" data-reveal style="margin-bottom:clamp(2rem,4vw,3rem)">
        Every drop begins as a file — the championship, the course, the wardrobe that
        belongs to it. The first file is open: East Lake, tournament week, one of one.
      </p>
      <div class="grid-collections" data-stagger>
        ${tc ? collectionTile(tc) : ''}
      </div>
    </div>
  </section>

  <!-- ============ MISSION ============ -->
  <section class="section" style="background:var(--navy);color:var(--parchment)">
    <div class="wrap">
      <div class="split">
        <div data-reveal>
          <p class="eyebrow eyebrow--brass">Our mission</p>
          <h2 class="display" style="margin:.6rem 0 1.4rem">Golf history,<br />kept in clothing.</h2>
          <p style="color:rgba(244,240,230,.74);font-weight:300;max-width:48ch">
            Golf keeps its history in trophies and scorecards. We keep it in the clothing —
            thrifted, authenticated and catalogued by the championship it belongs to, one
            piece of one, never restocked.
          </p>
          <a class="btn" href="/mission" style="border-color:rgba(244,240,230,.4);color:var(--parchment);margin-top:1.6rem" data-magnetic>
            Read the mission
          </a>
        </div>
        <ol class="process-list" style="border-color:rgba(244,240,230,.2)" data-reveal data-reveal-delay="0.1">
          <li style="border-color:rgba(244,240,230,.2)">
            <div><h4 style="color:var(--parchment)">Sourced by tournament</h4>
            <p style="color:rgba(244,240,230,.62)">Every piece is filed under the championship era it came from — the course, the week, the wardrobe that belongs to it.</p></div>
          </li>
          <li style="border-color:rgba(244,240,230,.2)">
            <div><h4 style="color:var(--parchment)">One of one, always</h4>
            <p style="color:rgba(244,240,230,.62)">Real archival garments, dated and graded honestly, photographed as found. No reproductions, no restocks — when it is gone, it is gone.</p></div>
          </li>
          <li style="border-color:rgba(244,240,230,.2)">
            <div><h4 style="color:var(--parchment)">First drop: East Lake</h4>
            <p style="color:rgba(244,240,230,.62)">Drop No. 01 opens with the 2026 TOUR Championship — thirty players, Bobby Jones’s home club, 27 – 30 August.</p></div>
          </li>
        </ol>
      </div>
    </div>
  </section>`;
}
