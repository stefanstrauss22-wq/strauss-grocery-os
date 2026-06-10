import express from 'express';
import { query } from '../db/db.js';
import { matchCatalog, saveMapping } from '../services/catalogMatch.js';

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM product_catalog ORDER BY times_purchased DESC, updated_at DESC');
    res.json(rows);
  } catch (e) { next(e); }
});

// POST /api/catalog  { item_name, product_name, product_url?, pack_size?, price_cents?, confidence? }
router.post('/', async (req, res, next) => {
  try {
    const { item_name, product_name, product_url, external_product_id, pack_size, price_cents, confidence } = req.body;
    if (!item_name || !product_name) return res.status(400).json({ error: 'item_name and product_name required' });
    await saveMapping({ itemName: item_name, productName: product_name, productUrl: product_url, externalProductId: external_product_id, packSize: pack_size, priceCents: price_cents, confidence });
    res.status(201).json({ ok: true });
  } catch (e) { next(e); }
});

// PATCH /api/catalog/:id  — confirm/adjust a mapping
router.patch('/:id', async (req, res, next) => {
  try {
    const { confidence, substitution_policy, product_name, product_url } = req.body;
    await query(
      `UPDATE product_catalog SET
         confidence = COALESCE($1, confidence),
         substitution_policy = COALESCE($2, substitution_policy),
         product_name = COALESCE($3, product_name),
         product_url = COALESCE($4, product_url),
         updated_at = now()
       WHERE id = $5`,
      [confidence || null, substitution_policy || null, product_name || null, product_url || null, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await query('DELETE FROM product_catalog WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (e) { next(e); }
});

// GET /api/catalog/match?name=milk — what would the cart builder do with this item?
router.get('/match', async (req, res, next) => {
  try {
    if (!req.query.name) return res.status(400).json({ error: 'name query param required' });
    const match = await matchCatalog(req.query.name);
    res.json(match || { entry: null, matchType: 'none' });
  } catch (e) { next(e); }
});

export default router;
