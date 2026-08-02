/** House pages: /method, /sell, /sizing, and the 404. */

import { BRAND, collections, items, isAvailable, BASIC_STOCK } from '../data/store.js';
import { breadcrumb, marquee, sectionHead } from '../components/ui.js';
import { toast } from '../lib/motion.js';

/* ------------------------------ /method ------------------------------ */

export function method() {
  return `
  <section class="section" style="padding-top:calc(var(--header-h) + 4rem)">
    <div class="wrap">
      ${breadcrumb([{ label: 'Home', href: '/' }, { label: 'Our Method' }])}
      <div class="coll-hero-grid" data-hero>
        <div>
          <p class="eyebrow" data-hero-meta><span>How we buy, date and grade</span></p>
          <h1 class="display" style="margin:.6rem 0 1.2rem;font-size:clamp(2.8rem,7vw,6.5rem)">
            <span class="line-mask"><span>Our Method</span></span>
          </h1>
          <p class="lede" data-hero-cta>
            Three agreements, or we don’t buy it: label, construction, and the way a garment has
            aged. Two out of three is not a purchase.
          </p>
        </div>
        <div data-hero-cta>
          <p class="eyebrow" style="margin-bottom:.9rem">What we turn down</p>
          <ul class="facts">
            <li><span>Reissues &amp; reproductions</span><b>Never listed</b></li>
            <li><span>Re-applied crests</span><b>Tested on every piece</b></li>
            <li><span>Undated garments</span><b>Held back</b></li>
            <li><span>Unrecorded faults</span><b>Always written in</b></li>
          </ul>
        </div>
      </div>
    </div>
  </section>

  <div class="wrap">
    <div class="stat-row" data-reveal>
      <div class="stat"><b data-count="${items().length}">0</b><span>Pieces catalogued</span></div>
      <div class="stat"><b data-count="${collections().filter((c) => c.id !== BASIC_STOCK).length}">0</b><span>Files &amp; drops</span></div>
      <div class="stat"><b data-count="${items().filter(isAvailable).length}">0</b><span>Available today</span></div>
      <div class="stat"><b>1 of 1</b><span>Every listing</span></div>
    </div>
  </div>

  <section class="section">
    <div class="wrap">
      ${sectionHead({ eyebrow: 'The standard', title: 'Four steps, every piece' })}
      <ol class="process-list">
        <li data-reveal><div>
          <h4>Source</h4>
          <p>Virginia on foot, worked as a route rather than a search — thrift stores, church
          sales, house clearances and estate lots from the Tidewater up through the Shenandoah,
          in a state that has been playing this game since the 1890s. Beyond that we buy by
          submission: photographs from anywhere in the world, appraised and paid outright.</p>
        </div></li>
        <li data-reveal><div>
          <h4>Authenticate</h4>
          <p>Neck label typography, fibre-content placement, union marks and RN numbers date a
          garment to within about five years. Construction confirms it: full-fashioned shaping,
          hand-linked necks, single-needle side seams.</p>
        </div></li>
        <li data-reveal><div>
          <h4>Grade</h4>
          <p>Excellent, Very Good, Good, or As-Is. Every fault is written into the listing —
          reweaves, relaxed ribs, crazed coatings. We would rather lose the sale than the customer.</p>
        </div></li>
        <li data-reveal><div>
          <h4>Attribute</h4>
          <p>Each piece is placed in the championship era it belongs to, with the history written
          alongside it and public sources cited on the collection page.</p>
        </div></li>
      </ol>
    </div>
  </section>

  ${marquee(['Label', 'Construction', 'Patina', 'Two out of three is not a purchase'])}

  <section class="section">
    <div class="wrap split">
      <div data-reveal>
        <p class="eyebrow">What we won’t do</p>
        <h2 class="display" style="margin:.6rem 0 1.2rem">No reproductions.<br />No restocks.</h2>
      </div>
      <div class="prose" data-reveal data-reveal-delay="0.08">
        <p>Everything on this site is a real archival garment. We do not reissue, we do not
        reproduce, and we do not re-apply crests to blank knitwear — a practice common enough in
        the tournament-apparel market that we test for it on every crested piece.</p>
        <p>Sizes are as found. Nothing here was cut to a modern block, so buy on the flat
        measurements rather than the label.</p>
      </div>
    </div>
  </section>`;
}

