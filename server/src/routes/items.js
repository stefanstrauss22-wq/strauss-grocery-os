import express from 'express';
import { query } from '../db/db.js';
import { normalizeName, normalizeUnit } from '../services/consolidate.js';
import { searchLink } from '../services/catalogMatch.js';

const router = express.Router();

// Weekly staples now live on their own staging list — see routes/staples.js.

// POST /api/items/bulk  { ids: [int], action: 'purchased' | 'removed' }
// Powers the List view's "Select all → mark bought / remove" per-group actions.
router.post('/bulk', async (req, res, next) => {
  try {
    const { ids, action } = req.body;
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids array is required' });
    const status = action === 'purchased' ? 'purchased' : action === 'removed' ? 'removed' : null;
    if (!status) return res.status(400).json({ error: "action must be 'purchased' or 'removed'" });
    const result = await query(
      `UPDATE shopping_items SET status = $1, updated_at = now() WHERE id = ANY($2::int[])`,
      [status, ids]);
    res.json({ updated: result.rowCount ?? ids.length });
  } catch (e) { next(e); }
});

// GET /api/items?status=pending  — unified list, newest first, with search links
router.get('/', async (req, res, next) => {
  try {
    const status = req.query.status || 'pending';
    const { rows } = status === 'all'
      ? await query('SELECT * FROM shopping_items ORDER BY created_at DESC LIMIT 500')
      : await query('SELECT * FROM shopping_items WHERE status = $1 ORDER BY category, created_at DESC', [status]);
    res.json(rows.map(r => ({ ...r, search_link: searchLink(r.name) })));
  } catch (e) { next(e); }
});

// POST /api/items  { name, quantity?, unit?, category?, source?, added_by?, urgency? }
router.post('/', async (req, res, next) => {
  try {
    const { name, quantity = 1, unit = null, category = 'other', source = 'manual', added_by = null, urgency = 'normal', note = null } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const norm = normalizeName(name);
    // merge into an existing pending item with the same normalized name + unit
    const existing = await query(
      `SELECT id, quantity FROM shopping_items WHERE normalized_name = $1 AND status = 'pending' AND (unit IS NOT DISTINCT FROM $2)`,
      [norm, normalizeUnit(unit)]
    );
    if (existing.rows.length) {
      const row = existing.rows[0];
      await query('UPDATE shopping_items SET quantity = $1, updated_at = now() WHERE id = $2',
        [Number(row.quantity) + Number(quantity), row.id]);
      return res.json({ id: row.id, merged: true });
    }
    const { rows } = await query(
      `INSERT INTO shopping_items (name, normalized_name, quantity, unit, category, source, added_by, urgency, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [name, norm, quantity, normalizeUnit(unit), category, source, added_by, urgency, note]
    );
    res.status(201).json({ id: rows[0].id, merged: false });
  } catch (e) { next(e); }
});

// PATCH /api/items/:id  { status?, quantity?, name?, category? }
router.patch('/:id', async (req, res, next) => {
  try {
    const { status, quantity, name, category, unit } = req.body;
    await query(
      `UPDATE shopping_items SET
         status   = COALESCE($1, status),
         quantity = COALESCE($2, quantity),
         name     = COALESCE($3, name),
         normalized_name = COALESCE($4, normalized_name),
         category = COALESCE($5, category),
         unit     = COALESCE($6, unit),
         updated_at = now()
       WHERE id = $7`,
      [status || null, quantity ?? null, name || null, name ? normalizeName(name) : null, category || null, unit || null, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await query(`UPDATE shopping_items SET status = 'removed', updated_at = now() WHERE id = $1`, [req.params.id]);
    res.status(204).send();
  } catch (e) { next(e); }
});

export default router;
