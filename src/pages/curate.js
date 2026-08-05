/**
 * The Curation Desk — the cofounder tool.
 *
 *   /curate         drop a listing link from any device; see the shared pile
 *   /curate/review  the meeting: swipe the pile, right = shortlist, left = pass
 *
 * Render functions are pure shells (they run in the Node smoke test); all data,
 * auth and browser API work happens in the mount functions. Every user-entered
 * string passes through esc() before touching innerHTML, and URLs are gated by
 * validListingUrl() at entry AND at render — the desk is the site's first
 * untrusted input, and live mode lets any teammate account write the table.
 *
 * Copy discipline: practice mode must never claim a find reached the team.
 * Anything that says "shared" or "the whole team" branches on isLive().
 */

import { collections } from '../data/store.js';
import { breadcrumb, photoURL } from '../components/ui.js';
import { toast, initMagnetic } from '../lib/motion.js';
import { applyBaseToLinks } from '../lib/router.js';
import {
  initCurate, curUser, signIn, signOut, listFinds, addFind, setStatus, tally,
  isLive, esc, validListingUrl, sourceOf, displayTitle, whenLabel,
  photoRef, isDressed, missingBits, dressState, isDeckReady, deckSplit,
  showAnyway, showAllAnyway, DRESS_TRIES,
} from '../curate/data.js';
import { mountDeck } from '../curate/swipe.js';

const money = (n) =>
  n || n === 0
    ? `$${Number(n).toLocaleString('en-US', {
        minimumFractionDigits: Number(n) % 1 ? 2 : 0,
        maximumFractionDigits: 2,
      })}`
    : '';

/** The one place an untrusted URL becomes an href — re-gated at render, not
    just at entry, because live mode lets any teammate account write the column. */
const safeHref = (url) => esc(validListingUrl(url) || '#');

/**
 * A find's photo, gated for rendering. The gate itself is photoRef() in the
 * data layer — the SAME predicate the deck gate and the robot use — so the
 * deck can never gate on one rule and render with another. Only the deploy-
 * base prefixing (photoURL) stays here in the render layer.
 */
function findPhotoSrc(f) {
  const ref = photoRef(f);
  if (!ref) return '';
  return ref.kind === 'absolute' ? ref.value : photoURL(f);
}

/* --------------- who dresses the finds, said honestly --------------- */

/** Must never promise a robot on a device that has none. */
const dresserLine = () =>
  isLive()
    ? 'The robot visits the listing and brings back the picture, the title and the price.'
    : 'Nothing fetches pictures in practice mode, so a practice find stays a bare link — “Show it anyway” deals it at the meeting.';

const keepsTryingLine = () =>
  isLive()
    ? 'The robot keeps trying afterwards, so a picture that turns up later still lands on the card.'
    : 'Practice finds keep whatever they were dropped with.';

/** Global freshness — the machine-off signal. Practice mode says nothing. */
function robotLine(finds) {
  if (!isLive()) return '';
  const stamps = finds.map((f) => Date.parse(f.looked_at)).filter((n) => !Number.isNaN(n));
  if (!stamps.length) return 'The robot hasn’t been by yet.';
  const w = whenLabel(new Date(Math.max(...stamps)).toISOString());
  return w === 'Today' || w === 'Yesterday'
    ? `The robot came by ${w.toLowerCase()}.`
    : `The robot hasn’t been by since ${w}.`;
}

/** Small square plate for pile, shortlist and verdict rows. ALWAYS rendered —
    blank when there's no photo (or the image dies) so mixed lists keep one
    left edge. `mod` selects a size variant; the photo gate never forks. */
function thumb(f, mod = '') {
  const cls = `curate-thumb${mod ? ` curate-thumb--${mod}` : ''}`;
  const src = findPhotoSrc(f);
  if (!src) return `<span class="${cls} curate-thumb--blank" aria-hidden="true"></span>`;
  return `<span class="${cls}" data-photo-slot>
      <img src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer"
        onerror="this.parentElement.classList.add('curate-thumb--blank');this.remove()" />
    </span>`;
}

/** The only Mark-bought button in the file. */
const markBoughtBtn = (f) =>
  `<button class="curate-textbtn" data-mark="bought" data-id="${esc(f.id)}">Mark bought</button>`;

/**
 * THE shortlist row. One treatment, two consumers: the verdict list and the
 * desk's shortlist block. Photo-forward but still a ledger — a bigger plate,
 * the name and the price stacked beside it, the action where it always is.
 * Never reads f.status/f.decided_by (verdict cards are deck objects whose
 * local status is still 'new'); never emits data-find-id (the is-new
 * highlighter's first-match query must keep hitting the pile).
 */
function shortlistRow(f, action = '') {
  return `
  <li class="curate-row curate-row--shortlist" data-status="shortlist">
    ${thumb(f, 'shortlist')}
    <div class="curate-row-main">
      <span class="curate-row-tags">${sourceTag(f)}</span>
      <a class="curate-row-title" href="${safeHref(f.url)}" target="_blank" rel="noopener noreferrer">${esc(displayTitle(f))}&nbsp;↗</a>
      ${f.price || f.price === 0 ? `<p class="curate-row-price">${money(f.price)}</p>` : ''}
      <p class="curate-row-meta">found by ${esc(f.submitted_by || 'the team')}</p>
    </div>
    ${action}
  </li>`;
}

