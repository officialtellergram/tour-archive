/** Shared view fragments. */

import { garmentSVG, collectionMark } from './garment.js';
import { getCollection, itemsIn, isAvailable, BASIC_STOCK } from '../data/store.js';

export const money = (n) => `$${n.toLocaleString('en-US')}`;

const BASE_URL = (import.meta.env?.BASE_URL || '/').replace(/\/*$/, '/');

/** HTML-escape untrusted text for interpolation into markup. Scraped listing
 *  text arrives plain (the manifest never stores HTML) — this is the
 *  render-side belt to that braces. */
export function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;') // & first, or it re-escapes the entities below
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Placeholder-shaped editorial values — mirror of the mapper's substitution
 *  set (server-side copy in server/inventory.mjs; src/ cannot import server
 *  code into the bundle). Exact, case-insensitive, trimmed. */
const PLACEHOLDER = new Set(['see listing', 'see photos', '—', '']);
export const isPlaceholder = (v) => PLACEHOLDER.has(String(v ?? '').trim().toLowerCase());

/** Resolve a deploy-base-relative media path: absolute URLs pass through, repo paths get the base. */
export const mediaURL = (path) =>
  !path ? '' : /^https?:\/\//i.test(path) ? path : `${BASE_URL}${path}`;

/** Resolve an item's photo — the item-level wrapper over mediaURL. */
export const photoURL = (item) => mediaURL(item.photo);

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
  // Sold: the corner sash carries the word; the parchment veil is CSS on the
  // plate (.is-sold ::after). No channel chip — it isn't on the marketplace.
  if (item.sold) return `<span class="plate-sash" aria-label="Sold">Sold</span>`;
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
  // Hover deals the archived carousel (initCardCycle in motion.js); resolved
  // URLs are baked here so the swapper only ever assigns src.
  const cycle =
    Array.isArray(item.photos) && item.photos.length > 1
      ? ` data-cycle="${item.photos.map((p) => mediaURL(p)).join('|')}"`
      : '';
  return `
  <a class="card ${item.sold ? 'is-sold' : ''}" href="/item/${item.id}">
    <!-- cursor bubble procs on closest [data-cursor-text]: it lives on the
         plate so VIEW appears over the photograph, never over the title -->
    <div class="plate ${item.photo ? 'plate--photo' : ''}"
      data-cursor-text="${item.sold ? 'Archived' : 'View'}"${cycle}>
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
        <span>${coll ? coll.name : item.category}${isPlaceholder(item.size) ? '' : ` · ${escapeHtml(item.size)}`}</span>
        <span class="card-price">${money(item.price)}</span>
      </div>
    </div>
  </a>`;
}

/** Basic Stock tile canvas — a 2x2 mosaic of real stock heroes.
 *  Deterministic by construction: Array.filter is order-preserving, so
 *  available pieces come first in manifest order, then the rest — the layout
 *  probe reproduces the exact grid every run. Returns '' when nothing is
 *  photographed; collectionTile then falls back to the drawn canvas. */
export function mosaicMedia(items) {
  const shot = items.filter((i) => i.photo);
  if (!shot.length) return '';
  const cells = [...shot.filter(isAvailable), ...shot.filter((i) => !isAvailable(i))].slice(0, 4);
  return `<div class="tile-mosaic" aria-hidden="true">${cells
    .map((i) => `<img src="${mediaURL(i.photo)}" alt="" loading="lazy" decoding="async" />`)
    .join('')}</div>`;
}

export function collectionTile(collection) {
  const stock = itemsIn(collection.id);
  const live = stock.filter(isAvailable).length;
  const lead = stock[0];
  // Any collection with photographed stock earns the mosaic (mosaicMedia
  // returns '' when nothing is shot, so research files keep the drawn canvas).
  const mosaic = mosaicMedia(stock);
  return `
  <a class="tile" href="/collections/${collection.id}"
     style="--accent:${collection.accent}">
    <div class="tile-canvas" data-cursor-text="Open">
      ${mosaic || (lead ? collectionMark(collection, lead.garment) : '')}
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
            : collection.status === 'live'
            ? `<span>Open stock</span><span>Listed continuously</span>`
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
