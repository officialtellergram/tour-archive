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
import { breadcrumb } from '../components/ui.js';
import { toast, initMagnetic } from '../lib/motion.js';
import { applyBaseToLinks } from '../lib/router.js';
import {
  initCurate, curUser, signIn, signOut, listFinds, addFind, setStatus, tally,
  isLive, esc, validListingUrl, sourceOf, displayTitle, whenLabel,
} from '../curate/data.js';
import { mountDeck } from '../curate/swipe.js';

const money = (n) => (n || n === 0 ? `$${Number(n).toLocaleString('en-US')}` : '');

/** The one place an untrusted URL becomes an href — re-gated at render, not
    just at entry, because live mode lets any teammate account write the column. */
const safeHref = (url) => esc(validListingUrl(url) || '#');

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
function gateHTML() {
  const sellNote = `<p class="curate-help" style="margin-top:1.2rem">This is the team’s buying
    desk. Selling us a piece? <a href="/sell">Sell to Us</a> is the door you want.</p>`;
  if (!isLive()) {
    return `
    <div class="curate-card curate-gate">
      <p class="eyebrow">The desk is open</p>
      <h3 class="display" style="margin:.4rem 0 1rem">Sign the desk</h3>
      <form data-gate-form class="curate-form">
        <label><span class="eyebrow">Your first name</span>
          <input name="name" required maxlength="40" autocomplete="given-name" placeholder="So the team knows who found what" />
        </label>
        <button class="btn btn--solid" type="submit" data-magnetic>Take the desk</button>
        <p class="curate-error" data-gate-error role="alert"></p>
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

  app.innerHTML = gateHTML();
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
        : await signIn(form.name.value);
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
      ${breadcrumb([{ label: 'Home', href: '/' }, { label: 'Curation Desk' }])}
      <div class="coll-hero-grid" data-hero>
        <div>
          <p class="eyebrow" data-hero-meta><span>Acquisitions · team only</span></p>
          <h1 class="display" style="margin:.6rem 0 1.2rem;font-size:clamp(2.6rem,6vw,5.5rem)">
            <span class="line-mask"><span>The Curation</span></span>
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
              <li><b>Drop.</b> Paste it into the desk, with a note if there is one.
              It joins the pile the moment you do.</li>
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
      <label><span class="eyebrow">Why it caught your eye <i>(optional)</i></span>
        <textarea name="note" rows="2" maxlength="500" placeholder="Condition, crest, era — anything the team should weigh"></textarea>
      </label>
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

function pileRow(f) {
  const acted =
    f.status === 'shortlist'
      ? `<button class="curate-textbtn" data-mark="bought" data-id="${esc(f.id)}">Mark bought</button>`
      : f.status === 'pass'
      ? `<button class="curate-textbtn" data-mark="new" data-id="${esc(f.id)}">Back to the pile</button>`
      : '';
  return `
  <li class="curate-row" data-status="${esc(f.status)}">
    <div class="curate-row-main">
      <span class="curate-row-tags">${sourceTag(f)}
        <span class="curate-status curate-status--${esc(f.status)}">${STATUS_COPY[f.status] || esc(f.status)}</span></span>
      <a class="curate-row-title" href="${safeHref(f.url)}" target="_blank" rel="noopener noreferrer">${esc(displayTitle(f))}&nbsp;↗</a>
      ${f.note ? `<p class="curate-row-note">${esc(f.note)}</p>` : ''}
      <p class="curate-row-meta">
        ${f.price || f.price === 0 ? `${money(f.price)} · ` : ''}found by ${esc(f.submitted_by || 'the team')} · ${esc(whenLabel(f.created_at))}
        ${f.status !== 'new' && f.decided_by ? ` · ${(STATUS_COPY[f.status] || f.status).toLowerCase()} by ${esc(f.decided_by)}` : ''}
      </p>
    </div>
    ${acted}
  </li>`;
}

function deskHTML(user, finds) {
  const t = tally(finds);
  const rows = finds.map(pileRow).join('');
  const emptyCopy = isLive()
    ? 'Nothing here yet. Paste the first link above and it appears for the whole team.'
    : 'Nothing here yet. Paste the first link above — in practice mode it stays on this device.';
  return `
  ${deskBar(user)}
  ${dropFormHTML()}
  <div class="curate-stats">
    <div class="stat"><b>${t.new}</b><span>Waiting for review</span></div>
    <div class="stat"><b>${t.shortlist}</b><span>Shortlisted</span></div>
    <div class="stat"><b>${t.bought}</b><span>Bought</span></div>
    <a class="btn btn--solid" href="/curate/review" data-magnetic
       style="align-self:center;justify-self:end">${
         t.new ? `Review the pile (${t.new})` : 'Review session'
       }</a>
  </div>
  <div class="curate-pile">
    <div class="section-head" style="margin-bottom:1rem">
      <div>
        <p class="eyebrow">The pile</p>
        <h3 class="display" style="margin-top:.5rem">Newest first</h3>
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

  const mount = () => gate(app, show);
  wirePileRefreshOnFocus(app, () => {
    // returning from a listing tab must never eat a half-typed drop form
    const form = app.querySelector('[data-drop-form]');
    const dirty =
      form &&
      (form.url.value.trim() || form.title.value.trim() || form.note.value.trim() ||
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
    untitledWarned = false;
  });

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
      noteEl.textContent = `No title — at the meeting this card will just say “${fallback}”. Add a few words about what it is, or press Add again to drop it as-is.`;
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const result = await addFind({
        url,
        title: form.title.value.trim(),
        note: form.note.value.trim(),
        price: form.price.value === '' ? null : Number(form.price.value),
        source: sourceOf(url),
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
        { label: 'Curation Desk', href: '/curate' },
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
          <span class="nav-hide-sm">Keyboard: ← pass · → shortlist · Z undo &nbsp;·&nbsp; </span><a href="/curate">back to the desk</a>
        </p>
      </div>
    </div>
  </section>`;
}

function reviewCardHTML(f) {
  return `
  <div class="deck-card-body">
    <div class="deck-card-top">
      ${sourceTag(f)}
      ${f.price || f.price === 0 ? `<span class="deck-price">${money(f.price)}</span>` : ''}
    </div>
    <h3 class="deck-title">${esc(displayTitle(f))}</h3>
    <p class="deck-note">${f.note ? `“${esc(f.note)}”` : ''}</p>
    <p class="deck-meta">Found by ${esc(f.submitted_by || 'the team')} · ${esc(whenLabel(f.created_at))}
      ${f.collection ? ` · for ${esc(collections().find((c) => c.id === f.collection)?.name || f.collection)}` : ''}</p>
    <a class="deck-link" href="${safeHref(f.url)}" target="_blank" rel="noopener noreferrer">View the listing ↗</a>
  </div>`;
}

function verdictHTML(decided) {
  const listed = decided.filter((d) => d.dir === 'right');
  const passed = decided.length - listed.length;
  return `
  <div class="curate-card curate-verdict" data-verdict>
    <p class="eyebrow">The verdict</p>
    <h3 class="display" style="margin:.4rem 0 1rem">Pile clear${listed.length ? ` — ${listed.length} for the shortlist` : ''}</h3>
    ${
      listed.length
        ? `<ul class="curate-list">${listed
            .map(
              ({ card: f }) => `
              <li class="curate-row" data-status="shortlist">
                <div class="curate-row-main">
                  <span class="curate-row-tags">${sourceTag(f)}</span>
                  <a class="curate-row-title" href="${safeHref(f.url)}" target="_blank" rel="noopener noreferrer">${esc(displayTitle(f))}&nbsp;↗</a>
                  <p class="curate-row-meta">${f.price || f.price === 0 ? `${money(f.price)} · ` : ''}found by ${esc(f.submitted_by || 'the team')}</p>
                </div>
                <button class="curate-textbtn" data-mark="bought" data-id="${esc(f.id)}">Mark bought</button>
              </li>`
            )
            .join('')}</ul>`
        : `<p class="curate-help">Nothing shortlisted this round.</p>`
    }
    <p class="curate-row-meta" style="margin-top:.8rem">${passed} passed${passed ? ' — still on the desk if anyone wants to argue' : ''}.</p>
    <p class="curate-help" style="margin-top:.6rem">This summary lives only on this screen —
      copy it before you leave. The shortlist itself is safe on the desk.</p>
    <div class="curate-verdict-actions">
      ${listed.length ? `<button class="btn btn--solid" data-copy-verdict data-magnetic>Copy the shortlist</button>` : ''}
      <a class="btn" href="/curate" data-magnetic>Back to the desk</a>
    </div>
  </div>`;
}

function verdictText(decided) {
  const listed = decided.filter((d) => d.dir === 'right');
  const lines = [
    `Tour Archive — curation verdict (${new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short' })})`,
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
    // oldest first — nothing rots at the bottom of the pile
    const pile = finds.filter((f) => f.status === 'new').reverse();
    const decided = [];

    if (!pile.length) {
      if (hintEl) hintEl.style.display = 'none';
      app.innerHTML = `
        ${deskBar(user)}
        <div class="curate-card" style="text-align:center">
          <p class="eyebrow">All clear</p>
          <h3 class="display" style="margin:.4rem 0 1rem">The pile is empty</h3>
          <p class="curate-help">Every find has been reviewed. The desk is open
            when the next one turns up.</p>
          <a class="btn btn--solid" href="/curate" data-magnetic style="margin-top:1rem">Back to the desk</a>
        </div>`;
      applyBaseToLinks(app);
      initMagnetic(app);
      wireSignOut(app, mount);
      return;
    }

    if (hintEl) hintEl.style.display = '';
    app.innerHTML = `
      ${deskBar(user, `<span class="curate-counter" data-deck-count>${pile.length} to review</span>`)}
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
    const undoBtn = app.querySelector('[data-deck-undo]');
    const controls = app.querySelector('.deck-controls');

    const deck = mountDeck(stage, {
      cards: pile,
      renderCard: reviewCardHTML,
      onDecide(card, dir) {
        decided.push({ card, dir });
        undoBtn.disabled = false;
        counter.textContent = `${deck.size()} to review`;
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
        controls.insertAdjacentHTML('afterend', verdictHTML(decided));
        applyBaseToLinks(app);
        initMagnetic(app);
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
      if (controls.getBoundingClientRect().bottom > window.innerHeight) {
        stage.scrollIntoView({ block: 'start' });
      }
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