/**
 * ONE address for the shortlist. Every screen that ends a review session gets
 * this and only this way out. Falls back to the plain desk link when there is
 * nothing to point at, so the fragment is never a dead address.
 */
const deskOutButton = (shortlisted, solid = false) =>
  shortlisted
    ? `<a class="btn${solid ? ' btn--solid' : ''}" href="/curate#shortlist" data-magnetic>See the shortlist</a>`
    : `<a class="btn${solid ? ' btn--solid' : ''}" href="/curate" data-magnetic>Back to the desk</a>`;

/** "One find is" / "3 finds are" — for the end-of-session screens. */
const shortlistCount = (n) => (n === 1 ? 'One find is' : `${n} finds are`);

/* ------------------------------------------------------------------ */
/* Shared fragments                                                    */
/* ------------------------------------------------------------------ */

const practiceRibbon = () =>
  isLive()
    ? ''
    : `<p class="curate-ribbon" data-reveal>Practice mode — finds save to this device only.
       The shared desk opens when the team database is connected.</p>`;

const sourceTag = (f) =>
  f.source ? `<span class="plate-tag plate-tag--channel">${esc(f.source)}</span>` : '';

const STATUS_COPY = {
  new: 'Waiting for review',
  shortlist: 'Shortlisted',
  pass: 'Passed',
  bought: 'Bought',
};

/** Sign-in / name card, rendered by the gate when nobody is at the desk. */
function gateHTML(locked = true) {
  const sellNote = `<p class="curate-help" style="margin-top:1.2rem">This is the team’s buying
    desk. Selling us a piece? <a href="/sell">Sell to Us</a> is the door you want.</p>`;
  if (!isLive()) {
    return `
    <div class="curate-card curate-gate">
      <p class="eyebrow">${locked ? 'Team only' : 'The desk is open'}</p>
      <h3 class="display" style="margin:.4rem 0 1rem">Sign the desk</h3>
      <form data-gate-form class="curate-form">
        ${
          locked
            ? `<label><span class="eyebrow">Desk passphrase</span>
          <input name="passphrase" type="password" required autocomplete="off"
            autocapitalize="none" spellcheck="false" placeholder="Handed around the founders" />
        </label>`
            : ''
        }
        <label><span class="eyebrow">Your first name</span>
          <input name="name" required maxlength="40" autocomplete="given-name" placeholder="So the team knows who found what" />
        </label>
        <button class="btn btn--solid" type="submit" data-magnetic>Take the desk</button>
        <p class="curate-error" data-gate-error role="alert"></p>
        ${
          locked
            ? `<p class="curate-help">One passphrase for the whole team, asked once per device.
        Don’t have it? Any founder does.</p>`
            : ''
        }
      </form>
      ${sellNote}
    </div>`;
  }
  return `
  <div class="curate-card curate-gate">
    <p class="eyebrow">Team only</p>
    <h3 class="display" style="margin:.4rem 0 1rem">Sign in to the desk</h3>
    <form data-gate-form class="curate-form">
      <label><span class="eyebrow">Email</span>
        <input name="email" type="email" required autocomplete="email" placeholder="The address your account was made with" />
      </label>
      <label><span class="eyebrow">Password</span>
        <input name="password" type="password" required autocomplete="current-password" placeholder="Handed out with your invite" />
      </label>
      <button class="btn btn--solid" type="submit" data-magnetic>Sign in</button>
      <p class="curate-error" data-gate-error role="alert"></p>
      <p class="curate-help">You stay signed in on this device — this is a one-time step.
      Lost password? Ask your Technical Officer for a reset; there is nothing to recover by email.</p>
    </form>
    ${sellNote}
  </div>`;
}

/**
 * Auth gate shared by both pages. Initialises the data layer, shows the
 * sign-in / name card if needed, then calls ready(). Self-cleans if the
 * visitor navigates away mid-gate.
 */
async function gate(app, ready) {
  let boot;
  try {
    boot = await initCurate();
  } catch (err) {
    app.innerHTML = `<div class="curate-card"><p class="curate-error">The desk could not open — ${esc(err.message)}.
      Check the connection and refresh.</p></div>`;
    return;
  }
  if (!app.isConnected) return;

  if (boot.user) {
    await ready(boot.user);
    return;
  }

  app.innerHTML = gateHTML(boot.locked !== false);
  applyBaseToLinks(app);
  initMagnetic(app);
  const form = app.querySelector('[data-gate-form]');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = app.querySelector('[data-gate-error]');
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      const user = isLive()
        ? await signIn(form.email.value.trim(), form.password.value)
        : await signIn(form.name.value, form.passphrase?.value ?? '');
      if (!app.isConnected) return;
      toast(`Welcome to the desk, ${user.name}`);
      await ready(user);
    } catch (err) {
      button.disabled = false;
      if (errorEl) errorEl.textContent = err.message;
      else toast(err.message);
    }
  });
}

/** "At the desk: Sam · sign out" strip. */
function deskBar(user, extra = '') {
  return `
  <div class="curate-deskbar">
    <span>At the desk: <b>${esc(user.name)}</b></span>
    ${extra}
    <button class="curate-textbtn" data-signout type="button">Sign out</button>
  </div>`;
}

function wireSignOut(app, remount) {
  app.querySelector('[data-signout]')?.addEventListener('click', async () => {
    await signOut();
    remount();
  });
}

/* ------------------------------------------------------------------ */
/* /curate — the desk                                                  */
/* ------------------------------------------------------------------ */