/* ------------------------------- /sell ------------------------------- */

export function sell() {
  return `
  <section class="section" style="padding-top:calc(var(--header-h) + 4rem)">
    <div class="wrap">
      ${breadcrumb([{ label: 'Home', href: '/' }, { label: 'Sell to Us' }])}
      <div class="split" style="align-items:start">
        <div data-hero>
          <p class="eyebrow" data-hero-meta><span>We buy outright · submissions from anywhere</span></p>
          <h1 class="display" style="margin:.6rem 0 1.2rem;font-size:clamp(2.6rem,6vw,5.5rem)">
            <span class="line-mask"><span>Sell to</span></span>
            <span class="line-mask"><span>the Archive</span></span>
          </h1>
          <p class="lede" data-hero-cta>
            We source Virginia on foot and take the rest of the world by submission.
            Tournament knitwear, crested pieces, Scottish-made lambswool and period outerwear —
            send photographs of the garment, the neck label and any faults, from wherever you are.
          </p>
          <ul class="facts" style="margin-top:2rem">
            <li><span>We pay</span><b>Outright, no consignment</b></li>
            <li><span>Response</span><b>Within two working days</b></li>
            <li><span>Submissions</span><b>Worldwide</b></li>
            <li><span>Shipping</span><b>Covered on accepted offers</b></li>
            <li><span>Best for</span><b>Pre-1995, made in UK/USA</b></li>
          </ul>
        </div>

        <form class="prose" data-sell-form data-reveal style="display:grid;gap:1.1rem">
          <label style="display:grid;gap:.4rem">
            <span class="eyebrow">Your name</span>
            <input required name="name" style="background:none;border:0;border-bottom:1px solid var(--rule-strong);padding:.7rem 0;font:inherit;color:inherit;outline:none" />
          </label>
          <label style="display:grid;gap:.4rem">
            <span class="eyebrow">Email</span>
            <input required type="email" name="email" style="background:none;border:0;border-bottom:1px solid var(--rule-strong);padding:.7rem 0;font:inherit;color:inherit;outline:none" />
          </label>
          <label style="display:grid;gap:.4rem">
            <span class="eyebrow">Where are you sending from?</span>
            <input required name="location" placeholder="City, country" style="background:none;border:0;border-bottom:1px solid var(--rule-strong);padding:.7rem 0;font:inherit;color:inherit;outline:none" />
          </label>
          <label style="display:grid;gap:.4rem">
            <span class="eyebrow">What have you got?</span>
            <textarea required name="detail" rows="5" placeholder="Brand, era, size, condition, and where it came from"
              style="background:none;border:1px solid var(--rule);padding:.9rem;font:inherit;color:inherit;outline:none;resize:vertical"></textarea>
          </label>
          <button class="btn btn--solid" type="submit" data-magnetic style="justify-self:start">
            Send for appraisal
          </button>
          <p style="font-size:.85rem;color:var(--ink-faint);margin:0">
            Prototype form — nothing is transmitted.
          </p>
        </form>
      </div>
    </div>
  </section>`;
}

export function mountSell(outlet) {
  outlet.querySelector('[data-sell-form]')?.addEventListener('submit', (e) => {
    e.preventDefault();
    toast('Appraisal request received — we reply within two days');
    e.currentTarget.reset();
  });
}

/* ------------------------------ /sizing ------------------------------ */

