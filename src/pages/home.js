import {
  BRAND,
  items,
  isAvailable,
  itemsIn,
  featuredCollection,
  getCollection,
  launchCollections,
  daysUntil,
} from '../data/store.js';
import { productCard, collectionTile, marquee, sectionHead } from '../components/ui.js';

const BASE_URL = (import.meta.env?.BASE_URL || '/').replace(/\/*$/, '/');

/**
 * The landing backdrop plates, in rotation order — three Adobe Stock
 * Standard-licensed derivatives (asset IDs, licence record and the 'never
 * commit a master' rule: docs/tour-championship-2026.md § Licensed imagery).
 * Slide 1 is the only eager plate, the preload target and the reduced-motion
 * static, so the clubhouse leads. Slots are positional: app.css binds one drift
 * keyframe and, for slides 2-3, an object-position hook per nth-of-type slot —
 * reorder here and reorder those. Paths are public/-relative; audit pins each
 * to a file on disk, the 3-count, the ?v stamp (Pages serves public/ unhashed;
 * Cloudflare fronts /hero with a 4 h browser TTL, so a re-encode is a ?v bump
 * and a new image is a new filename), and index.html's preload agreement.
 */
/* Our own course photography (10 Sep 2026), built by scripts/hero-plates.py
   from the shared Drive folder. These replace the licensed Adobe plates: the
   Tour Championship is over, and shooting our own removes the licence
   surface that forced the 26 Aug swap entirely. Order is the rotation. */
const HERO_BACKDROPS = [
  'hero/ocean-hole.jpg?v=1',
  'hero/links-sky.jpg?v=1',
  'hero/cloud-over-bunker.jpg?v=1',
  'hero/sunset-water.jpg?v=1',
  'hero/cypress-green.jpg?v=1',
  'hero/golden-hour-fairway.jpg?v=1',
  'hero/dusk-pond.jpg?v=1',
  'hero/fairway-mackerel-sky.jpg?v=1',
  'hero/cloud-and-bridge.jpg?v=1',
  'hero/low-sun-fairway.jpg?v=1',
  'hero/flag-and-pond.jpg?v=1',
  'hero/hillside-clubhouse.jpg?v=1',
  'hero/dusk-coastline.jpg?v=1',
  'hero/sun-through-oaks.jpg?v=1',
  'hero/cart-path-pines.jpg?v=1',
  'hero/grey-sky-pond.jpg?v=1',
];

/** Phase-aware status line for the featured event. */
function eventStatus(event) {
  switch (event.phase) {
    case 'live':
      return { chip: 'Now open', line: 'Tournament week. The drop is open — one of each, while it lasts.' };
    case 'closing':
      return { chip: 'Final days', line: 'The trophy is handed over; the drop closes shortly.' };
    case 'past':
      // The drop's WINDOW is shut; its pieces are still one-of-one stock and
      // still buyable, so this must never read as "the shop is closed".
      return { chip: 'Drop closed', line: 'The championship is played. What remains of the drop is still one of one.' };
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

  /*
   * OFF SEASON. featuredEvent() never returns null — it falls back to the
   * most recently finished event so the page cannot go blank — which means
   * a finished championship would otherwise keep fronting the landing for
   * months, counting down to something already played. Once the window is
   * past, the hero, the marquee and the files pane stop being about one
   * tournament and become about the archive; the drop keeps a pane of its
   * own for as long as pieces remain. A new event in events.js flips all of
   * it back automatically — this is a phase, not a rewrite.
   */
  const eventLed = !!ev && ev.phase !== 'past';
  const dropLeft = drop.filter(isAvailable).length;

  const shopSection = `
  <!-- ============ IN THE SHOP NOW ============ -->
  <section class="section" id="shop">
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
        eyebrow: eventLed
          ? `${coll.drop} · ${status.chip}`
          : dropLeft
          ? `${coll.drop} · ${dropLeft} still available`
          : `${coll.drop} · Fully claimed`,
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
      <img class="hero-logo${eventLed ? '' : ' hero-logo--xl'}" src="${BASE_URL}brand/logo.png?v=2"
        alt="Tour Archive" ${eventLed ? 'data-hero-cta' : 'data-hero-lead'} />
      ${
        eventLed && coll
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
        <span class="line-mask"><span style="color:var(--navy)">Tour <em style="color:var(--claret)">Archive</em>.</span></span>
      </h1>
      <div style="display:flex;gap:.85rem;flex-wrap:wrap;justify-content:center" data-hero-cta>
        <a class="btn btn--solid" href="#shop" data-magnetic>See the inventory</a>
      </div>`
      }
    </div>
    <div class="scroll-cue" aria-hidden="true"><i></i>Scroll</div>
  </section>

  ${marquee(
    eventLed
      ? [
          `${coll ? coll.drop : 'Drop No. 01'} — ${coll ? coll.name : 'The Tour Championship'}`,
          'East Lake, Atlanta',
          'One of one, always',
          'Photographed in house',
          'Virginia thrift &amp; estate sourcing',
          'Global submissions welcome',
        ]
      : [
          'The archive is open',
          'One of one, always',
          'Photographed in house',
          'Sourced by championship',
          'Virginia thrift &amp; estate sourcing',
          'Global submissions welcome',
        ]
  )}

  ${dropFirst ? featuredSection + shopSection : shopSection + featuredSection}

  <!-- ============ THE FILES ============ -->
  <section class="section">
    <div class="wrap">
      ${sectionHead({
        eyebrow: eventLed ? 'The research behind the drop' : 'The research behind the archive',
        title: 'The Files',
        link: { href: '/collections', label: 'All collections' },
      })}
      <p class="lede" data-reveal style="margin-bottom:clamp(2rem,4vw,3rem)">
        ${
          eventLed
            ? 'Every drop begins as a file — the championship, the course, the wardrobe that belongs to it. The first file is open: East Lake, tournament week, one of one.'
            : 'Every drop begins as a file — the championship, the course, the wardrobe that belongs to it. Drop No. 01 is played out; the next files are being assembled course by course.'
        }
      </p>
      <div class="grid-collections" data-stagger>
        ${(eventLed ? [tc] : launchCollections()).filter(Boolean).map(collectionTile).join('')}
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
            <div><h4 style="color:var(--parchment)">${eventLed ? 'First drop: East Lake' : 'Filed by championship'}</h4>
            <p style="color:rgba(244,240,230,.62)">${
              eventLed
                ? 'Drop No. 01 opens with the 2026 TOUR Championship — thirty players, Bobby Jones’s home club, 27 – 30 August.'
                : 'Drop No. 01 was the 2026 TOUR Championship at East Lake. Between championships the archive keeps listing — course by course, as the pieces surface.'
            }</p></div>
          </li>
        </ol>
      </div>
    </div>
  </section>`;
}