export function curate() {
  return `
  <section class="section" style="padding-top:calc(var(--header-h) + 4rem)">
    <div class="wrap">
      ${breadcrumb([{ label: 'Home', href: '/' }, { label: 'Procurement Desk' }])}
      <div class="coll-hero-grid" data-hero>
        <div>
          <p class="eyebrow" data-hero-meta><span>Acquisitions · team only</span></p>
          <h1 class="display" style="margin:.6rem 0 1.2rem;font-size:clamp(2.6rem,6vw,5.5rem);font-weight:600">
            <span class="line-mask"><span>The Procurement</span></span>
            <span class="line-mask"><span>Desk</span></span>
          </h1>
          <p class="lede" data-hero-cta>
            Anything found in the wild is dropped here and lands in one pile.
            When the team meets, the pile is reviewed one card at a time —
            right for the shortlist, left to pass.
          </p>
        </div>
        <div data-hero-cta>
          <p class="eyebrow" style="margin-bottom:.9rem">The protocol</p>
          <ul class="facts">
            <li><span>Drop</span><b>Paste the listing’s link</b></li>
            <li><span>Review</span><b>Right shortlists · left passes</b></li>
            <li><span>Verdict</span><b>The shortlist, with links</b></li>
            <li><span>Deleted</span><b>Never — a pass can be argued back</b></li>
          </ul>
        </div>
      </div>
      ${practiceRibbon()}
    </div>
  </section>

  <section class="section" style="padding-top:0">
    <div class="wrap">
      <div class="curate-app" data-curate-app aria-live="polite">
        <div class="curate-card"><p class="curate-help">Opening the desk…</p></div>
      </div>
    </div>
  </section>

  <section class="section" style="padding-top:0">
    <div class="wrap">
      <div class="accordion" data-reveal style="max-width:var(--maxw-desk)">
        <div class="accordion-item">
          <button class="accordion-trigger">How this works <i>+</i></button>
          <div class="accordion-panel"><div>
            <ol class="curate-steps">
              <li><b>Find.</b> eBay, Depop, a thrift aisle, anywhere. Copy the listing’s
              link — on a phone, Share → Copy link.</li>
              <li><b>Drop.</b> Paste it into the desk. It joins the pile
              the moment you do.</li>
              <li><b>Review.</b> At the meeting, the pile is taken one card at a time.
              Shortlisted finds keep their links, ready to buy.</li>
            </ol>
          </div></div>
        </div>
      </div>
    </div>
  </section>`;
}

const dropFormHTML = () => `
  <div class="curate-card">
    <p class="eyebrow">Acquisitions</p>
    <h3 class="display" style="margin:.4rem 0 .4rem">Drop a find</h3>
    <form data-drop-form class="curate-form" style="margin-top:.8rem">
      <label><span class="eyebrow">Listing link</span>
        <input name="url" required inputmode="url" autocomplete="off" spellcheck="false"
          placeholder="Paste the eBay / Depop / anywhere link" />
        <span class="curate-hint" data-source-hint></span>
      </label>
      <div class="curate-form-row">
        <label><span class="eyebrow">What is it? <i>(optional)</i></span>
          <input name="title" maxlength="120" placeholder="e.g. Slazenger lambswool V-neck" />
        </label>
        <label><span class="eyebrow">Asking price <i>(optional)</i></span>
          <input name="price" type="number" min="0" step="0.01" inputmode="decimal" placeholder="$" />
        </label>
      </div>
      <label><span class="eyebrow">Files under <i>(optional)</i></span>
        <select name="collection">
          <option value="">— let the meeting decide —</option>
          ${collections()
            .map((c) => `<option value="${c.id}">${c.name}</option>`)
            .join('')}
        </select>
      </label>
      <button class="btn btn--solid" type="submit" data-magnetic>Add to the pile</button>
      <p class="curate-note" data-drop-note role="status"></p>
      <p class="curate-error" data-drop-error role="alert"></p>
    </form>
  </div>`;

/** One chip per row — never two, because "Waiting for review · Being dressed"
    on the same line is a contradiction. */
function newChip(f) {
  const s = dressState(f);
  if (s === 'waiting') return ['dressing', 'Being dressed'];
  if (s === 'given-up') return ['bare', 'Still bare'];
  return ['new', 'Waiting for review']; // dressed OR sent-anyway → it's in the deck
}

