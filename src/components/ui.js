/** Shared view fragments. */

import { garmentSVG, collectionMark } from './garment.js';
import { getCollection, itemsIn, isAvailable } from '../data/store.js';

export const money = (n) => `$${n.toLocaleString('en-US')}`;

const BASE_URL = (import.meta.env?.BASE_URL || '/').replace(/\/*$/, '/');

/** Resolve an item's photo: absolute URLs pass through, repo paths get the base. */
export const photoURL = (item) =>
  !item.photo ? '' : /^https?:\/\//i.test(item.photo) ? item.photo : `${BASE_URL}${item.photo}`;

/** Real photography when we have it; the drawn plate otherwise. */
export function plateMedia(item, opts = {}) {
  const url = photoURL(item);
  if (url) {
    return `<img class="plate-photo" src="${url}" alt="${String(item.name).replace(/"/g, '&quot;')}"
      loading="lazy" />`;
  }
  return garmentSVG(item, opts);
}

export function plateTag(item) {
  if (item.sold) return `<span class="plate-tag plate-tag--sold">Sold</span>`;
  if (item.upcoming) return `<span class="plate-tag plate-tag--soon">Drop 01</span>`;
  // Syndicated stock checks out on the marketplace, so say so on the card
  // rather than surprising the buyer at the button.
  if (item.syndicated && item.listings?.length > 1)
    return `<span class="plate-tag plate-tag--channel">eBay · Depop</span>`;
  if (item.syndicated && item.channel === 'ebay')
    return `<span class="plate-tag plate-tag--channel">eBay</span>`;
  if (item.syndicated && item.channel === 'depop')
    return `<span class="plate-tag plate-tag--channel">Depop</span>`;
  return `<span class="plate-tag">1 of 1</span>`;
}

export function productCard(item) {
  const coll = getCollection(item.collection);
  return `
  <a class="card ${item.sold ? 'is-sold' : ''}" href="/item/${item.id}"
     data-cursor-text="${item.sold ? 'Archived' : 'View'}">
    <div class="plate ${item.photo ? 'plate--photo' : ''}">
      ${plateTag(item)}
      ${plateMedia(item)}
    </div>
    <div class="card-body">
      <div class="card-brand">
        <span>${item.brand}</span>
        <span>${item.year}</span>
      </div>
      <h3 class="card-name">${item.name}</h3>
      <div class="card-foot">
        <span>${coll ? coll.name : item.category} · ${item.size}</span>
        <span class="card-price">${money(item.price)}</span>
      </div>
    </div>
  </a>`;
}

export function collectionTile(collection) {
  const stock = itemsIn(collection.id);
  const live = stock.filter(isAvailable).length;
  const lead = stock[0];
  return `
  <a class="tile" href="/collections/${collection.id}" data-cursor-text="Open"
     style="--accent:${collection.accent}">
    <div class="tile-canvas">
      ${lead ? collectionMark(collection, lead.garment) : ''}
      <div class="swatches" aria-hidden="true">
        ${collection.palette.map((c) => `<i style="background:${c}"></i>`).join('')}
      </div>
    </div>
    <div class="tile-body">
      <div class="tile-meta">
        <span>${collection.drop}</span>
        <span class="status-dot" data-status="${collection.status}">${collection.statusLabel}</span>
      </div>
      <h3>${collection.name}</h3>
      <div class="tile-meta">
        <span>${collection.place}</span>
        <span>${collection.years}</span>
      </div>
      <p class="tile-sum">${collection.summary}</p>
      <div class="tile-meta" style="padding-top:.6rem;border-top:1px solid var(--rule);margin-top:.6rem">
        ${
          stock.length
            ? `<span>${stock.length} piece${stock.length === 1 ? '' : 's'}</span>
               <span>${live ? `${live} available` : 'Fully archived'}</span>`
            : collection.status === 'upcoming'
            ? `<span>First drop</span><span>Wardrobe in assembly</span>`
            : `<span>Research file</span><span>Wardrobe in sourcing</span>`
        }
      </div>
    </div>
  </a>`;
}

export function marquee(words) {
  return `<div class="marquee"><div class="marquee-track" data-marquee>${words
    .map((w) => `<span>${w}</span>`)
    .join('')}</div></div>`;
}

export function breadcrumb(trail) {
  return `<nav class="breadcrumb" aria-label="Breadcrumb">${trail
    .map((t, i) =>
      t.href && i < trail.length - 1
        ? `<a href="${t.href}">${t.label}</a><span>/</span>`
        : `<em style="font-style:normal;color:var(--ink)">${t.label}</em>`
    )
    .join('')}</nav>`;
}

export function sectionHead({ eyebrow, title, link }) {
  return `
  <div class="section-head" data-reveal>
    <div>
      ${eyebrow ? `<p class="eyebrow">${eyebrow}</p>` : ''}
      <h2 class="display" style="margin-top:.5rem">${title}</h2>
    </div>
    ${link ? `<a class="text-link" href="${link.href}">${link.label} <span>→</span></a>` : ''}
  </div>`;
}
