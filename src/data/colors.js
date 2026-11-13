/**
 * The colour families the archive filters by. Each piece carries one
 * (`colorFamily`), read from its hero photograph at build time by
 * scripts/color-families.mjs — garment pixels only, the wall left out — or
 * set by hand in the manifest (`colorFamily: 'navy'`) when the camera is
 * wrong. Nine families, not a paint chart: a visitor is looking for "a navy
 * one", not a Pantone.
 */
export const COLOR_FAMILIES = [
  { id: 'cream', label: 'Cream & White', swatch: '#e9e2d0' },
  { id: 'black', label: 'Black', swatch: '#1c1b18' },
  { id: 'grey', label: 'Grey', swatch: '#8a8a86' },
  { id: 'navy', label: 'Navy & Blue', swatch: '#2a4a7a' },
  { id: 'green', label: 'Green', swatch: '#2f5a3a' },
  { id: 'red', label: 'Red & Claret', swatch: '#8e2436' },
  { id: 'yellow', label: 'Yellow & Gold', swatch: '#d2b04a' },
  { id: 'purple', label: 'Purple & Burgundy', swatch: '#5a3350' },
  { id: 'brown', label: 'Brown & Tan', swatch: '#8a6a48' },
];

export const colorFamily = (id) => COLOR_FAMILIES.find((f) => f.id === id) || null;
export const colorLabel = (id) => colorFamily(id)?.label || '';
