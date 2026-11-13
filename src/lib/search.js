/**
 * Search, shared by the header strip and the archive page.
 *
 * One rule: every word typed must appear somewhere on the piece — its name,
 * brand, colour (the catalogue's name and the family), size, garment type,
 * category, collection and story. Plain substring matching, case-folded,
 * accents stripped: "navy polo" finds the navy polos, "peter millar l"
 * finds the Peter Millar pieces in a large (and, honestly, anything with an
 * "l" in it — a two-letter word is a weak filter, and that is fine).
 */
import { colorLabel } from '../data/colors.js';
import { getCollection } from '../data/store.js';

const fold = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ');

/** Tidy a typed query: trimmed, single-spaced, bounded. */
export const normalizeQuery = (q) => String(q ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);

export function searchText(item) {
  const coll = getCollection(item.collection);
  return fold(
    [
      item.name,
      item.brand,
      item.colorName,
      colorLabel(item.colorFamily),
      item.size,
      item.garment,
      item.category,
      item.year,
      coll?.name,
      coll?.place,
      item.story,
    ]
      .filter(Boolean)
      .join(' ')
  );
}

export function matchesQuery(item, q) {
  const words = fold(normalizeQuery(q)).split(' ').filter(Boolean);
  if (!words.length) return true;
  const hay = searchText(item);
  return words.every((w) => hay.includes(w));
}
