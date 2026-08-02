import { journal, getJournal } from '../data/store.js';
import { breadcrumb } from '../components/ui.js';

export function journalIndex() {
  return `
  <section class="section" style="padding-top:calc(var(--header-h) + 4rem)">
    <div class="wrap">
      ${breadcrumb([{ label: 'Home', href: '/' }, { label: 'Journal' }])}
      <div data-hero>
        <p class="eyebrow" data-hero-meta><span>Field notes &amp; authentication</span></p>
        <h1 class="display" style="margin:.6rem 0 1.2rem;font-size:clamp(2.8rem,7vw,6.5rem)">
          <span class="line-mask"><span>Journal</span></span>
        </h1>
        <p class="lede" data-hero-cta>
          How we date a garment, how we buy, and what we found on the last sourcing trip.
        </p>
      </div>
    </div>
  </section>

  <section class="section" style="padding-top:0">
    <div class="wrap">
      <div class="journal-list">
        ${journal
          .map(
            (j) => `
          <a class="journal-row" href="/journal/${j.id}" data-reveal data-cursor-text="Read">
            <span class="eyebrow">${j.kicker}</span>
            <h3>${j.title}</h3>
            <p>${j.excerpt}</p>
            <span class="eyebrow">${j.date}</span>
          </a>`
          )
          .join('')}
      </div>
    </div>
  </section>`;
}

export function journalEntry({ id }) {
  const entry = getJournal(id);
  if (!entry) {
    return `
    <section class="section" style="padding-top:calc(var(--header-h) + 5rem)">
      <div class="wrap empty-state">
        <p class="eyebrow">No such entry</p>
        <h1 class="display" style="font-size:clamp(2.2rem,5vw,4rem)">That entry isn’t published</h1>
        <a class="btn btn--solid" href="/journal" data-magnetic>All journal entries</a>
      </div>
    </section>`;
  }

  const idx = journal.findIndex((j) => j.id === entry.id);
  const next = journal[(idx + 1) % journal.length];

  return `
  <article class="article">
    <div class="wrap">
      ${breadcrumb([
        { label: 'Home', href: '/' },
        { label: 'Journal', href: '/journal' },
        { label: entry.title },
      ])}
      <header class="article-head" data-hero>
        <p class="eyebrow" data-hero-meta><span>${entry.kicker} · ${entry.date}</span></p>
        <h1 class="display" style="font-size:clamp(2.4rem,6vw,5rem)">
          <span class="line-mask"><span>${entry.title}</span></span>
        </h1>
        <p class="lede" style="text-align:center" data-hero-cta>${entry.excerpt}</p>
      </header>
      <div class="article-body prose" data-reveal>
        ${entry.body.map((p) => `<p>${p}</p>`).join('')}
      </div>
      <div style="max-width:660px;margin:clamp(2.5rem,6vw,5rem) auto 0;padding-top:1.6rem;border-top:1px solid var(--rule);display:flex;justify-content:space-between;gap:1.5rem;flex-wrap:wrap">
        <a class="text-link" href="/journal"><span>←</span> All entries</a>
        <a class="text-link" href="/journal/${next.id}">${next.title} <span>→</span></a>
      </div>
    </div>
  </article>`;
}
