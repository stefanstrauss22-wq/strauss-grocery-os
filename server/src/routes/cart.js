import express from 'express';
import { query } from '../db/db.js';
import { searchLink } from '../services/catalogMatch.js';

const router = express.Router();

// GET /api/cart/runs
router.get('/runs', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM cart_runs ORDER BY started_at DESC LIMIT 20');
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /api/cart/runs/:id  — run with its per-item results
router.get('/runs/:id', async (req, res, next) => {
  try {
    const run = (await query('SELECT * FROM cart_runs WHERE id = $1', [req.params.id])).rows[0];
    if (!run) return res.status(404).json({ error: 'run not found' });
    const items = (await query(`
      SELECT c.*, s.name AS item_name, s.quantity, s.unit
      FROM cart_run_items c LEFT JOIN shopping_items s ON s.id = c.shopping_item_id
      WHERE c.run_id = $1 ORDER BY c.tier, c.status`, [req.params.id])).rows;
    res.json({ ...run, items });
  } catch (e) { next(e); }
});

// POST /api/cart/build — kick the worker as a child process so the API stays responsive
router.post('/build', async (req, res, next) => {
  try {
    const { rows } = await query(`INSERT INTO cart_runs (status) VALUES ('running') RETURNING id`);
    const runId = rows[0].id;
    const { spawn } = await import('node:child_process');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const workerPath = path.resolve(dir, '../worker/cartBuilder.js');
    const child = spawn(process.execPath, [workerPath, '--run-id', String(runId)], {
      detached: true, stdio: 'ignore', env: process.env,
    });
    child.unref();
    res.status(202).json({ run_id: runId, status: 'running' });
  } catch (e) { next(e); }
});

// GET /api/cart/manual — the always-works fallback: pending items as tap-through search links
router.get('/manual', async (req, res, next) => {
  try {
    const { rows } = await query(`SELECT * FROM shopping_items WHERE status = 'pending' ORDER BY category, name`);
    res.json(rows.map(r => ({ id: r.id, name: r.name, quantity: r.quantity, unit: r.unit, category: r.category, link: searchLink(r.name) })));
  } catch (e) { next(e); }
});

// POST /api/cart/runs/:id/complete — user finished checkout; mark items purchased, feed history
router.post('/runs/:id/complete', async (req, res, next) => {
  try {
    const items = (await query(
      `SELECT c.*, s.name AS item_name, s.quantity FROM cart_run_items c
       JOIN shopping_items s ON s.id = c.shopping_item_id
       WHERE c.run_id = $1 AND c.status IN ('added','substituted')`, [req.params.id])).rows;
    for (const it of items) {
      await query(`UPDATE shopping_items SET status = 'purchased', updated_at = now() WHERE id = $1`, [it.shopping_item_id]);
      await query(`INSERT INTO purchase_history (item_name, quantity, price_cents) VALUES ($1,$2,$3)`,
        [it.item_name, it.quantity || 1, it.price_cents]);
      await query(`UPDATE product_catalog SET times_purchased = times_purchased + 1, last_purchased_at = now()
                   WHERE product_name = $1`, [it.product_name]);
    }
    res.json({ purchased: items.length });
  } catch (e) { next(e); }
});

export default router;
