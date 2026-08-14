/** House pages: /mission, /sell, /sizing, and the 404. */

import { BRAND } from '../data/store.js';
import { breadcrumb } from '../components/ui.js';
import { toast } from '../lib/motion.js';

/* ------------------------------ /mission ------------------------------ */

/* Spare by design: the generalized method copy is retired and the founders'
   hand-written mission lands here when it arrives. */
export function mission() {
  return `
  <section class="section" style="padding-top:calc(var(--header-h) + 4rem)">
    <div class="wrap">
      ${breadcrumb([{ label: 'Home', href: '/' }, { label: 'Our Mission' }])}
      <div data-hero>
        <p class="eyebrow" data-hero-meta><span>${BRAND.tagline}</span></p>
        <h1 class="display" style="margin:.6rem 0 1.2rem;font-size:clamp(2.8rem,7vw,6.5rem)">
          <span class="line-mask"><span>Our Mission</span></span>
        </h1>
        <p class="lede" data-hero-cta>
          We thrift, authenticate and catalogue vintage golf apparel by the championship
          it belongs to. Every piece is one of one — when it is gone, it is gone.
        </p>
      </div>
    </div>
  </section>

  <section class="section" style="padding-top:0">
    <div class="wrap split" style="align-items:start">
      <div class="prose" data-reveal>
        <p>Golf keeps its history in trophies and scorecards. We keep it in the clothing —
        the lambswool, the crests and the colours that belong to a particular week on a
        particular course. Each piece is sourced, dated and graded honestly, then filed
        under the championship era it came from, with the history written alongside it.</p>
        <p>The first drop opens with the 2026 TOUR Championship at East Lake — thirty
        players, Bobby Jones’s home club, and one of the last seasons to end there.
        Everything else we find lives in Basic Stock, listed continuously as it is
        photographed.</p>
      </div>
      <div data-reveal data-reveal-delay="0.08">
        <p class="eyebrow" style="margin-bottom:.9rem">Where to start</p>
        <div style="display:flex;gap:.75rem;flex-wrap:wrap">
          <a class="btn btn--solid" href="/collections/tour-championship-2026" data-magnetic>
            Preview Drop No. 01
          </a>
          <a class="btn" href="/sell" data-magnetic>Sell to the archive</a>
        </div>
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

        <form data-sell-form data-reveal style="display:grid;gap:1.1rem">
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

/* ------------------------------ /privacy ------------------------------ */

export function privacy() {
  return `
  <section class="section" style="padding-top:calc(var(--header-h) + 4rem)">
    <div class="wrap">
      ${breadcrumb([{ label: 'Home', href: '/' }, { label: 'Privacy' }])}
      <div data-hero>
        <p class="eyebrow" data-hero-meta><span>Effective 13 August 2026</span></p>
        <h1 class="display" style="margin:.6rem 0 1.2rem;font-size:clamp(2.6rem,6vw,5.5rem)">
          <span class="line-mask"><span>Privacy</span></span>
        </h1>
        <p class="lede" data-hero-cta>
          The short version: this site collects almost nothing, and we like it that way.
        </p>
      </div>
    </div>
  </section>

  <section class="section" style="padding-top:0">
    <div class="wrap prose" data-reveal style="max-width:68ch">
      <p><strong>What we collect.</strong> Browsing the archive requires no account and sets
      no cookies. We run no analytics and no trackers. If you give us your email address —
      for drop notices or by writing to us — we use it only to reply or to tell you about
      drops. We never sell it, share it, or add you to anything you didn't ask for.</p>

      <p><strong>Buying a piece.</strong> Checkout for marketplace-listed pieces completes on
      eBay or Depop, under their privacy policies — we never see your payment details. If we
      ever take payment on this site directly, it will be processed by a dedicated payment
      provider; card numbers would go to them, never to us, and a shipping address would be
      used solely to ship your piece.</p>

      <p><strong>What the plumbing sees.</strong> Like nearly every website: our host
      (GitHub Pages) keeps standard server logs, and our typefaces load from Google Fonts,
      which means Google's servers see those requests. Neither is under our control, and we
      add nothing on top.</p>

      <p><strong>Questions, or want something removed?</strong> Write to
      <a href="mailto:tourarchive.help@gmail.com" style="border-bottom:1px solid var(--rule-strong)">tourarchive.help@gmail.com</a>
      and a person will answer.</p>
    </div>
  </section>`;
}

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
