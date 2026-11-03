/**
 * First-visit offer: "Ten percent off your first piece" for an address.
 *
 * Shown once, to a visitor the site has not met (nothing in localStorage),
 * after the intro plate has played and either nine seconds have passed or
 * they have scrolled well into the page — never the instant the page
 * opens. A card at the bottom edge, not a wall; Close or Escape puts it
 * away for a month, joining puts it away for good. The code itself is
 * never shown here: it arrives by email, unique and one-use, which is what
 * makes the list real. Not on the desk, terms or privacy pages.
 */
import { joinList } from '../lib/list.js';

const KEY = 'ta_offer';
const DAY = 86400000;
const QUIET_PATHS = /^\/(curate|terms|privacy|sell)(\/|$)/;

function remembered() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}
function remember(state) {
  try { localStorage.setItem(KEY, JSON.stringify({ state, at: Date.now() })); } catch { /* private mode: shown again next time, no harm */ }
}

/** Resolves once the intro plate is done (or was never there). */
function afterIntro() {
  return new Promise((resolve) => {
    const box = document.querySelector('.intro');
    if (!box || box.classList.contains('is-done')) return resolve();
    const mo = new MutationObserver(() => {
      if (box.classList.contains('is-done')) { mo.disconnect(); resolve(); }
    });
    mo.observe(box, { attributes: true, attributeFilter: ['class'] });
    setTimeout(() => { mo.disconnect(); resolve(); }, 12000);
  });
}

export function initOffer() {
  if (QUIET_PATHS.test(location.pathname)) return;
  const seen = remembered();
  if (seen?.state === 'joined') return;
  if (seen?.state === 'dismissed' && Date.now() - seen.at < 30 * DAY) return;
  if (document.querySelector('[data-offer]')) return;

  let shown = false;
  const show = () => { if (!shown) { shown = true; mount(); } };
  afterIntro().then(() => {
    const timer = setTimeout(show, 9000);
    const onScroll = () => {
      if (window.scrollY > window.innerHeight * 0.6) {
        clearTimeout(timer);
        window.removeEventListener('scroll', onScroll);
        show();
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
  });
}

function mount() {
  const el = document.createElement('aside');
  el.className = 'offer';
  el.setAttribute('data-offer', '');
  el.setAttribute('aria-label', 'Join the list');
  el.innerHTML = `
    <button type="button" class="offer-close" data-offer-close>Close</button>
    <div data-offer-body>
      <p class="offer-kicker">First visit</p>
      <h2 class="offer-title">Ten percent off your first piece.</h2>
      <p class="offer-note">Join the list for drop notices. Your code arrives by email.</p>
      <form class="offer-form" novalidate>
        <input type="email" name="email" required autocomplete="email" placeholder="Email address" aria-label="Email address" />
        <input class="offer-hp" type="text" name="company" tabindex="-1" autocomplete="off" aria-hidden="true" />
        <button type="submit">Send my code</button>
      </form>
      <p class="offer-err" data-offer-err aria-live="polite"></p>
      <p class="offer-fine">One use, thirty days. Unsubscribe any time. <a href="/privacy">Privacy</a>.</p>
    </div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-in')));

  const leave = () => {
    el.classList.remove('is-in');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => el.remove(), 700);
  };
  const dismiss = () => { remember('dismissed'); leave(); };
  const onKey = (e) => { if (e.key === 'Escape') dismiss(); };
  document.addEventListener('keydown', onKey);
  el.querySelector('[data-offer-close]').addEventListener('click', dismiss);

  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const button = form.querySelector('button');
    const email = form.querySelector('input[type="email"]').value;
    const company = form.querySelector('[name="company"]').value;
    const err = el.querySelector('[data-offer-err]');
    err.textContent = '';
    button.disabled = true;
    button.textContent = 'Sending';
    const r = await joinList(email, 'offer', company);
    if (r.ok) {
      remember('joined');
      el.querySelector('[data-offer-body]').innerHTML = r.again
        ? `<p class="offer-kicker">The list</p><h2 class="offer-title">You are already with us.</h2><p class="offer-note">Your code went to this address when you joined.</p>`
        : `<p class="offer-kicker">The list</p><h2 class="offer-title">Your code is on its way.</h2><p class="offer-note">Check your inbox in the next few minutes. One use, thirty days.</p>`;
      setTimeout(leave, 6000);
      return;
    }
    button.disabled = false;
    button.textContent = 'Send my code';
    err.textContent = r.error === 'email' ? 'That address does not look right.'
      : r.error === 'slow down' ? 'Too many tries. Give it an hour.'
      : 'Something went wrong. Try again in a moment.';
  });
}