function pileRow(f) {
  const state = f.status === 'new' ? dressState(f) : null;
  const undressed = f.status === 'new' && !isDressed(f);
  const acted =
    f.status === 'shortlist'
      ? markBoughtBtn(f)
      : f.status === 'pass'
      ? `<button class="curate-textbtn" data-mark="new" data-id="${esc(f.id)}">Back to the pile</button>`
      : undressed && !f.show_anyway
      ? `<button class="curate-textbtn" data-show-anyway data-id="${esc(f.id)}">Show it anyway</button>`
      : '';
  const [chipKey, chipText] =
    f.status === 'new' ? newChip(f) : [f.status, STATUS_COPY[f.status] || f.status];
  return `
  <li class="curate-row" data-status="${esc(f.status)}" data-find-id="${esc(f.id)}"${
    state ? ` data-dress="${esc(state)}"` : ''
  }>
    ${thumb(f)}
    <div class="curate-row-main">
      <span class="curate-row-tags">${sourceTag(f)}
        <span class="curate-status curate-status--${esc(chipKey)}">${esc(chipText)}</span></span>
      <a class="curate-row-title" href="${safeHref(f.url)}" target="_blank" rel="noopener noreferrer">${esc(displayTitle(f))}&nbsp;↗</a>
      ${f.note ? `<p class="curate-row-note">${esc(f.note)}</p>` : ''}
      ${
        undressed && !f.show_anyway
          ? `<p class="curate-row-dress">${
              state === 'given-up'
                ? isLive()
                  ? `The robot couldn’t get what this card needs.${
                      Number(f.dress_tries) ? ` Tried ${Number(f.dress_tries)} time${Number(f.dress_tries) === 1 ? '' : 's'}.` : ''
                    } ${esc(missingBits(f))}`
                  : `Nothing here fetches pictures, so this one stays a bare link. ${esc(missingBits(f))}`
                : `${esc(missingBits(f))} ${esc(dresserLine())}`
            }</p>`
          : ''
      }
      <p class="curate-row-meta">
        ${f.price || f.price === 0 ? `${money(f.price)} · ` : ''}found by ${esc(f.submitted_by || 'the team')} · ${esc(whenLabel(f.created_at))}
        ${f.status !== 'new' && f.decided_by ? ` · ${(STATUS_COPY[f.status] || f.status).toLowerCase()} by ${esc(f.decided_by)}` : ''}
        ${f.status === 'new' && f.show_anyway && !isDressed(f) ? ' · shown anyway' : ''}
      </p>
    </div>
    ${acted}
  </li>`;
}

export function deskHTML(user, finds) {
  const t = tally(finds);
  const split = deckSplit(finds);
  const listed = finds.filter((f) => f.status === 'shortlist');
  const rows = finds.map(pileRow).join('');
  const emptyCopy = isLive()
    ? 'Nothing here yet. Paste the first link above and it appears for the whole team.'
    : 'Nothing here yet. Paste the first link above — in practice mode it stays on this device.';
  const cta = split.ready
    ? `Review the pile (${split.ready})`
    : split.waiting
    ? 'See what’s waiting'
    : 'Review session';
  return `
  ${deskBar(user)}
  ${dropFormHTML()}
  <div class="curate-stats">
    <div class="stat"><b>${split.ready}</b><span>Ready to review</span></div>
    ${
      // the shortlist's front door. A dead link at 0 is worse than no link.
      listed.length
        ? `<a class="stat" href="#shortlist"><b>${listed.length}</b><span>Shortlisted</span></a>`
        : `<div class="stat"><b>0</b><span>Shortlisted</span></div>`
    }
    <div class="stat"><b>${t.bought}</b><span>Bought</span></div>
    <a class="btn btn--solid" href="/curate/review" data-magnetic
       style="align-self:center;justify-self:end">${cta}</a>
  </div>
  ${
    split.waiting
      ? `<p class="curate-help curate-dress-summary">${split.waiting} ${
          split.waiting === 1 ? 'find is' : 'finds are'
        } ${isLive() ? 'still being dressed' : 'still bare'} — a card needs a picture and a name before it reaches the deck.
        ${esc(dresserLine())} ${esc(robotLine(finds))}</p>`
      : ''
  }
  ${
    listed.length
      ? `<div class="curate-pile curate-shortlist" id="shortlist">
          <div class="section-head" style="margin-bottom:1rem">
            <div>
              <p class="eyebrow">The shortlist</p>
              <h3 class="display" style="margin-top:.5rem">${listed.length} waiting to be bought</h3>
            </div>
          </div>
          <ul class="curate-list curate-list--shortlist">${listed
            .map((f) => shortlistRow(f, markBoughtBtn(f)))
            .join('')}</ul>
        </div>`
      : ''
  }
  <div class="curate-pile">
    <div class="section-head" style="margin-bottom:1rem">
      <div>
        <p class="eyebrow">The pile</p>
        <h3 class="display" style="margin-top:.5rem">Everything, newest first</h3>
      </div>
    </div>
    ${
      finds.length
        ? `<ul class="curate-list">${rows}</ul>`
        : `<p class="curate-help">${emptyCopy}</p>`
    }
  </div>`;
}

export function mountCurate(outlet) {
  const app = outlet.querySelector('[data-curate-app]');
  if (!app) return;

  // /curate#shortlist arrives before the desk exists — the router scrolls to
  // top and never reads the hash. Honour it here, ONCE per visit: focus
  // refreshes and Mark-bought re-runs of show() must not yank the page down.
  let hashHonoured = false;

  const mount = () => gate(app, show);
  wirePileRefreshOnFocus(app, () => {
    // returning from a listing tab must never eat a half-typed drop form
    const form = app.querySelector('[data-drop-form]');
    const dirty =
      form &&
      (form.url.value.trim() || form.title.value.trim() ||
        form.price.value || form.collection.value);
    if (dirty) return;
    const user = curUser();
    if (user) show(user);
  });

  async function show(user) {
    let finds;
    try {
      finds = await listFinds();
    } catch (err) {
      app.innerHTML = `<div class="curate-card"><p class="curate-error">${esc(err.message)}</p></div>`;
      return;
    }
    if (!app.isConnected) return;
    app.innerHTML = deskHTML(user, finds);
    applyBaseToLinks(app);
    initMagnetic(app);
    wireSignOut(app, mount);
    wireDropForm(app, user, show);
    wireMarks(app, user, show);
    wireShowAnyway(app, user, show);
    if (!hashHonoured && location.hash === '#shortlist') {
      hashHonoured = true; // one attempt per visit, found or not
      app.querySelector('#shortlist')?.scrollIntoView({ block: 'start' });
    }
  }

  mount();
}