const CONDITIONS = [
  ['Excellent', 'No faults. Wear consistent with careful storage rather than use.'],
  ['Very Good', 'Light, even wear. Any softening or relaxed ribbing is noted in the listing.'],
  ['Good', 'Honest wear — a reweave, a replaced button, or a fade that is part of the piece.'],
  ['As-Is', 'A named fault we could not resolve. Priced accordingly and stated plainly.'],
];

const SIZES = [
  ['S', '19 – 20"', '24 – 25"', 'Period small runs close through the chest'],
  ['M', '20.5 – 21.5"', '25.5 – 26.5"', 'The most common size in 1970s British knitwear'],
  ['L', '22 – 23.5"', '26.5 – 27.5"', 'US sportswear of the 1980s runs long in the body'],
  ['XL', '24"+', '28"+', 'Rare before 1985; measure before you buy'],
];

export function sizing() {
  return `
  <section class="section" style="padding-top:calc(var(--header-h) + 4rem)">
    <div class="wrap">
      ${breadcrumb([{ label: 'Home', href: '/' }, { label: 'Sizing & Condition' }])}
      <div data-hero>
        <p class="eyebrow" data-hero-meta><span>Buy on the measurements, not the label</span></p>
        <h1 class="display" style="margin:.6rem 0 1.2rem;font-size:clamp(2.6rem,6vw,5.5rem)">
          <span class="line-mask"><span>Sizing &amp;</span></span>
          <span class="line-mask"><span>Condition</span></span>
        </h1>
        <p class="lede" data-hero-cta>
          Nothing in this archive was cut to a modern block, so buy on measurements rather
          than the label. Measurements are taken flat — chest pit-to-pit, length centre-back
          — and anything not yet measured is measured on request, same day.
        </p>
      </div>
    </div>
  </section>

  <section class="section" style="padding-top:0">
    <div class="wrap split" style="align-items:start">
      <div data-reveal>
        <p class="eyebrow">Rough guide — flat measurements</p>
        <table class="spec-table" style="margin-top:1rem">
          <tr><th>Size</th><th style="width:auto">Chest (flat)</th><th style="width:auto">Length</th></tr>
          ${SIZES.map(
            ([s, c, l, note]) =>
              `<tr><th>${s}</th><td>${c}</td><td>${l}</td></tr>
               <tr><th></th><td colspan="2" style="color:var(--ink-faint);font-size:.9rem">${note}</td></tr>`
          ).join('')}
        </table>
      </div>
      <div data-reveal data-reveal-delay="0.08">
        <p class="eyebrow">Condition grades</p>
        <div class="accordion" style="margin-top:1rem">
          ${CONDITIONS.map(
            ([grade, desc], i) => `
            <div class="accordion-item ${i === 0 ? 'is-open' : ''}">
              <button class="accordion-trigger">${grade} <i>+</i></button>
              <div class="accordion-panel"><div>
                <p style="margin:0;color:var(--ink-soft);font-weight:300">${desc}</p>
              </div></div>
            </div>`
          ).join('')}
        </div>
      </div>
    </div>
  </section>`;
}

/* ------------------------------- 404 -------------------------------- */

export function notFound(path) {
  return `
  <section class="section" style="padding-top:calc(var(--header-h) + 6rem)">
    <div class="wrap empty-state" style="border:0">
      <p class="eyebrow">Error 404</p>
      <h1 class="display" style="font-size:clamp(3rem,9vw,7rem)">Out of bounds</h1>
      <p class="lede" style="text-align:center">
        Nothing is catalogued at <code style="font-family:var(--sans);font-size:.85em">${path}</code>.
        Play it from where you last found the fairway.
      </p>
      <div style="display:flex;gap:.75rem;flex-wrap:wrap;justify-content:center;margin-top:1rem">
        <a class="btn btn--solid" href="/" data-magnetic>Home</a>
        <a class="btn" href="/collections" data-magnetic>Collections</a>
        <a class="btn" href="/archive" data-magnetic>The archive</a>
      </div>
      <p class="eyebrow" style="margin-top:2rem">${BRAND.tagline}</p>
    </div>
  </section>`;
}
