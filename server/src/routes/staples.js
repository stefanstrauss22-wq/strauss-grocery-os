import express from 'express';
import { query } from '../db/db.js';
import { normalizeName, normalizeUnit } from '../services/consolidate.js';
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

async function getPrefs() {
  const prefRows = await query(`SELECT value FROM settings WHERE key = 'shopping_preferences'`);
  if (!prefRows.rows.length) return null;
  const v = prefRows.rows[0].value;
  return typeof v === 'string' ? JSON.parse(v) : v;
}

// Insert a staple if one with the same normalized name + unit isn't already staged.
async function upsertStaple({ name, quantity = 1, unit = null, category = 'other', kind = 'fixed', note = null }) {
  const norm = normalizeName(name);
  const u = normalizeUnit(unit);
  const existing = await query(
    `SELECT id FROM staple_items WHERE normalized_name = $1 AND (unit IS NOT DISTINCT FROM $2)`, [norm, u]);
  if (existing.rows.length) return { id: existing.rows[0].id, added: false };
  const { rows } = await query(
    `INSERT INTO staple_items (name, normalized_name, quantity, unit, category, kind, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [name, norm, quantity || 1, u, category || 'other', kind, note]);
  return { id: rows[0].id, added: true };
}

// Seed the fixed staples (weekly + domestic) from shopping_preferences. Idempotent.
async function seedFixed() {
  const prefs = await getPrefs();
  if (!prefs) return 0;
  const fixed = [...(prefs.weekly_staples || []), ...(prefs.domestic_staples || [])];
  let added = 0;
  for (const s of fixed) {
    const r = await upsertStaple({ ...s, kind: 'fixed' });
    if (r.added) added++;
  }
  return added;
}

// GET /api/staples — the staged staples list (auto-seeds fixed staples on first use).
router.get('/', async (req, res, next) => {
  try {
    let { rows } = await query('SELECT * FROM staple_items ORDER BY active DESC, kind, category, name');
    if (!rows.length) {
      await seedFixed();
      rows = (await query('SELECT * FROM staple_items ORDER BY active DESC, kind, category, name')).rows;
    }
    res.json(rows);
  } catch (e) { next(e); }
});

// POST /api/staples/seed — (re)add any missing fixed staples from preferences.
router.post('/seed', async (req, res, next) => {
  try {
    const added = await seedFixed();
    res.json({ added });
  } catch (e) { next(e); }
});

// POST /api/staples — add a custom staple. { name, quantity?, unit?, category? }
router.post('/', async (req, res, next) => {
  try {
    const { name, quantity = 1, unit = null, category = 'other' } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const r = await upsertStaple({ name, quantity, unit, category, kind: 'custom' });
    res.status(r.added ? 201 : 200).json(r);
  } catch (e) { next(e); }
});

// PATCH /api/staples/:id — edit or toggle a staple. { name?, quantity?, unit?, category?, active? }
router.patch('/:id', async (req, res, next) => {
  try {
    const { name, quantity, unit, category, active } = req.body;
    await query(
      `UPDATE staple_items SET
         name            = COALESCE($1, name),
         normalized_name = COALESCE($2, normalized_name),
         quantity        = COALESCE($3, quantity),
         unit            = COALESCE($4, unit),
         category        = COALESCE($5, category),
         active          = COALESCE($6, active),
         updated_at      = now()
       WHERE id = $7`,
      [name || null, name ? normalizeName(name) : null, quantity ?? null,
       unit !== undefined ? normalizeUnit(unit) : null, category || null,
       active === undefined ? null : active, req.params.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// DELETE /api/staples/:id — remove a staple from the staging list.
router.delete('/:id', async (req, res, next) => {
  try {
    await query('DELETE FROM staple_items WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (e) { next(e); }
});

// POST /api/staples/rotate — refresh the AI-rotated picks (lunchbox/produce/frozen/snacks).
// Replaces the current rotation picks; fixed/custom/learned staples are untouched.
router.post('/rotate', async (req, res, next) => {
  try {
    if (!aiEnabled()) return res.status(400).json({ error: 'AI is off — set ANTHROPIC_API_KEY to rotate picks' });
    const prefs = await getPrefs();
    if (!prefs) return res.status(400).json({ error: 'No shopping_preferences saved yet' });

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
    const picks = JSON.parse(firstText(msg)).items;

    // Replace the previous rotation picks with the fresh set.
    await query(`DELETE FROM staple_items WHERE kind = 'rotation'`);
    for (const p of picks) await upsertStaple({ ...p, kind: 'rotation', note: 'this week\'s rotation pick' });

    res.json({ picks: picks.map(p => p.name) });
  } catch (e) { next(e); }
});

// POST /api/staples/to-list — copy every ACTIVE staged staple into the shopping list.
// Dedups against items already pending/in_cart; tagged source='staples'.
router.post('/to-list', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM staple_items WHERE active = true');
    let added = 0, skipped = 0;
    for (const s of rows) {
      const existing = await query(
        `SELECT id FROM shopping_items WHERE normalized_name = $1 AND status IN ('pending','in_cart') AND (unit IS NOT DISTINCT FROM $2)`,
        [s.normalized_name, s.unit]);
      if (existing.rows.length) { skipped++; continue; }
      await query(
        `INSERT INTO shopping_items (name, normalized_name, quantity, unit, category, source, added_by)
         VALUES ($1,$2,$3,$4,$5,'staples','weekly staples')`,
        [s.name, s.normalized_name, s.quantity || 1, s.unit, s.category || 'other']);
      added++;
    }
    res.json({ added, skipped });
  } catch (e) { next(e); }
});

export default router;