function wireDropForm(app, user, refresh) {
  const form = app.querySelector('[data-drop-form]');
  if (!form) return;
  const hint = app.querySelector('[data-source-hint]');
  const errorEl = app.querySelector('[data-drop-error]');
  const noteEl = app.querySelector('[data-drop-note]');
  let untitledWarned = false;

  form.url.addEventListener('input', () => {
    const src = sourceOf(form.url.value);
    hint.textContent = src ? `${src} — recognised` : '';
    errorEl.textContent = '';
    noteEl.textContent = '';
    noteEl.classList.remove('curate-note--logged');
    untitledWarned = false;
  });

  // Photo link: prove it renders the moment it's pasted, not at the meeting.
  // photoState feeds the submit guard — a link the preview has PROVEN dead
  // must not ride into the pile just because it parses as a URL.
  let photoState = 'empty'; // empty | checking | ok | bad
  let photoWarned = false;
  const photoHint = app.querySelector('[data-photo-hint]');
  const preview = app.querySelector('[data-photo-preview]');
  const previewImg = preview?.querySelector('img');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    noteEl.textContent = '';
    const url = validListingUrl(form.url.value);
    if (!url) {
      errorEl.textContent =
        'Not a link. Copy the listing’s address from the browser bar, or Share → Copy link in the app.';
      return;
    }
    // an untitled numeric link becomes an undecidable card at the meeting —
    // warn once, then let a second press drop it as-is
    const fallback = displayTitle({ title: '', url });
    if (!untitledWarned && !form.title.value.trim() && fallback.startsWith('Listing on ')) {
      untitledWarned = true;
      noteEl.textContent = `No title — this one won’t reach the deck until it has a name. Add a few words about what it is, or press Add again to drop it as-is${
        isLive() ? ' and let the robot try' : ''
      }.`;
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const result = await addFind({
        url,
        title: form.title.value.trim(),
        note: '', // the desk stopped asking; the column stays
        price: form.price.value === '' ? null : Number(form.price.value),
        source: sourceOf(url),
        photo: '', // the robot's column now — never the finder's
        collection: form.collection.value,
        submitted_by: user.name,
      });
      if (!result.ok) {
        noteEl.textContent = `Already in the pile — ${
          result.dupe?.submitted_by ? `${result.dupe.submitted_by} dropped it ${whenLabel(result.dupe.created_at).toLowerCase()}` : 'someone beat you to it'
        }. Nothing lost.`;
        return;
      }
      toast(
        isLive()
          ? 'In the pile — the whole team can see it now'
          : 'Saved to this device — the team sees it once the shared desk is on'
      );
      await refresh(user);
      // the refresh rebuilt the DOM — confirm the entry on the FRESH card
      // (a toast is gone in 3 seconds; this note stays until the next paste)
      // and light up the row it landed in. The copy is honest about the gate:
      // a bare link is in the pile but NOT yet in the deck.
      const freshNote = app.querySelector('[data-drop-note]');
      if (freshNote) {
        freshNote.textContent = isLive()
          ? `Logged — “${displayTitle(result.find)}” is in the pile. It’s being dressed: a card needs a picture and a name before it reaches the deck. ${dresserLine()}`
          : `Logged — “${displayTitle(result.find)}” is in the pile. ${dresserLine()}`;
        freshNote.classList.add('curate-note--logged');
      }
      app.querySelector(`[data-find-id="${result.find.id}"]`)?.classList.add('is-new');
    } catch (err) {
      errorEl.textContent = err.message;
    } finally {
      button.disabled = false;
    }
  });
}

function wireMarks(app, user, refresh) {
  app.querySelectorAll('[data-mark]').forEach((b) =>
    b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        await setStatus(b.dataset.id, b.dataset.mark, user.name);
        toast(b.dataset.mark === 'bought' ? 'Marked bought — into the archive it goes' : 'Back in the pile');
        await refresh(user);
      } catch (err) {
        b.disabled = false;
        toast(err.message);
      }
    })
  );
}

/** "Show it anyway" — the per-row escape hatch. A second tap anywhere on the
    team is a quiet no-op, not an error. */
function wireShowAnyway(app, user, refresh) {
  app.querySelectorAll('[data-show-anyway]').forEach((b) =>
    b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        const done = await showAnyway(b.dataset.id);
        toast(done ? 'Sent through — it will be dealt at the next review' : 'Someone already sent that one through');
        await refresh(user);
      } catch (err) {
        b.disabled = false;
        toast(err.message);
      }
    })
  );
}

/** The bulk hatch, two-press confirmed, only ever at the moment of failure. */
function wireDealAnyway(app, user, waiting, refresh) {
  const btn = app.querySelector('[data-deal-anyway]');
  if (!btn) return;
  const original = btn.textContent;
  let armed = false;
  btn.addEventListener('click', async () => {
    if (!armed) {
      armed = true;
      btn.textContent = `Yes — deal ${waiting.length} as ${waiting.length === 1 ? 'it is' : 'they are'}`;
      return;
    }
    btn.disabled = true;
    try {
      await showAllAnyway(waiting.map((f) => f.id));
      await refresh(user); // full remount → the deck deals. Never a live-queue mutation.
    } catch (err) {
      btn.disabled = false;
      armed = false;
      btn.textContent = original;
      toast(err.message);
    }
  });
}

