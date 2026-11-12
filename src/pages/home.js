import {
  BRAND,
  items,
  isAvailable,
  itemsIn,
  featuredCollection,
  getCollection,
  launchCollections,
  daysUntil,
  dateRange,
  soldLast,
} from '../data/store.js';
import { productCard, collectionTile, marquee, sectionHead, sizeAttrs, mediaURL, money, escapeHtml } from '../components/ui.js';

const BASE_URL = (import.meta.env?.BASE_URL || '/').replace(/\/*$/, '/');

/**
 * The landing plate rotates the stock itself: every available piece with a
 * photograph, hanger shots first (a cap or a programme is a poor full-bleed
 * plate), in manifest order so the prerendered document is stable build to
 * build. Slide 1 is the only eager plate and the LCP candidate; the rest
 * defer through data-src and the loader in motion.js (mountPlate). Two is
 * the floor — under that the rotation is a still — so the pool widens to
 * sold pieces before it ever runs short. No photography at all (the curated
 * catalogue standing in for an unreachable inventory API) renders the plate
 * as the navy ground and the lockup alone: no caption, no controls.
 */
const PLATE_SKIP = new Set(['cap', 'hat', 'memorabilia', 'accessory', 'bag', 'towel']);
export function platePieces(stock) {
  const shot = stock.filter((it) => it.photo);
  const hanging = shot.filter((it) => !PLATE_SKIP.has(it.garment));
  const live = hanging.filter(isAvailable);
  if (live.length >= 2) return live;
  const anyLive = shot.filter(isAvailable);
  return anyLive.length >= 2 ? anyLive : shot;
}

/** Phase-aware status line for the featured event. */
function eventStatus(event) {
  switch (event.phase) {
    case 'live':
      return { chip: 'Now open', line: 'Tournament week. The drop is open — one of each, while it lasts.' };
    case 'closing':
      return { chip: 'Final days', line: 'The trophy is handed over; the drop closes shortly.' };
    case 'featured':
      // Weeks after the trophy: still the drop, still one of one, no clock.
      return { chip: 'Drop No. 02', line: 'The championship is played. The drop stays open — one of each, while it lasts.' };
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
  const stock = soldLast(items());
  const available = stock.filter(isAvailable);

  const ev = featured?.event;
  const coll = featured?.collection;
  const status = ev ? eventStatus(ev) : null;
  const drop = coll ? soldLast(itemsIn(coll.id)) : [];

  /* The drop pane LEADS the page while its window is open (live/closing);
     outside the window the shop leads and the drop trails as a preview. */
  const dropFirst = !!ev && (ev.phase === 'live' || ev.phase === 'closing' || ev.phase === 'featured');

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
          ? `<div class="grid-products" data-stagger>${stock.map((it) => productCard(it)).join('')}</div>`
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
          ? `<div class="grid-products" data-stagger>${drop.map((it) => productCard(it)).join('')}</div>`
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

  const plates = platePieces(stock);
  const caption = (it) => `
        <span class="eyebrow plate-cap-eyebrow">Now in the archive</span>
        <span class="plate-cap-name" data-plate-name>${escapeHtml(it.name)}</span>
        <span class="plate-cap-meta"><span data-plate-brand>${escapeHtml(it.brand || 'Unattributed')}</span><b data-plate-price>${money(it.price)}</b></span>
        <span class="plate-cap-view">View the piece</span>`;
  const slide = (it, i) => {
    const data = ` data-item="${it.id}" data-name="${escapeHtml(it.name).replace(/"/g, '&quot;')}" data-brand="${escapeHtml(it.brand || 'Unattributed').replace(/"/g, '&quot;')}" data-price="${money(it.price)}"`;
    return i === 0
      ? `<img class="hero-slide is-on" src="${mediaURL(it.photo)}" alt="" aria-hidden="true"${sizeAttrs(it.photo)}${data}
              fetchpriority="high" decoding="async" />`
      : `<img class="hero-slide" data-src="${mediaURL(it.photo)}" alt="" aria-hidden="true"${sizeAttrs(it.photo)}${data}
              decoding="async" />`;
  };

  /* The plate: the stock itself, one piece at a time under a navy wash, the
     signature still in front (motion.js mountPlate runs the rotation, the
     caption and the mark; the markup contract is pinned by scripts/smoke.mjs).
     The signature is the intro plate's own clip, drawn on once per visit.
     This is the off-season hero and carries no drop messaging (Karen,
     12 Nov 2026): the drop pane below the marquee still leads the page while
     a drop window is open. */
  return `
  <section class="hero hero--plate" data-hero data-plate>
    <div class="hero-bg" data-hero-backdrop>
      ${plates.map(slide).join('')}
    </div>
    <div class="plate-grain" aria-hidden="true"></div>
    <div class="wrap hero-inner plate-lock">
      <h1 class="plate-lockup">
        <span class="plate-word" data-hero-cta>Tour</span>
        <span class="plate-mark" data-plate-mark role="img" aria-label="Tour Archive signature">
          <video class="plate-mark-webm" data-plate-webm muted playsinline preload="none" src="${BASE_URL}brand/intro-mark.webm?v=1"></video>
          <video class="plate-mark-src" data-plate-src muted playsinline preload="none" src="${BASE_URL}brand/intro.mp4?v=2"></video>
          <canvas class="plate-mark-canvas" data-plate-canvas></canvas>
          <img class="plate-mark-still" src="${BASE_URL}brand/logo.png?v=2" alt=""${sizeAttrs('brand/logo.png')} loading="lazy" decoding="async" />
        </span>
        <span class="plate-word" data-hero-cta>Archive</span>
      </h1>
      <div class="plate-cta" data-hero-cta>
        <a href="/archive">Shop the archive</a>
        <a href="/sell">Sell to us</a>
      </div>
    </div>
    ${
      plates.length
        ? `<div class="wrap plate-foot">
      <a class="plate-cap" data-plate-cap href="/item/${plates[0].id}">${caption(plates[0])}
      </a>
      <div class="plate-ctl">
        <button type="button" data-plate-prev>Prev</button>
        <span class="plate-num" data-plate-num>No. 01 / ${String(plates.length).padStart(2, '0')}</span>
        <button type="button" data-plate-next>Next</button>
      </div>
    </div>`
        : ''
    }
    <div class="scroll-cue plate-scroll" aria-hidden="true"><i></i>Scroll</div>
    <div class="plate-bar" data-plate-bar aria-hidden="true"></div>
  </section>

  ${marquee(
    eventLed
      ? [
          `${coll ? coll.drop : 'The drop'} — ${coll ? coll.name : 'Tour Archive'}`,
          coll ? coll.place : 'East Lake, Atlanta',
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
            ? `Every drop begins as a file — the championship, the course, the wardrobe that belongs to it. ${coll.drop} is open: ${coll.place}, tournament week, one of one.`
            : 'Every drop begins as a file — the championship, the course, the wardrobe that belongs to it. The last drop is played out; the next files are being assembled course by course.'
        }
      </p>
      <div class="grid-collections" data-stagger>
        ${(eventLed ? [coll] : launchCollections()).filter(Boolean).map(collectionTile).join('')}
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
            <div><h3 style="color:var(--parchment)">Sourced by tournament</h3>
            <p style="color:rgba(244,240,230,.62)">Every piece is filed under the championship era it came from — the course, the week, the wardrobe that belongs to it.</p></div>
          </li>
          <li style="border-color:rgba(244,240,230,.2)">
            <div><h3 style="color:var(--parchment)">One of one, always</h3>
            <p style="color:rgba(244,240,230,.62)">Real archival garments, dated and graded honestly, photographed as found. No reproductions, no restocks — when it is gone, it is gone.</p></div>
          </li>
          <li style="border-color:rgba(244,240,230,.2)">
            <div><h3 style="color:var(--parchment)">${eventLed ? `${coll.drop}: ${coll.place}` : 'Filed by championship'}</h3>
            <p style="color:rgba(244,240,230,.62)">${
              eventLed
                ? `${coll.drop} opens with ${ev.title} — ${ev.venue}, ${dateRange(ev)}.`
                : 'Between championships the archive keeps listing — course by course, as the pieces surface. Every past drop stays on the shelf until its last piece is claimed.'
            }</p></div>
          </li>
        </ol>
      </div>
    </div>
  </section>`;
}
