import express from 'express';
import { query } from '../db/db.js';
import { saveMapping } from '../services/catalogMatch.js';
import { normalizeName } from '../services/consolidate.js';
import { parseOrder } from '../services/orderParse.js';

const router = express.Router();

// Take parsed order items and learn from them: confirm catalog mappings, record
// purchase history, and tick off matching list items. Shared by paste + Gmail.
async function ingestItems(items, source = 'order') {
  let mapped = 0, history = 0, purchased = 0;
  for (const it of items) {
    const product = (it.product || '').trim();
    const ingredient = (it.ingredient || it.product || '').trim();
    if (!product || !ingredient) continue;
    const cents = Number(it.price_cents) || null;
    const qty = Number(it.quantity) || 1;
    await saveMapping({ itemName: ingredient, productName: product, priceCents: cents, confidence: 'confirmed' });
    mapped++;
    await query(`INSERT INTO purchase_history (item_name, quantity, price_cents) VALUES ($1,$2,$3)`,
      [ingredient, qty, cents]);
    history++;
    const r = await query(
      `UPDATE shopping_items SET status='purchased', updated_at=now()
       WHERE normalized_name = $1 AND status IN ('pending','in_cart') RETURNING id`,
      [normalizeName(ingredient)]);
    purchased += r.rows.length;
  }
  return { mapped, history, purchased };
}

// POST /api/orders/ingest  { text }  — paste an order/invoice; AI parses + learns.
router.post('/ingest', async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text || String(text).trim().length < 10) return res.status(400).json({ error: 'Paste the order text first.' });
    const parsed = await parseOrder(text);
    if (!parsed.items?.length) return res.json({ order_ref: parsed.order_ref, items: 0, mapped: 0, history: 0, purchased: 0, note: 'No products found in that text.' });
    // Skip an order we've already imported (same ref).
    if (parsed.order_ref) {
      const seen = await query(`SELECT 1 FROM settings WHERE key = $1`, [`order_imported_${parsed.order_ref}`]);
      if (seen.rows.length) return res.json({ order_ref: parsed.order_ref, already: true, items: parsed.items.length });
    }
    const result = await ingestItems(parsed.items);
    if (parsed.order_ref) {
      await query(`INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
        [`order_imported_${parsed.order_ref}`, JSON.stringify({ at: new Date().toISOString(), items: parsed.items.length })]);
    }
    res.json({ order_ref: parsed.order_ref, items: parsed.items.length, ...result, products: parsed.items.map(i => `${i.quantity}× ${i.product}`) });
  } catch (e) { next(e); }
});

export { ingestItems };
export default router;