/** Refresh the pile when the tab regains focus (teammates add while you look away). */
function wirePileRefreshOnFocus(app, refresh) {
  const onFocus = () => {
    if (!app.isConnected) {
      window.removeEventListener('focus', onFocus);
      return;
    }
    refresh();
  };
  window.addEventListener('focus', onFocus);
}

/* ------------------------------------------------------------------ */
/* /curate/review — the meeting                                        */
/* ------------------------------------------------------------------ */

export function curateReview() {
  return `
  <section class="section" style="padding-top:calc(var(--header-h) + 2.5rem)">
    <div class="wrap">
      ${breadcrumb([
        { label: 'Home', href: '/' },
        { label: 'Procurement Desk', href: '/curate' },
        { label: 'Review' },
      ])}
      <div class="coll-hero-grid" data-hero>
        <div>
          <p class="eyebrow" data-hero-meta><span>The meeting · one card at a time</span></p>
          <h1 class="display" style="margin:.6rem 0 1rem;font-size:clamp(2.2rem,5vw,4.2rem)">
            <span class="line-mask"><span>Review Session</span></span>
          </h1>
          <p class="lede" data-hero-cta style="margin-bottom:0">
            Right shortlists, left passes — swipe the card or use the buttons.
            Every decision is recorded with a name, and nothing is deleted.
          </p>
        </div>
        <div data-hero-cta>
          <p class="eyebrow" style="margin-bottom:.9rem">Table manners</p>
          <ul class="facts">
            <li><span>Swipe right</span><b>Shortlist</b></li>
            <li><span>Swipe left</span><b>Pass</b></li>
            <li><span>Undo</span><b>↩ or the Z key</b></li>
            <li><span>Changed minds</span><b>Back to the pile, from the desk</b></li>
          </ul>
        </div>
      </div>
      ${practiceRibbon()}
    </div>
  </section>

  <section class="section" style="padding-top:1.5rem">
    <div class="wrap">
      <div class="curate-app" data-review-app aria-live="polite">
        <div class="curate-card"><p class="curate-help">Shuffling the pile…</p></div>
      </div>
      <div class="curate-app">
        <p class="curate-help curate-deck-hint" data-deck-hint>
          <span class="deck-kbd">Keyboard: ← pass · → shortlist · Z undo &nbsp;·&nbsp; </span><a href="/curate">back to the desk</a>
        </p>
      </div>
    </div>
  </section>`;
}

export function reviewCardHTML(f) {
  const src = findPhotoSrc(f);
  return `
  <div class="deck-card-body ${src ? 'deck-card-body--photo' : ''}">
    ${
      src
        ? `<div class="deck-photo" data-photo-slot>
            <img class="plate-photo" src="${esc(src)}" alt="${esc(displayTitle(f))}"
              loading="lazy" referrerpolicy="no-referrer" draggable="false"
              onerror="this.closest('.deck-card-body').classList.remove('deck-card-body--photo');this.remove()" />
          </div>`
        : ''
    }
    <div class="deck-cap">
      <div class="deck-card-top">
        ${sourceTag(f)}
        ${f.price || f.price === 0 ? `<span class="deck-price">${money(f.price)}</span>` : ''}
      </div>
      <h3 class="deck-title">${esc(displayTitle(f))}</h3>
      <p class="deck-note">${f.note ? `“${esc(f.note)}”` : ''}</p>
      <p class="deck-meta">Found by ${esc(f.submitted_by || 'the team')} · ${esc(whenLabel(f.created_at))}
        ${f.collection ? ` · for ${esc(collections().find((c) => c.id === f.collection)?.name || f.collection)}` : ''}</p>
      <a class="deck-link" href="${safeHref(f.url)}" target="_blank" rel="noopener noreferrer"
         draggable="false">View the listing ↗</a>
    </div>
  </div>`;
}

export function verdictHTML(decided, waiting = [], deskShortlist = 0) {
  const listed = decided.filter((d) => d.dir === 'right');
  const passed = decided.length - listed.length;
  const onDesk = deskShortlist + listed.length;
  return `
  <div class="curate-card curate-verdict" data-verdict>
    <p class="eyebrow">The verdict</p>
    <h3 class="display" style="margin:.4rem 0 1rem">${
      waiting.length ? `Deck done — ${waiting.length} still being dressed` : 'Pile clear'
    }${listed.length ? ` — ${listed.length} for the shortlist` : ''}</h3>
    ${
      listed.length
        ? `<ul class="curate-list curate-list--shortlist">${listed
            .map(({ card: f }) => shortlistRow(f, markBoughtBtn(f)))
            .join('')}</ul>`
        : `<p class="curate-help">Nothing shortlisted this round.</p>`
    }
    <p class="curate-row-meta" style="margin-top:.8rem">${passed} passed${passed ? ' — still on the desk if anyone wants to argue' : ''}.</p>
    ${
      waiting.length
        ? `<div style="margin-top:1rem">
            <p class="eyebrow" style="margin-bottom:.4rem">Still being dressed</p>
            <ul class="curate-list">${waiting.map(pileRow).join('')}</ul>
          </div>`
        : ''
    }
    <p class="curate-help" style="margin-top:.6rem">This summary lives only on this screen —
      copy it before you leave. ${
        onDesk
          ? 'The finds themselves are safe on the desk, under The shortlist.'
          : 'Every decision is saved on the desk — nothing here is lost.'
      }</p>
    <div class="curate-verdict-actions">
      ${listed.length ? `<button class="btn btn--solid" data-copy-verdict data-magnetic>Copy the shortlist</button>` : ''}
      ${waiting.length ? `<button class="btn" data-deal-anyway data-magnetic>Deal them anyway (${waiting.length})</button>` : ''}
      ${deskOutButton(onDesk)}
    </div>
  </div>`;
}

