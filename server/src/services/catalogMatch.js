// Ingredient -> product_catalog matching. Exact key first, then alias, then token overlap.
import { query } from '../db/db.js';
import { normalizeName } from './consolidate.js';

function tokenScore(a, b) {
  const ta = new Set(a.split(' '));
  const tb = new Set(b.split(' '));
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit++;
  return hit / Math.max(ta.size, tb.size);
}

/** Returns { entry, matchType } or null. */
export async function matchCatalog(itemName, retailer = 'sixty60') {
  const key = normalizeName(itemName);
  const exact = await query(
    'SELECT * FROM product_catalog WHERE ingredient_key = $1 AND retailer = $2',
    [key, retailer]
  );
  if (exact.rows.length) return { entry: exact.rows[0], matchType: 'exact' };

  const all = (await query('SELECT * FROM product_catalog WHERE retailer = $1', [retailer])).rows;
  // alias match
  for (const row of all) {
    const aliases = Array.isArray(row.aliases) ? row.aliases : JSON.parse(row.aliases || '[]');
    if (aliases.some(a => normalizeName(a) === key)) return { entry: row, matchType: 'alias' };
  }
  // fuzzy token overlap
  let best = null, bestScore = 0;
  for (const row of all) {
    const s = tokenScore(key, row.ingredient_key);
    if (s > bestScore) { bestScore = s; best = row; }
  }
  if (best && bestScore >= 0.6) return { entry: best, matchType: 'fuzzy' };
  return null;
}

/** Upsert a mapping learned from a cart run or human confirmation. */
export async function saveMapping({ itemName, productName, productUrl, externalProductId, packSize, priceCents, confidence = 'suggested', retailer = 'sixty60' }) {
  const key = normalizeName(itemName);
  await query(`
    INSERT INTO product_catalog (ingredient_key, retailer, product_name, product_url, external_product_id, pack_size, last_price_cents, confidence, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
    ON CONFLICT (ingredient_key, retailer) DO UPDATE SET
      product_name = EXCLUDED.product_name,
      product_url = COALESCE(EXCLUDED.product_url, product_catalog.product_url),
      external_product_id = COALESCE(EXCLUDED.external_product_id, product_catalog.external_product_id),
      pack_size = COALESCE(EXCLUDED.pack_size, product_catalog.pack_size),
      last_price_cents = COALESCE(EXCLUDED.last_price_cents, product_catalog.last_price_cents),
      confidence = CASE WHEN product_catalog.confidence = 'confirmed' THEN 'confirmed' ELSE EXCLUDED.confidence END,
      updated_at = now()
  `, [key, retailer, productName, productUrl || null, externalProductId || null, packSize || null, priceCents || null, confidence]);
}

/** Sixty60 search URL fallback — always works, even when automation is down. */
export function searchLink(itemName) {
  return `https://www.checkers.co.za/search?q=${encodeURIComponent(itemName)}`;
}
