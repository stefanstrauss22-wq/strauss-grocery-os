import express from 'express';
import { query } from '../db/db.js';

const router = express.Router();

// GET /api/tasks — open tasks first, newest first within each group.
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM tasks ORDER BY done, created_at DESC LIMIT 500');
    res.json(rows);
  } catch (e) { next(e); }
});

// POST /api/tasks  { title, source?, added_by? }
router.post('/', async (req, res, next) => {
  try {
    const { title, source = 'manual', added_by = null } = req.body;
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'title is required' });
    const { rows } = await query(
      `INSERT INTO tasks (title, source, added_by) VALUES ($1,$2,$3) RETURNING *`,
      [String(title).trim(), source, added_by]);
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

// PATCH /api/tasks/:id  { done?, title? }
router.patch('/:id', async (req, res, next) => {
  try {
    const { done, title } = req.body;
    await query(
      `UPDATE tasks SET
         done       = COALESCE($1, done),
         title      = COALESCE($2, title),
         updated_at = now()
       WHERE id = $3`,
      [done === undefined ? null : done, title ? String(title).trim() : null, req.params.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// DELETE /api/tasks/:id
router.delete('/:id', async (req, res, next) => {
  try {
    await query('DELETE FROM tasks WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (e) { next(e); }
});

export default router;