function verdictText(decided) {
  const listed = decided.filter((d) => d.dir === 'right');
  const lines = [
    `Tour Archive — procurement verdict (${new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short' })})`,
    `Shortlisted ${listed.length} of ${decided.length}:`,
    ...listed.map(({ card: f }) =>
      `• ${displayTitle(f)}${f.price || f.price === 0 ? ` — ${money(f.price)}` : ''}${f.source ? ` (${f.source})` : ''}\n  ${f.url}`
    ),
  ];
  return lines.join('\n');
}

export function mountCurateReview(outlet) {
  const app = outlet.querySelector('[data-review-app]');
  if (!app) return;
  const hintEl = outlet.querySelector('[data-deck-hint]');

  const mount = () => gate(app, show);

  async function show(user) {
    let finds;
    try {
      finds = await listFinds();
    } catch (err) {
      app.innerHTML = `<div class="curate-card"><p class="curate-error">${esc(err.message)}</p></div>`;
      return;
    }
    if (!app.isConnected) return;
    const unreviewed = finds.filter((f) => f.status === 'new');
    // THE DECK GATE: dressed, or explicitly sent through. Oldest first —
    // nothing rots at the bottom of the pile.
    const pile = unreviewed.filter(isDeckReady).reverse();
    const waiting = unreviewed.filter((f) => !isDeckReady(f));
    const decided = [];
    const onDesk = tally(finds).shortlist;

    // (b) nothing dealable, but finds ARE waiting — the screen this gate
    // exists for. Never says "empty" over an undealt pile.
    if (!pile.length && waiting.length) {
      if (hintEl) hintEl.style.display = 'none';
      app.innerHTML = `
        ${deskBar(user)}
        <div class="curate-card">
          <p class="eyebrow">Still being dressed</p>
          <h3 class="display" style="margin:.4rem 0 1rem">Nothing is ready to review yet</h3>
          <p class="curate-help">${waiting.length} ${waiting.length === 1 ? 'find is' : 'finds are'} in the pile,
            but ${waiting.length === 1 ? 'it hasn’t' : 'none have'} got both a picture and a name yet.
            ${esc(dresserLine())} ${esc(robotLine(finds))}</p>
          <ul class="curate-list" style="margin-top:1.2rem">${waiting.map(pileRow).join('')}</ul>
          <p class="curate-help" style="margin-top:1rem">Show them as they are and the meeting gets a bare
            link with whatever was typed. ${esc(keepsTryingLine())}</p>
          ${
            onDesk
              ? `<p class="curate-help" style="margin-top:.6rem">${shortlistCount(onDesk)} already on the
            shortlist, waiting to be bought — on the desk, under The shortlist.</p>`
              : ''
          }
          <div class="curate-verdict-actions">
            <button class="btn btn--solid" data-deal-anyway data-magnetic>Deal them anyway (${waiting.length})</button>
            ${deskOutButton(onDesk)}
          </div>
        </div>`;
      applyBaseToLinks(app);
      initMagnetic(app);
      wireSignOut(app, mount);
      wireShowAnyway(app, user, show);
      wireDealAnyway(app, user, waiting, show);
      return;
    }

    // (c) genuinely nothing — only reachable when it is true
    if (!pile.length) {
      if (hintEl) hintEl.style.display = 'none';
      app.innerHTML = `
        ${deskBar(user)}
        <div class="curate-card" style="text-align:center">
          <p class="eyebrow">All clear</p>
          <h3 class="display" style="margin:.4rem 0 1rem">The pile is empty</h3>
          <p class="curate-help">Every find has been reviewed. The desk is open
            when the next one turns up.</p>
          <div class="curate-verdict-actions" style="justify-content:center">
            ${deskOutButton(onDesk, true)}
          </div>
        </div>`;
      applyBaseToLinks(app);
      initMagnetic(app);
      wireSignOut(app, mount);
      return;
    }

    // (a) deal, and say almost nothing — one quiet state note beside the
    // counter. It is a state, not a promise: the deck is a snapshot.
    if (hintEl) hintEl.style.display = '';
    app.innerHTML = `
      ${deskBar(user, `<span class="curate-counter" data-deck-count>${pile.length} to review</span>` +
        `<span class="curate-counter" data-deck-shortlisted hidden>0 shortlisted</span>` +
        (waiting.length ? `<span class="curate-waiting-note">${waiting.length} still being dressed</span>` : '')
      )}
      <div class="deck-stage" data-deck-stage></div>
      <div class="deck-controls">
        <button class="deck-btn deck-btn--pass" data-deck-pass type="button" aria-label="Pass">✕<small>Pass</small></button>
        <button class="deck-btn deck-btn--undo" data-deck-undo type="button" aria-label="Undo" disabled>↩<small>Undo</small></button>
        <button class="deck-btn deck-btn--yes" data-deck-yes type="button" aria-label="Shortlist">✓<small>Shortlist</small></button>
      </div>`;
    applyBaseToLinks(app);
    initMagnetic(app);
    wireSignOut(app, mount);

    const stage = app.querySelector('[data-deck-stage]');
    const counter = app.querySelector('[data-deck-count]');
    const shortCounter = app.querySelector('[data-deck-shortlisted]');
    const undoBtn = app.querySelector('[data-deck-undo]');
    const controls = app.querySelector('.deck-controls');

    // DERIVED, never incremented: undo pops `decided`, and a counter that only
    // counts up would keep claiming a shortlist the desk no longer holds.
    const paintShortlisted = () => {
      if (!shortCounter) return;
      const n = decided.reduce((sum, d) => sum + (d.dir === 'right' ? 1 : 0), 0);
      shortCounter.textContent = `${n} shortlisted`;
      shortCounter.hidden = n === 0;
    };
    // ONE toast, on the first right-swipe of the session — where the card went.
    let saidWhereItGoes = false;

    const deck = mountDeck(stage, {
      cards: pile,
      renderCard: reviewCardHTML,
      onDecide(card, dir) {
        decided.push({ card, dir });
        undoBtn.disabled = false;
        counter.textContent = `${deck.size()} to review`;
        paintShortlisted();
        if (dir === 'right' && !saidWhereItGoes) {
          saidWhereItGoes = true;
          toast('Shortlisted — it’s on the desk under The shortlist');
        }
        setStatus(card.id, dir === 'right' ? 'shortlist' : 'pass', user.name).catch((err) =>
          toast(`Not saved — ${err.message}`)
        );
      },
      onEmpty() {
        // Undo must survive into the verdict — a phone has no Z key, and the
        // last card is where a misfired swipe hurts most.
        stage.style.display = 'none';
        app.querySelector('[data-deck-pass]').style.display = 'none';
        app.querySelector('[data-deck-yes]').style.display = 'none';
        if (hintEl) hintEl.style.display = 'none';
        counter.textContent = 'done';
        controls.insertAdjacentHTML('afterend', verdictHTML(decided, waiting, onDesk));
        applyBaseToLinks(app);
        initMagnetic(app);
        wireShowAnyway(app, user, show);
        wireDealAnyway(app, user, waiting, show);
        // mark-bought patches the row in place — a full re-render here would
        // replace the verdict with the "pile is empty" screen mid-celebration
        app.querySelectorAll('[data-verdict] [data-mark]').forEach((b) =>
          b.addEventListener('click', async () => {
            b.disabled = true;
            try {
              await setStatus(b.dataset.id, 'bought', user.name);
              toast('Marked bought — into the archive it goes');
              const row = b.closest('.curate-row');
              row?.setAttribute('data-status', 'bought');
              const chip = document.createElement('span');
              chip.className = 'curate-status curate-status--bought';
              chip.textContent = 'Bought';
              b.replaceWith(chip);
            } catch (err) {
              b.disabled = false;
              toast(err.message);
            }
          })
        );
        const copyBtn = app.querySelector('[data-copy-verdict]');
        copyBtn?.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(verdictText(decided));
            toast('Copied — the shortlist, with links');
          } catch {
            copyBtn.textContent = 'Copy failed — select and copy the list above';
          }
        });
      },
    });

    // A phone lands with the deck below the fold; bring it into view once.
    requestAnimationFrame(() => {
      if (!controls.isConnected) return;
      const bottom = controls.getBoundingClientRect().bottom;
      if (bottom <= window.innerHeight) return;
      // The card grew, so on a short phone the card and the buttons may not
      // both fit. Then the BUTTONS win: a half-seen card can still be swiped,
      // an off-screen ✓ is a dead end. (The name and price live at the card's
      // BOTTOM edge, so the buttons-first framing keeps them visible.)
      const rig = bottom - stage.getBoundingClientRect().top;
      if (rig + 12 <= window.innerHeight) stage.scrollIntoView({ block: 'start' });
      else controls.scrollIntoView({ block: 'end' });
    });

    app.querySelector('[data-deck-pass]').addEventListener('click', () => deck.decide('left'));
    app.querySelector('[data-deck-yes]').addEventListener('click', () => deck.decide('right'));
    undoBtn.addEventListener('click', async () => {
      const last = decided[decided.length - 1];
      if (!last) return;
      // if the verdict is showing, rebuild the session instead of patching it
      const verdict = app.querySelector('[data-verdict]');
      if (verdict) {
        decided.pop();
        undoBtn.disabled = decided.length === 0;
        try {
          await setStatus(last.card.id, 'new', user.name);
        } catch (err) {
          toast(`Not saved — ${err.message}`);
        }
        show(user);
        return;
      }
      // the deck refuses while a card is mid-flight — commit nothing then,
      // or a mashed Z during one animation would silently revert the pile
      if (!deck.undo(last.card, last.dir)) return;
      decided.pop();
      undoBtn.disabled = decided.length === 0;
      counter.textContent = `${deck.size()} to review`;
      paintShortlisted();
      setStatus(last.card.id, 'new', user.name).catch((err) => toast(`Not saved — ${err.message}`));
    });

    // keyboard drives the same paths; self-removes when the stage is gone
    const onKey = (e) => {
      if (!stage.isConnected) {
        document.removeEventListener('keydown', onKey);
        return;
      }
      if (e.target.closest('input, textarea, select')) return;
      if (e.key === 'ArrowLeft') deck.decide('left');
      else if (e.key === 'ArrowRight') deck.decide('right');
      else if (e.key.toLowerCase() === 'z') undoBtn.click();
    };
    document.addEventListener('keydown', onKey);
  }

  mount();
}
