import express from 'express';
import { query } from '../db/db.js';
import { normalizeName, normalizeUnit } from '../services/consolidate.js';
import { searchLink } from '../services/catalogMatch.js';
import { aiEnabled, claude, firstText } from '../services/claude.js';
import { config } from '../config.js';

const router = express.Router();

const ROTATION_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          quantity: { type: 'number' },
          unit: { type: ['string', 'null'] },
          category: { type: 'string', enum: ['produce', 'meat', 'dairy', 'bakery', 'pantry', 'frozen', 'household', 'toiletries', 'pet', 'other'] },
        },
        required: ['name', 'quantity', 'unit', 'category'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

// POST /api/items/staples — add the weekly staples plus AI-rotated extras
// (lunchbox, produce, frozen) from the family's shopping_preferences.
router.post('/staples', async (req, res, next) => {
  try {
    const prefRows = await query(`SELECT value FROM settings WHERE key = 'shopping_preferences'`);
    if (!prefRows.rows.length) return res.status(400).json({ error: 'No shopping_preferences saved yet' });
    const prefs = typeof prefRows.rows[0].value === 'string' ? JSON.parse(prefRows.rows[0].value) : prefRows.rows[0].value;

    const fixed = [...(prefs.weekly_staples || []), ...(prefs.domestic_staples || [])];

    let rotation = [];
    if (aiEnabled()) {
      const recent = await query(
        `SELECT DISTINCT item_name FROM purchase_history WHERE purchased_at > now() - INTERVAL '21 days'`);
      const msg = await claude().messages.create({
        model: config.extractionModel,
        max_tokens: 1500,
        system: 'You compose the rotating part of a South African family-of-6 weekly grocery order. Pick from the given rotation lists ONLY. Vary choices week to week and avoid items bought in the last 3 weeks where possible.',
        messages: [{
          role: 'user',
          content: `Pick 2-3 lunchbox items, 3-4 fresh produce items, 2-4 frozen-meal items and 0-2 snacks for this week's order.\n\nRotation options:\nLunchbox: ${JSON.stringify(prefs.lunchbox_rotation || [])}\nProduce: ${JSON.stringify(prefs.produce_rotation || [])}\nFrozen: ${JSON.stringify(prefs.frozen_rotation || [])}\nSnacks: ${JSON.stringify(prefs.snack_rotation || [])}\n\nBought in the last 3 weeks (vary away from these): ${JSON.stringify(recent.rows.map(r => r.item_name))}`,
        }],
        output_config: { format: { type: 'json_schema', schema: ROTATION_SCHEMA } },
      });
      rotation = JSON.parse(firstText(msg)).items;
    }

    let added = 0, skipped = 0;
    for (const s of [...fixed, ...rotation]) {
      const norm = normalizeName(s.name);
      const existing = await query(
        `SELECT id FROM shopping_items WHERE normalized_name = $1 AND status IN ('pending','in_cart')`, [norm]);
      if (existing.rows.length) { skipped++; continue; } // already on the list / in trolley
      await query(
        `INSERT INTO shopping_items (name, normalized_name, quantity, unit, category, source, added_by)
         VALUES ($1,$2,$3,$4,$5,'staples','weekly staples')`,
        [s.name, norm, s.quantity || 1, normalizeUnit(s.unit), s.category || 'other']);
      added++;
    }
    res.json({ added, skipped, rotation: rotation.map(r => r.name) });
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
