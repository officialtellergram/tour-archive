/**
 * The swipe deck — Tinder mechanics in Tour Archive clothes.
 *
 * Hand-rolled on pointer events; anime.js only ever animates *releases*
 * (fly-off, spring-back, re-deal). During the drag itself the card transform
 * is written directly inside rAF — an animation library between finger and
 * card is where swipe decks go to feel wrong.
 *
 * Feel notes (kept because they are the spec):
 *   • commit on distance (>30% of card width) OR flick velocity (>0.45 px/ms),
 *     so a short fast flick counts and a slow wander home doesn't
 *   • rotation couples to horizontal offset (dx/20, clamped ±15°), pivot below
 *     the card's bottom edge — a photo pulled off a stack, not a spinning div
 *   • the verdict stamp fades in DURING the drag, so the decision is visible
 *     before it is committed
 *   • the next two cards peek from behind and step forward as the top card
 *     leaves; undo re-deals the last card back from where it exited
 */

import { animate as anime, createSpring } from 'animejs';
import { reduced } from '../lib/motion.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Mount a deck inside `stage`.
 *
 * cards      — array of data objects (top of deck first)
 * renderCard — (card) => innerHTML string for one card
 * onDecide   — (card, dir) called once a swipe commits; dir 'right'|'left'
 * onEmpty    — called when the last card leaves
 *
 * Returns { decide(dir), undo(card), destroy() } — decide/undo let buttons
 * and keyboard drive the exact same animations as the gesture.
 */
