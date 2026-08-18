/**
 * Category colours.
 *
 * The grid is faster to use when a category always looks the same, so a
 * cashier reaches for "the green block" rather than reading every tile. The
 * hue comes from the category name, so it stays put as products are added and
 * reordered, and needs no setting up.
 *
 * All eight are picked to stay legible as text on white — they're used for the
 * price as well as the tile's tab.
 */

const PALETTE = [
  '#E5195F', // rose sirap
  '#0E8A4F', // pandan
  '#1B6FE0', // enamel blue
  '#D97400', // gula melaka
  '#7B3FE4', // bunga telang
  '#00969B', // sea green
  '#D6402C', // chilli
  '#5F7D1F', // limau
];

const UNCATEGORISED = '#6E7791';

export function categoryColor(category) {
  const key = (category || '').trim().toLowerCase();
  if (!key) return UNCATEGORISED;
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}
