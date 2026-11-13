/**
 * Motion system.
 *
 * Two engines, deliberately split by job:
 *   • motion.dev  — scroll-linked work (progress rail, parallax, inView reveals)
 *                   and interaction springs (cursor, hovers, drawer).
 *   • anime.js v4 — sequenced choreography (hero line masks, SVG crest draw,
 *                   numeric counters, accordion heights).
 *
 * Everything degrades to "instantly visible" under prefers-reduced-motion.
 */

import { animate, inView, scroll, stagger, hover } from 'motion';
import { animate as anime, createTimeline, svg, utils, stagger as aStagger } from 'animejs';
import { webpURL } from './media.js';

/**
 * Point a photograph at a new frame. The templates wrap JPEG photos in a
 * <picture> with a WebP <source> in front (pictureTag in ui.js); a browser
 * that took the <source> ignores a bare img.src swap, so the source moves
 * too — to the frame's WebP sibling when it has one, else the frame itself
 * (the archived carousel frames are already WebP). Bare <img> swaps as before.
 */
export function setFrame(img, url) {
  const wrap = img?.parentElement;
  const source = wrap?.tagName === 'PICTURE' ? wrap.querySelector('source[type="image/webp"]') : null;
  if (source) source.srcset = webpURL(url) || url;
  img.src = url;
}

export const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const EASE = [0.22, 1, 0.36, 1];

/* ------------------------------------------------------------------ */
/* Global chrome                                                       */
/* ------------------------------------------------------------------ */

export function initScrollRail() {
  const bar = document.querySelector('[data-scroll-progress]');
  if (!bar) return;
  if (reduced) {
    bar.style.transform = 'scaleX(1)';
    return;
  }
  scroll((progress) => {
    bar.style.transform = `scaleX(${progress})`;
  });
}