export function mountDeck(stage, { cards, renderCard, onDecide, onEmpty }) {
  const queue = [...cards];
  let locked = false;
  let destroyed = false;

  stage.innerHTML = '';
  const els = new Map(); // card -> element

  const makeEl = (card) => {
    const el = document.createElement('article');
    el.className = 'deck-card';
    el.innerHTML = `
      <span class="deck-stamp deck-stamp--yes" aria-hidden="true">Shortlist</span>
      <span class="deck-stamp deck-stamp--no" aria-hidden="true">Pass</span>
      ${renderCard(card)}`;
    els.set(card, el);
    return el;
  };

  /** Depth-stack the queue: top card interactive, two peeking behind. */
  const settle = (animated = true) => {
    queue.forEach((card, i) => {
      const el = els.get(card);
      if (!el) return;
      const depth = Math.min(i, 3);
      const to = {
        translateX: 0,
        translateY: depth * 12,
        rotate: 0,
        scale: 1 - depth * 0.04,
      };
      el.style.zIndex = String(100 - i);
      el.style.opacity = i > 2 ? '0' : '1';
      el.style.pointerEvents = i === 0 ? 'auto' : 'none';
      // only the visible top of the stack earns a tween; a 40-card pile must
      // not spawn 40 concurrent animations per swipe
      if (animated && !reduced && i < 4) {
        anime(el, { ...to, duration: 420, ease: 'outQuart' });
      } else {
        el.style.transform = `translate(0px, ${to.translateY}px) rotate(0deg) scale(${to.scale})`;
      }
    });
  };

  queue.forEach((card) => stage.appendChild(makeEl(card)));
  settle(false);

  /* ---------------------------- gesture ---------------------------- */

  let drag = null; // { card, el, startX, startY, dx, dy, samples, raf, moved }

  const paint = () => {
    if (!drag) return;
    const { el, dx, dy } = drag;
    const rot = clamp(dx / 20, -15, 15);
    el.style.transform = `translate(${dx}px, ${dy * 0.5}px) rotate(${rot}deg) scale(1)`;
    const strength = clamp(Math.abs(dx) / (el.offsetWidth * 0.3), 0, 1);
    el.querySelector('.deck-stamp--yes').style.opacity = dx > 0 ? strength : 0;
    el.querySelector('.deck-stamp--no').style.opacity = dx < 0 ? strength : 0;
    drag.raf = 0;
  };

  const onDown = (e) => {
    if (locked || destroyed || !queue.length) return;
    const el = els.get(queue[0]);
    if (!el || !el.contains(e.target)) return;
    // A press that starts on the outbound link is a click, not a drag.
    if (e.target.closest('a')) return;
    drag = {
      card: queue[0],
      el,
      startX: e.clientX,
      startY: e.clientY,
      dx: 0,
      dy: 0,
      samples: [],
      raf: 0,
      moved: false,
    };
    el.setPointerCapture?.(e.pointerId);
  };

  const onMove = (e) => {
    if (!drag) return;
    drag.dx = e.clientX - drag.startX;
    drag.dy = e.clientY - drag.startY;
    if (Math.abs(drag.dx) + Math.abs(drag.dy) > 6) drag.moved = true;
    drag.samples.push({ t: performance.now(), x: e.clientX });
    if (drag.samples.length > 6) drag.samples.shift();
    if (!drag.raf) drag.raf = requestAnimationFrame(paint);
  };

  const onUp = () => {
    if (!drag) return;
    const { card, el, dx, dy, samples, moved } = drag;
    drag = null;

    // flick velocity from the last ~100ms of movement
    let vx = 0;
    if (samples.length > 1) {
      const a = samples[0];
      const b = samples[samples.length - 1];
      if (b.t > a.t) vx = (b.x - a.x) / (b.t - a.t);
    }

    // floor of 60px: if a layout bug ever collapses the card again, a tap
    // must not become a verdict
    const commitByDistance = Math.abs(dx) > Math.max(el.offsetWidth * 0.3, 60);
    const commitByFlick = Math.abs(vx) > 0.45 && Math.abs(dx) > 24;
    if (commitByDistance || commitByFlick) {
      flyOff(card, (commitByDistance ? dx : vx) > 0 ? 'right' : 'left', { dx, dy, vx });
      return;
    }

    // spring home — the slight overshoot is most of the physicality
    if (moved) {
      el.querySelectorAll('.deck-stamp').forEach((s) => (s.style.opacity = '0'));
      anime(el, {
        translateX: [dx, 0],
        translateY: [dy * 0.5, 0],
        rotate: [clamp(dx / 20, -15, 15), 0],
        ease: reduced ? 'outQuad' : createSpring({ stiffness: 320, damping: 22 }),
        duration: reduced ? 120 : undefined,
      });
    }
  };

  /* A drag that travelled must not fire the card's links on release. */
  const onClickCapture = (e) => {
    if (e.target.closest?.('.deck-card') && suppressClick) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  let suppressClick = false;
  const armSuppress = () => {
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 80);
  };

  /* ----------------------------- exits ----------------------------- */

  function flyOff(card, dir, { dx = 0, dy = 0, vx = 0 } = {}) {
    const el = els.get(card);
    if (!el || locked) return;
    locked = true;
    armSuppress();

    const sign = dir === 'right' ? 1 : -1;
    const exitX = sign * (window.innerWidth || 1200) * 0.9;
    const stamp = el.querySelector(sign > 0 ? '.deck-stamp--yes' : '.deck-stamp--no');
    if (stamp) stamp.style.opacity = '1';

    const finish = () => {
      queue.shift();
      el.remove();
      els.delete(card);
      locked = false;
      settle();
      onDecide?.(card, dir);
      if (!queue.length) onEmpty?.();
    };

    if (reduced) {
      finish();
      return;
    }
    anime(el, {
      translateX: [dx, exitX],
      translateY: [dy * 0.5, dy * 0.5 + 40],
      rotate: [clamp(dx / 20, -15, 15), sign * (18 + Math.min(Math.abs(vx) * 10, 10))],
      duration: 340,
      ease: 'outQuad',
      onComplete: finish,
    });
  }

  /**
   * Re-deal a previously decided card back onto the top of the deck.
   * Returns false (and does nothing) while an animation is in flight —
   * callers must not commit their side of the undo unless this returns true.
   */
  function undo(card, fromDir = 'right') {
    if (locked || destroyed) return false;
    locked = true;
    const el = makeEl(card);
    queue.unshift(card);
    stage.appendChild(el);
    const sign = fromDir === 'right' ? 1 : -1;
    const fromX = sign * (window.innerWidth || 1200) * 0.9;
    el.style.zIndex = '200';

    const done = () => {
      locked = false;
      settle();
    };
    if (reduced) {
      el.style.transform = 'translate(0px, 0px) rotate(0deg)';
      done();
      return true;
    }
    el.style.transform = `translate(${fromX}px, 40px) rotate(${sign * 20}deg)`;
    anime(el, {
      translateX: [fromX, 0],
      translateY: [40, 0],
      rotate: [sign * 20, 0],
      duration: 420,
      ease: 'outQuart',
      onComplete: done,
    });
    return true;
  }

  /* A cancelled gesture (browser stole the pointer) springs back — it must
     never COMMIT a verdict the way a deliberate release can. */
  const onCancel = () => {
    if (!drag) return;
    const { el, dx, dy, moved } = drag;
    drag = null;
    if (!moved) return;
    el.querySelectorAll('.deck-stamp').forEach((s) => (s.style.opacity = '0'));
    anime(el, {
      translateX: [dx, 0],
      translateY: [dy * 0.5, 0],
      rotate: [clamp(dx / 20, -15, 15), 0],
      duration: 200,
      ease: 'outQuad',
    });
  };

  /* --------------------------- wiring ------------------------------ */

  stage.addEventListener('pointerdown', onDown);
  stage.addEventListener('pointermove', onMove);
  stage.addEventListener('pointerup', onUp);
  stage.addEventListener('pointercancel', onCancel);
  stage.addEventListener('click', onClickCapture, true);

  return {
    decide: (dir) => !drag && queue.length && flyOff(queue[0], dir),
    undo,
    peek: () => queue[0] || null,
    size: () => queue.length,
    destroy() {
      destroyed = true;
      stage.removeEventListener('pointerdown', onDown);
      stage.removeEventListener('pointermove', onMove);
      stage.removeEventListener('pointerup', onUp);
      stage.removeEventListener('pointercancel', onCancel);
      stage.removeEventListener('click', onClickCapture, true);
    },
  };
}
