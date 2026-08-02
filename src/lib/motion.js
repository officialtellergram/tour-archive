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
  nodes.forEach((n) => {
    inView(
      n,
      (el) => {
        const delay = Number(el.dataset.revealDelay || 0);
        animate(
          el,
          { opacity: [0, 1], transform: ['translateY(26px)', 'translateY(0px)'] },
          { duration: 0.85, delay, ease: EASE }
        ).finished.then(() => el.classList.add('is-in'));
      },
      { margin: '0px 0px -12% 0px', amount: 0.15 }
    );
  });
}

/** Staggered reveal for grids (products, tiles). */
export function initGridStagger(root = document) {
  root.querySelectorAll('[data-stagger]').forEach((grid) => {
    const kids = [...grid.children];
    if (!kids.length) return;
    if (reduced) {
      kids.forEach((k) => (k.style.opacity = '1'));
      return;
    }
    kids.forEach((k) => {
      k.style.opacity = '0';
      k.style.transform = 'translateY(30px)';
    });
    inView(
      grid,
      () => {
        animate(
          kids,
          { opacity: [0, 1], transform: ['translateY(30px)', 'translateY(0px)'] },
          { duration: 0.8, delay: stagger(0.055), ease: EASE }
        );
      },
      { amount: 0.06, margin: '0px 0px -8% 0px' }
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
  const meta = hero.querySelectorAll('[data-hero-meta] > *');
  const crest = hero.querySelector('.hero-crest');
  const cta = hero.querySelectorAll('[data-hero-cta]');

  if (reduced) {
    utils.set([...masks, ...meta, ...cta], { opacity: 1, y: 0 });
    return;
  }

  utils.set(masks, { y: '110%', opacity: 0 });
  utils.set([...meta, ...cta], { opacity: 0, y: 18 });

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

  tl.add(masks, { y: ['110%', '0%'], opacity: [0, 1], duration: 1250, delay: aStagger(110) }, 260)
    .add(meta, { opacity: [0, 1], y: [18, 0], duration: 900, delay: aStagger(70) }, 900)
    .add(cta, { opacity: [0, 1], y: [18, 0], duration: 800, delay: aStagger(80) }, 1050);

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
export function openDrawer(drawer) {
  drawer.classList.add('is-open');
  document.body.classList.add('is-locked');
  const items = drawer.querySelectorAll('.drawer-list li, .drawer h4');
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
  if (reduced) {
    drawer.style.clipPath = 'inset(0 0 100% 0)';
    drawer.classList.remove('is-open');
    return;
  }
  await animate(drawer, { clipPath: ['inset(0 0 0% 0)', 'inset(0 0 100% 0)'] }, { duration: 0.45, ease: EASE });
  drawer.classList.remove('is-open');
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
  heroSequence(outlet);
  initReveals(outlet);
  initGridStagger(outlet);
  initParallax(outlet);
  initCounters(outlet);
  initMagnetic(outlet);
  initAccordions(outlet);
  initMarquee(outlet);
}
