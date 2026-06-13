// Ingredient consolidation: merge duplicates across recipes and the standing list.

export function normalizeName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    // naive singularization for the common cases
    .replace(/(\w+)oes\b/, '$1o')      // tomatoes -> tomato
    .replace(/(\w+)ies\b/, '$1y')      // berries -> berry
    .replace(/(\w+[^s])s\b/, '$1');    // carrots -> carrot
}

const UNIT_ALIASES = { litre: 'l', liter: 'l', litres: 'l', ml: 'ml', kg: 'kg', g: 'g', gram: 'g', grams: 'g', each: 'each', pack: 'pack', packs: 'pack', tin: 'tin', tins: 'tin', can: 'tin' };

export function normalizeUnit(unit) {
  if (!unit) return null;
  const u = String(unit).toLowerCase().trim();
  return UNIT_ALIASES[u] || u;
}

// Cooking measures you can't actually buy — a recipe needs "3 tbsp curry powder"
// but the shop sells a jar, not a tablespoon. These collapse to one pack.
const MEASURING_UNITS = new Set([
  'tbsp', 'tablespoon', 'tablespoons',
  'tsp', 'teaspoon', 'teaspoons',
  'cup', 'cups',
  'pinch', 'pinches', 'dash', 'splash', 'drizzle', 'knob', 'handful',
  'clove', 'cloves', 'sprig', 'sprigs', 'stalk', 'stalks',
  'slice', 'slices', 'stick', 'sticks', 'piece', 'pieces',
]);

/**
 * Turn a recipe-style amount into something you can put in a trolley.
 * Cooking measures (tbsp, tsp, cloves…) and tiny g/ml amounts (spices, pastes,
 * essences) become a single pack — you buy one jar, not three tablespoons.
 * Real purchase amounts (kg, litres, packs, dozens, sensible g/ml, counts) are
 * kept; loose counts are rounded up to a whole item.
 */
export function shoppableQuantity({ quantity, unit }) {
  const u = normalizeUnit(unit);
  const q = Number(quantity) || 1;
  if (u && MEASURING_UNITS.has(u)) return { quantity: 1, unit: null };
  if ((u === 'g' || u === 'ml') && q < 100) return { quantity: 1, unit: null };
  if (!u || u === 'each') return { quantity: Math.max(1, Math.ceil(q)), unit: u || null };
  return { quantity: q, unit: u };
}

/**
 * Merge a list of {name, quantity, unit, category, ...} into consolidated entries.
 * Quantities sum when units match; otherwise entries are kept separate per unit.
 */
export function consolidate(items) {
  const map = new Map();
  for (const item of items) {
    const norm = normalizeName(item.name);
    const unit = normalizeUnit(item.unit);
    const key = `${norm}|${unit || ''}`;
    const existing = map.get(key);
    if (existing) {
      existing.quantity = Number(existing.quantity || 0) + Number(item.quantity || 1);
      existing.sources.push(item.source || 'unknown');
    } else {
      map.set(key, {
        name: item.name,
        normalized_name: norm,
        quantity: Number(item.quantity || 1),
        unit,
        category: item.category || 'other',
        sources: [item.source || 'unknown'],
      });
    }
  }
  return [...map.values()];
}
