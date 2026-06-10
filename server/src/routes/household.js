import express from 'express';
import { query } from '../db/db.js';

const router = express.Router();

// --- Members ---
router.get('/members', async (req, res, next) => {
  try {
    res.json((await query('SELECT * FROM members ORDER BY id')).rows);
  } catch (e) { next(e); }
});

router.post('/members', async (req, res, next) => {
  try {
    const { name, role = 'member', phone = null, language = 'en', dietary_notes = null } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const { rows } = await query(
      'INSERT INTO members (name, role, phone, language, dietary_notes) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [name, role, phone, language, dietary_notes]);
    res.status(201).json({ id: rows[0].id });
  } catch (e) { next(e); }
});

router.patch('/members/:id', async (req, res, next) => {
  try {
    const { name, role, phone, language, dietary_notes } = req.body;
    await query(
      `UPDATE members SET name=COALESCE($1,name), role=COALESCE($2,role), phone=COALESCE($3,phone),
       language=COALESCE($4,language), dietary_notes=COALESCE($5,dietary_notes) WHERE id=$6`,
      [name || null, role || null, phone || null, language || null, dietary_notes || null, req.params.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/members/:id', async (req, res, next) => {
  try {
    await query('DELETE FROM members WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (e) { next(e); }
});

// --- Settings (household profile etc.) ---
router.get('/settings/:key', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT value FROM settings WHERE key = $1', [req.params.key]);
    if (!rows.length) return res.json(null);
    const v = rows[0].value;
    res.json(typeof v === 'string' ? JSON.parse(v) : v);
  } catch (e) { next(e); }
});

router.put('/settings/:key', async (req, res, next) => {
  try {
    await query(
      `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [req.params.key, JSON.stringify(req.body)]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