export function initHeaderBehaviour() {
  const header = document.querySelector('[data-site-header] .site-header');
  if (!header) return;
  let last = window.scrollY;
  const onScroll = () => {
    const y = window.scrollY;
    header.classList.toggle('is-stuck', y > 12);
    // never hide while a drawer is open or near the top
    const drawerOpen = document.querySelector('.drawer.is-open');
    if (!drawerOpen && y > 260 && y > last + 4) header.classList.add('is-hidden');
    else if (y < last - 4 || y < 200) header.classList.remove('is-hidden');
    last = y;
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

export function initCursor() {
  const el = document.querySelector('[data-cursor]');
  const label = document.querySelector('[data-cursor-label]');
  if (!el || reduced || !window.matchMedia('(hover: hover)').matches) return;

  let tx = window.innerWidth / 2;
  let ty = window.innerHeight / 2;
  let x = tx;
  let y = ty;
  let visible = false;

  window.addEventListener('mousemove', (e) => {
    tx = e.clientX;
    ty = e.clientY;
    const target = e.target.closest?.('[data-cursor-text]');
    const wants = target?.getAttribute('data-cursor-text') || '';
    if (wants && !visible) {
      visible = true;
      animate(el, { scale: [0, 1], opacity: [0, 1] }, { duration: 0.42, ease: EASE });
    } else if (!wants && visible) {
      visible = false;
      animate(el, { scale: 0, opacity: 0 }, { duration: 0.3, ease: EASE });
    }
    if (label && label.textContent !== wants) label.textContent = wants;
  });

  document.addEventListener('mouseleave', () => {
    visible = false;
    animate(el, { scale: 0, opacity: 0 }, { duration: 0.25 });
  });

  const loop = () => {
    x += (tx - x) * 0.16;
    y += (ty - y) * 0.16;
    el.style.translate = `${x}px ${y}px`;
    requestAnimationFrame(loop);
  };
  loop();
}

export function initMarquee(root = document) {
  root.querySelectorAll('[data-marquee]').forEach((track) => {
    if (track.dataset.marqueeReady) return;
    track.dataset.marqueeReady = '1';
    // duplicate content so the loop is seamless
    track.innerHTML += track.innerHTML;
    if (reduced) return;
    const dist = track.scrollWidth / 2;
    animate(
      track,
      { transform: [`translateX(0px)`, `translateX(-${dist}px)`] },
      { duration: dist / 42, ease: 'linear', repeat: Infinity }
    );
  });
}

/* ------------------------------------------------------------------ */
/* Intro plate                                                         */
/* ------------------------------------------------------------------ */

/* The clip draws the brush mark over its first 2 s, holds, then wipes itself
   off at 4 s. Played at INTRO_RATE the mark lands at about 1 s; the line
   beneath it (.intro-tag, real type) arrives at INTRO_TAG_MS; the page comes
   in at INTRO_HOLD_MS and the clip is still holding under the wipe, so the
   exit is the house wipe, not the clip's own. */
const INTRO_TAG_MS = 800;
const INTRO_RATE = 2; // the clip at double time: the mark lands at ~1.4 s
const INTRO_HOLD_MS = 1550;
const INTRO_READY_MS = 1500; // no decodable frame by then: skip, never stall
let introPromise = null;

/** The pending intro, or null once it has begun to lift (or never showed). */
export function introPending() {
  return introPromise;
}

/**
 * Play the intro plate if the head shim left it in place. Resolves when the
 * plate begins to lift, so page motion starts under the wipe rather than
 * after it. Any click or key lifts it early.
 */
export function playIntro() {
  const box = document.querySelector('[data-intro]');
  const video = box?.querySelector('video');
  if (!box || !video || reduced || document.documentElement.classList.contains('no-intro')) {
    return Promise.resolve();
  }
  try {
    sessionStorage.setItem('ta-intro', '1');
  } catch {
    /* private mode: the intro simply shows again next load */
  }
  introPromise = new Promise((resolve) => {
    let done = false;
    const timers = [];
    const finish = () => {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      window.removeEventListener('keydown', finish);
      introPromise = null;
      resolve();
      animate(box, { clipPath: ['inset(0 0 0 0)', 'inset(0 0 100% 0)'] }, { duration: 0.45, ease: EASE })
        .finished.then(() => {
          box.classList.add('is-done');
          try {
            video.pause();
          } catch {
            /* already gone */
          }
        });
    };
    // preload="none" in the markup: a skipped intro must not fetch the clip,
    // and a hidden media fetch was enough to stall the reveal gate. Ask for
    // it only now, when the plate is really going to show.
    video.preload = 'auto';
    video.load();
    const ready = new Promise((r) => {
      if (video.readyState >= 3) return r(true);
      video.addEventListener('canplay', () => r(true), { once: true });
      timers.push(setTimeout(() => r(false), INTRO_READY_MS));
    });
    ready.then((ok) => {
      if (done) return;
      if (!ok) return finish();
      video.playbackRate = INTRO_RATE;
      const p = video.play();
      if (p && p.catch) p.catch(finish);
      timers.push(setTimeout(() => box.classList.add('is-tagged'), INTRO_TAG_MS));
      timers.push(setTimeout(finish, INTRO_HOLD_MS));
    });
    video.addEventListener('ended', finish, { once: true });
    video.addEventListener('error', finish, { once: true });
    box.addEventListener('click', finish, { once: true });
    window.addEventListener('keydown', finish);
  });
  return introPromise;
}

/* ------------------------------------------------------------------ */
/* Page transition veil                                                */
/* ------------------------------------------------------------------ */

export async function veilIn() {
  const veil = document.querySelector('[data-veil]');
  if (!veil || reduced) return;
  veil.style.transformOrigin = '50% 100%';
  await animate(
    veil,
    { opacity: 1, transform: ['scaleY(0)', 'scaleY(1)'] },
    { duration: 0.42, ease: EASE }
  );
}

export async function veilOut() {
  const veil = document.querySelector('[data-veil]');
  if (!veil) return;
  if (reduced) {
    veil.style.opacity = '0';
    return;
  }
  veil.style.transformOrigin = '50% 0%';
  await animate(veil, { transform: ['scaleY(1)', 'scaleY(0)'] }, { duration: 0.5, ease: EASE });
  veil.style.opacity = '0';
  veil.style.transform = 'scaleY(0)';
}

/* ------------------------------------------------------------------ */
/* Per-page choreography                                               */
/* ------------------------------------------------------------------ */

/** Reveal-on-scroll for anything tagged [data-reveal]. */
export function initReveals(root = document) {
  const nodes = [...root.querySelectorAll('[data-reveal]')];
  if (!nodes.length) return;
  if (reduced) {
    nodes.forEach((n) => n.classList.add('is-in'));
    return;
  }
  const showNow = (el) => {
    el.style.opacity = '1';
    el.style.transform = 'none';
    el.classList.add('is-in');
  };
  const reveal = (el) => {
    if (el.classList.contains('is-in') || el.dataset.revealing) return;
    el.dataset.revealing = '1';
    const delay = Number(el.dataset.revealDelay || 0);
    // 0.5s / 14px: content is fully in within the 400ms Doherty window
    // plus one beat — the rest state (26px→14px) lives in app.css too.
    animate(
      el,
      { opacity: [0, 1], transform: ['translateY(14px)', 'translateY(0px)'] },
      { duration: 0.5, delay, ease: EASE }
    ).finished.then(() => el.classList.add('is-in'));
  };
  // Safety net. The choreographed trigger below wants 15 % of a node inside
  // the viewport less a 12 % band at the bottom; a short heading that comes
  // to rest inside that band (page bottom, a fast thumb) never qualifies
  // and would stay invisible. So: any node that has been on screen at all
  // for 900 ms and is still hidden is shown; a node already scrolled past is
  // shown at once. (17 Oct 2026: the deploy's reveal gate caught one
  // section head at opacity 0 on a 390x844 viewport.)
  const timers = new WeakMap();
  const net = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver((entries) => {
        for (const e of entries) {
          const el = e.target;
          if (el.classList.contains('is-in')) { net.unobserve(el); continue; }
          if (e.boundingClientRect.bottom < 0) { showNow(el); net.unobserve(el); continue; }
          if (e.isIntersecting) {
            if (!timers.has(el)) timers.set(el, setTimeout(() => { if (!el.classList.contains('is-in')) reveal(el); net.unobserve(el); }, 900));
          } else if (timers.has(el)) {
            clearTimeout(timers.get(el));
            timers.delete(el);
          }
        }
      }, { threshold: 0 })
    : null;
  nodes.forEach((n) => {
    // Already scrolled past when the observer registers (a fast thumb, or a
    // page that mounted under the intro plate): show it now. An observer
    // registered below a node reports "not intersecting" and would leave it
    // invisible until the visitor scrolled back up.
    if (n.getBoundingClientRect().bottom < 0) {
      showNow(n);
      return;
    }
    inView(n, reveal, { margin: '0px 0px -12% 0px', amount: 0.15 });
    if (net) net.observe(n);
  });
}

/* Grid stagger: 40ms a card, capped so the LAST card of any grid starts by
   0.7s — with the 0.5s tween a 30-card (or 300-card) grid is fully in by
   ~1.2s. motion's stagger() has no max option (it is startDelay + step *
   distance, nothing else), so the cap is a plain min over the function it
   returns; animate() accepts any (i, total) => seconds as delay. */
const GRID_STEP = 0.04;
const GRID_DELAY_MAX = 0.7;
const gridStep = stagger(GRID_STEP, { from: 'first' });
const gridDelay = (i, total) => Math.min(gridStep(i, total), GRID_DELAY_MAX);

/** Staggered reveal for grids (products, tiles). */
export function initGridStagger(root = document) {
  root.querySelectorAll('[data-stagger]').forEach((grid) => {
    const kids = [...grid.children];
    if (!kids.length) return;
    if (reduced) {
      kids.forEach((k) => (k.style.opacity = '1'));
      return;
    }
    // Same rule for a grid already above the fold when it registers.
    if (grid.getBoundingClientRect().bottom < 0) {
      kids.forEach((k) => (k.style.opacity = '1'));
      return;
    }
    kids.forEach((k) => {
      k.style.opacity = '0';
      k.style.transform = 'translateY(14px)';
    });
    inView(
      grid,
      () => {
        animate(
          kids,
          { opacity: [0, 1], transform: ['translateY(14px)', 'translateY(0px)'] },
          { duration: 0.5, delay: gridDelay, ease: EASE }
        );
      },
      // 'some' (any pixel), NEVER a fraction: a 27-card single-column grid is
      // ~18,000px tall on a phone, so even amount: 0.06 demands more grid than
      // the viewport can hold — the trigger never fires and every card holds
      // at opacity 0. Proven live at 390x844; scripts/ probe: reveal-probe.
      { amount: 'some', margin: '0px 0px -8% 0px' }
    );
  });
}

/** Parallax any [data-parallax] element by its data-parallax factor. */
export function initParallax(root = document) {
  if (reduced) return;
  root.querySelectorAll('[data-parallax]').forEach((el) => {
    const amount = Number(el.dataset.parallax || 60);
    scroll(animate(el, { transform: [`translateY(${-amount}px)`, `translateY(${amount}px)`] }), {
      target: el,
      offset: ['start end', 'end start'],
    });
  });
}

/** Split a heading into line masks and lift them in (anime.js). */
export function heroSequence(root = document) {
  const hero = root.querySelector('[data-hero]');
  if (!hero) return;

  const masks = hero.querySelectorAll('.line-mask > span');
  // The lead (the landing's "Drop No. 01") enters FIRST, before any other
  // text; pages without one sequence exactly as before.
  const lead = hero.querySelectorAll('[data-hero-lead] > *');
  const meta = hero.querySelectorAll('[data-hero-meta] > *');
  const crest = hero.querySelector('.hero-crest');
  const cta = hero.querySelectorAll('[data-hero-cta]');

  if (reduced) {
    utils.set([...masks, ...lead, ...meta, ...cta], { opacity: 1, y: 0 });
    return;
  }

  utils.set(masks, { y: '110%', opacity: 0 });
  utils.set([...lead, ...meta, ...cta], { opacity: 0, y: 18 });

  const tl = createTimeline({ defaults: { ease: 'outExpo' } });

  if (crest) {
    // The shield and the T are solid — they rise and fade in. Only the hairline
    // border is stroked, so only it gets the draw-on treatment.
    const solids = crest.querySelectorAll('.crest-shield, .crest-letter');
    const rules = crest.querySelectorAll('.draw');
    utils.set(solids, { opacity: 0 });

    tl.add(
      crest.querySelector('.crest-shield'),
      { opacity: [0, 1], scale: [0.86, 1], duration: 900 },
      0
    );
    if (rules.length) {
      tl.add(svg.createDrawable(rules), { draw: ['0 0', '0 1'], duration: 1100 }, 320);
    }
    tl.add(
      crest.querySelector('.crest-letter'),
      { opacity: [0, 1], y: [10, 0], duration: 800 },
      520
    );
  }

  if (lead.length) tl.add(lead, { opacity: [0, 1], y: [18, 0], duration: 700 }, 0);
  // With a lead present everything else waits a beat so the drop line owns
  // the opening; without one the offsets are the originals, untouched.
  const later = lead.length ? 260 : 0;
  tl.add(masks, { y: ['110%', '0%'], opacity: [0, 1], duration: 1250, delay: aStagger(110) }, 260 + later)
    .add(meta, { opacity: [0, 1], y: [18, 0], duration: 900, delay: aStagger(70) }, 900 + later)
    .add(cta, { opacity: [0, 1], y: [18, 0], duration: 800, delay: aStagger(80) }, 1050 + later);

  // slow drift on the hero backdrop
  const bg = hero.querySelector('.hero-bg');
  if (bg) {
    scroll(animate(bg, { transform: ['translateY(0px)', 'translateY(90px)'] }), {
      target: hero,
      offset: ['start start', 'end start'],
    });
  }
}

/** Count numeric [data-count] values up when they scroll into view. */
export function initCounters(root = document) {
  root.querySelectorAll('[data-count]').forEach((el) => {
    const to = Number(el.dataset.count);
    if (Number.isNaN(to)) return;
    if (reduced) {
      el.textContent = String(to);
      return;
    }
    el.textContent = '0';
    inView(
      el,
      () => {
        const obj = { v: 0 };
        anime(obj, {
          v: to,
          duration: 1500,
          ease: 'outExpo',
          onUpdate: () => {
            el.textContent = String(Math.round(obj.v));
          },
        });
      },
      { amount: 0.6 }
    );
  });
}

/** Magnetic pull on buttons. */
export function initMagnetic(root = document) {
  if (reduced) return;
  root.querySelectorAll('[data-magnetic]').forEach((el) => {
    hover(el, () => {
      const move = (e) => {
        const r = el.getBoundingClientRect();
        const mx = (e.clientX - (r.left + r.width / 2)) * 0.22;
        const my = (e.clientY - (r.top + r.height / 2)) * 0.3;
        animate(el, { x: mx, y: my }, { duration: 0.4, ease: EASE });
      };
      el.addEventListener('mousemove', move);
      return () => {
        el.removeEventListener('mousemove', move);
        animate(el, { x: 0, y: 0 }, { type: 'spring', stiffness: 220, damping: 18 });
      };
    });
  });
}

/** Accordion with animated height (anime.js). */
export function initAccordions(root = document) {
  root.querySelectorAll('.accordion-item').forEach((item) => {
    const trigger = item.querySelector('.accordion-trigger');
    const panel = item.querySelector('.accordion-panel');
    if (!trigger || !panel) return;
    const inner = panel.firstElementChild;
    trigger.setAttribute('aria-expanded', item.classList.contains('is-open') ? 'true' : 'false');
    if (item.classList.contains('is-open')) panel.style.height = 'auto';

    trigger.addEventListener('click', () => {
      const open = item.classList.toggle('is-open');
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
      const target = inner ? inner.offsetHeight : 0;
      if (reduced) {
        panel.style.height = open ? 'auto' : '0px';
        return;
      }
      anime(panel, {
        height: open ? [panel.offsetHeight, target] : [panel.offsetHeight, 0],
        duration: 520,
        ease: 'outQuart',
        onComplete: () => {
          if (open) panel.style.height = 'auto';
        },
      });
    });
  });
}

/** Drawer open/close (nav). */
/* iOS ignores overflow:hidden on body, so the lock is position:fixed — which
   resets scroll, so the position is carried across the lock and restored. */
let drawerScrollY = 0;

export function openDrawer(drawer) {
  drawer.classList.add('is-open');
  drawerScrollY = window.scrollY;
  document.body.style.top = `-${drawerScrollY}px`;
  document.body.classList.add('is-locked');
  const items = drawer.querySelectorAll('.drawer-list li, .drawer h2');
  if (reduced) {
    drawer.style.clipPath = 'inset(0 0 0% 0)';
    items.forEach((i) => (i.style.opacity = '1'));
    return;
  }
  animate(drawer, { clipPath: ['inset(0 0 100% 0)', 'inset(0 0 0% 0)'] }, { duration: 0.62, ease: EASE });
  animate(
    items,
    { opacity: [0, 1], transform: ['translateY(26px)', 'translateY(0px)'] },
    { duration: 0.6, delay: stagger(0.035, { startDelay: 0.18 }), ease: EASE }
  );
}

export async function closeDrawer(drawer) {
  document.body.classList.remove('is-locked');
  document.body.style.top = '';
  window.scrollTo({ top: drawerScrollY, behavior: 'instant' });
  if (reduced) {
    drawer.style.clipPath = 'inset(0 0 100% 0)';
    drawer.classList.remove('is-open');
    return;
  }
  await animate(drawer, { clipPath: ['inset(0 0 0% 0)', 'inset(0 0 100% 0)'] }, { duration: 0.45, ease: EASE });
  drawer.classList.remove('is-open');
}

/* ------------------------------------------------------------------ */
/* Home landing plate                                                  */
/* ------------------------------------------------------------------ */

/* module scope — shim-safe: inert declarations only (this module loads under
   the render smoke's DOM shim; no module-level DOM work) */
const PLATE_HOLD_MS = 7000; // cadence; the 1900ms dissolve lives in CSS
let plateTimer = null; //      singleton interval handle — the only one, ever
let plateKeys = false; //      the arrow-key delegate is bound once per document

/* The signature: brand/intro.mp4 is the intro plate's brush mark on black.
   brand/intro-mark.webm is that mark cut out with real alpha and tinted
   parchment (made in the landing-ideas lab, 12 Nov 2026). The mark lands at
   ~1.75 s of clip time and holds to ~3.75 s before the clip's own wipe; at
   MARK_RATE (2, the intro's own speed) it lands at ~0.9 s and the clip is
   frozen at MARK_HOLD_AT so the wipe never comes. Its box in the 1080x1920
   frame, measured: x 161-919, y 533-1386 — MARK_CROP with a margin. */
const MARK_RATE = 2;
const MARK_HOLD_AT = 3.0;
const MARK_READY_MS = 4000; // a slow fetch gets its chance; the mark arrives when it can
const MARK_CROP = { x: 150, y: 520, w: 780, h: 876 };
const MARK_INK = [244, 240, 230]; // --parchment

/**
 * Play one clip at the intro's rate and freeze it at the hold. Under the
 * intro plate it plays covered — the intro lifts at about the moment the
 * mark lands, so the plate shows a mark already there or just finishing.
 * (A seek straight to the held frame was tried for that case and failed on
 * first visits over the network, 12 Nov 2026; playing is the proven path.)
 * `onFrame` runs per frame (the canvas route) and may throw to reject the
 * whole route (a tainted canvas). Resolves true once the mark is showing.
 */
function runClip(video, { onFrame } = {}) {
  return new Promise((resolve) => {
    let raf = 0;
    let done = false;
    let ready = 0;
    const settle = (ok) => {
      if (done) return;
      done = true;
      clearTimeout(ready);
      cancelAnimationFrame(raf);
      if (!ok) {
        try { video.pause(); } catch { /* never started */ }
      }
      resolve(ok);
    };
    ready = setTimeout(() => settle(false), MARK_READY_MS);
    const paint = () => {
      try { onFrame && onFrame(); } catch { settle(false); }
      return !done;
    };
    const frame = () => {
      if (!paint()) return;
      if (!video.paused && !video.ended) raf = requestAnimationFrame(frame);
    };
    video.addEventListener('error', () => settle(false), { once: true });
    video.preload = 'auto';
    video.addEventListener('timeupdate', () => {
      if (video.currentTime >= MARK_HOLD_AT && !video.paused) {
        video.pause();
        cancelAnimationFrame(raf);
        paint();
      }
    });
    video.addEventListener('playing', () => { frame(); setTimeout(() => settle(true), 120); }, { once: true });
    video.playbackRate = MARK_RATE;
    const p = video.play();
    if (p && p.catch) p.catch(() => settle(false));
  });
}

/* Safari (iOS and Mac) plays VP9 WebM now but drops its alpha plane, and
   canPlayType says "probably" regardless. The clip's colour plane is flat
   parchment with the mark carried in alpha, so Safari showed a solid
   parchment card (iPhone, 13 Nov 2026). Safari takes the canvas route. */
const SAFARI =
  typeof navigator !== 'undefined' &&
  /AppleWebKit/.test(navigator.userAgent) &&
  !/Chrome|Chromium|CriOS|Edg|OPR|Android|FxiOS/.test(navigator.userAgent);

/* Did the alpha plane survive? A corner of the held frame is clear in the
   clip; a player that dropped alpha paints it solid. Unknowable (a tainted
   canvas) counts as fine — same-origin play never taints. */
function clipHasAlpha(video) {
  try {
    const c = document.createElement('canvas');
    c.width = 8;
    c.height = 8;
    const x = c.getContext('2d');
    x.drawImage(video, 0, 0, 8, 8);
    const d = x.getImageData(0, 0, 1, 1).data;
    return d[3] < 128;
  } catch {
    return true;
  }
}

/**
 * Put the signature on the plate. Three routes, each only if the one
 * before cannot run: the alpha WebM (Chrome, Edge, Firefox, Android); the
 * on-black clip keyed through a canvas (Safari — same-origin only, a
 * tainted canvas rejects itself); the still logo. Reduced motion: the still.
 */
async function runMark(mark) {
  const webm = mark.querySelector('[data-plate-webm]');
  const clip = mark.querySelector('[data-plate-src]');
  const canvas = mark.querySelector('[data-plate-canvas]');
  const mode = (m) => { mark.dataset.mode = m; };
  if (reduced || !webm || !clip || !canvas) { mode('still'); return; }

  if (!SAFARI && webm.canPlayType && webm.canPlayType('video/webm; codecs="vp9"')) {
    mode('webm');
    if (await runClip(webm)) {
      if (clipHasAlpha(webm)) return;
      try { webm.pause(); } catch { /* fine */ }
    }
  }

  mode('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const box = mark.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(box.width * dpr));
  canvas.height = Math.max(1, Math.round(box.height * dpr));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const paint = () => {
    ctx.drawImage(clip, MARK_CROP.x, MARK_CROP.y, MARK_CROP.w, MARK_CROP.h, 0, 0, canvas.width, canvas.height);
    const im = ctx.getImageData(0, 0, canvas.width, canvas.height); // throws on a tainted canvas
    const d = im.data;
    for (let i = 0; i < d.length; i += 4) {
      const a = Math.max(d[i], d[i + 1], d[i + 2]);
      d[i] = MARK_INK[0]; d[i + 1] = MARK_INK[1]; d[i + 2] = MARK_INK[2]; d[i + 3] = a;
    }
    ctx.putImageData(im, 0, 0);
  };
  if (await runClip(clip, { onFrame: paint })) return;

  mode('still');
}

/**
 * Run the landing plate: the stock rotation with its caption and controls,
 * and the signature. Wired via MOUNTS [/^\/$/] in main.js.
 *
 * The router has no unmount hook (outlet.innerHTML wipes the page), so this
 * mount doubles as the previous visit's cleanup: clear-before-arm kills a
 * stale timer even on a sub-7s home→away→home bounce, and the tick's
 * liveness re-query self-disposes the timer when home is left for good.
 * Never hold node references across ticks — they detach on every navigation.
 */
export function mountPlate(outlet) {
  clearInterval(plateTimer);
  plateTimer = null;

  const root = outlet || document;
  const plate = root.querySelector('[data-plate]');
  if (!plate) return; // only home has the plate

  const slides = [...plate.querySelectorAll('[data-hero-backdrop] .hero-slide')];
  const cap = plate.querySelector('[data-plate-cap]');
  const num = plate.querySelector('[data-plate-num]');
  const bar = plate.querySelector('[data-plate-bar]');
  const pad = (n) => String(n).padStart(2, '0');

  // The signature draws now — under the intro it draws covered, and the
  // intro lifts at about the moment it lands.
  const mark = plate.querySelector('[data-plate-mark]');
  if (mark) runMark(mark);

  // Loader: the absent src IS the deferral (in-viewport loading="lazy" would
  // fetch immediately). decode() rejection is "not ready yet" unless the
  // fetch itself failed — a dead plate is pruned from rotation for good.
  const load = (img) => {
    if (!img || img.dataset.ready === '1' || img.dataset.dead === '1') return;
    if (!img.src) img.src = img.dataset.src || '';
    img.decode().then(
      () => { img.dataset.ready = '1'; },
      () => { if (img.complete && img.naturalWidth === 0) img.dataset.dead = '1'; }
    );
  };
  const isReady = (img) => img.dataset.ready === '1' || (img.complete && img.naturalWidth > 0);
  const current = () => slides.findIndex((el) => el.classList.contains('is-on'));

  const progress = () => {
    if (!bar || reduced) return;
    bar.classList.add('is-hold');
    bar.classList.remove('is-go');
    void bar.offsetWidth;
    bar.classList.remove('is-hold');
    bar.classList.add('is-go');
  };
  const show = (next) => {
    const cur = current();
    if (cur === next) return;
    const img = slides[next];
    if (cur !== -1) slides[cur].classList.remove('is-on');
    img.classList.add('is-on'); // CSS runs the dissolve and the settle
    if (cap) {
      cap.querySelector('[data-plate-name]').textContent = img.dataset.name || '';
      cap.querySelector('[data-plate-brand]').textContent = img.dataset.brand || '';
      cap.querySelector('[data-plate-price]').textContent = img.dataset.price || '';
      cap.setAttribute('href', `/item/${img.dataset.item}`);
      if (!reduced) { cap.classList.remove('is-swap'); void cap.offsetWidth; cap.classList.add('is-swap'); }
    }
    if (num) num.textContent = `No. ${pad(next + 1)} / ${pad(slides.length)}`;
    progress();
  };
  /* Advance by `dir`. The timer holds the current plate when the next is
     not decoded (order is editorial, never skip ahead); a press waits for
     the decode and then deals it. */
  const step = (dir, pressed) => {
    if (!plate.isConnected || slides.length < 2) return;
    const cur = current();
    if (cur === -1) return;
    let next = (cur + dir + slides.length) % slides.length;
    let guard = slides.length;
    while (guard-- > 0 && next !== cur && slides[next].dataset.dead === '1') next = (next + dir + slides.length) % slides.length;
    if (next === cur) return;
    const img = slides[next];
    load(img);
    load(slides[(next + dir + slides.length) % slides.length]); // decode-ahead
    if (isReady(img)) show(next);
    else if (pressed) img.decode().then(() => { if (plate.isConnected && current() === cur) show(next); }, () => {});
  };
  const arm = () => {
    clearInterval(plateTimer);
    if (reduced) return;
    plateTimer = setInterval(() => {
      // Liveness FIRST — an away-navigated timer self-disposes even from a
      // hidden tab's throttled fire.
      if (!document.querySelector('[data-plate]')) {
        clearInterval(plateTimer);
        plateTimer = null;
        return;
      }
      // Hidden tab holds the current plate: no class toggle, no invisible
      // transitions completing in the background, zero cleanup.
      if (document.hidden) return;
      step(1, false);
    }, PLATE_HOLD_MS);
  };
  const press = (dir) => { step(dir, true); arm(); };

  plate.querySelector('[data-plate-prev]')?.addEventListener('click', () => press(-1));
  plate.querySelector('[data-plate-next]')?.addEventListener('click', () => press(1));
  if (!plateKeys) {
    plateKeys = true;
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      if (!document.querySelector('[data-plate]')) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      document.querySelector(e.key === 'ArrowRight' ? '[data-plate-next]' : '[data-plate-prev]')?.click();
    });
  }

  if (slides.length < 2) return; // a still: caption and mark only
  load(slides[1]); // warm plate 2 during slide 1's first hold
  progress();
  arm();
}

/* ------------------------------------------------------------------ */
/* Listing hover-cycle                                                 */
/* ------------------------------------------------------------------ */

/* One timer — only one plate is hovered at a time. Bound ONCE at boot via a
   document-level delegate, so route changes cannot stack listeners; a tick
   against a detached plate self-disposes. */
let cycleTimer = null;

/** Hovering a listing's plate deals its archived carousel frames. */
export function initCardCycle() {
  // Touch has no hover, and reduced motion means no auto-advancing imagery.
  if (reduced || !window.matchMedia('(hover: hover)').matches) return;
  document.addEventListener('pointerover', (e) => {
    const plate = e.target.closest?.('[data-cycle]');
    if (!plate || plate.dataset.cycling === '1') return;
    const img = plate.querySelector('.plate-photo');
    if (!img) return;
    const home = img.getAttribute('src');
    const frames = plate.dataset.cycle.split('|').filter((f) => f && f !== home);
    if (!frames.length) return;

    const reel = [...frames, home]; // ends back on the hero, then loops
    let i = 0;
    plate.dataset.cycling = '1';
    clearInterval(cycleTimer);
    cycleTimer = setInterval(() => {
      if (!plate.isConnected) {
        clearInterval(cycleTimer);
        return;
      }
      setFrame(img, reel[i]);
      i = (i + 1) % reel.length;
    }, 650);

    const stop = () => {
      clearInterval(cycleTimer);
      delete plate.dataset.cycling;
      setFrame(img, home);
    };
    plate.addEventListener('pointerleave', stop, { once: true });
  });
}

/** Toast used by the "Reserve" / signup actions. */
let toastTimer;
export function toast(message) {
  let el = document.querySelector('[data-toast]');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('data-toast', '');
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = message;
  clearTimeout(toastTimer);
  animate(el, { transform: 'translate(-50%, 0%)' }, { duration: reduced ? 0 : 0.45, ease: EASE });
  toastTimer = setTimeout(() => {
    animate(el, { transform: 'translate(-50%, 120%)' }, { duration: reduced ? 0 : 0.4, ease: EASE });
  }, 2600);
}

/** Called after every route render. */
export function mountPageMotion(outlet) {
  const go = () => {
    heroSequence(outlet);
    initReveals(outlet);
    initGridStagger(outlet);
    initParallax(outlet);
    initCounters(outlet);
    initMagnetic(outlet);
    initAccordions(outlet);
    initMarquee(outlet);
  };
  // First load under the intro plate: hold the choreography until the plate
  // starts to lift, or the hero would play to an empty house.
  const pending = introPending();
  if (pending) pending.then(go);
  else go();
}
