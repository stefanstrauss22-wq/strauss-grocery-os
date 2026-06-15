import express from 'express';
import { query } from '../db/db.js';
import { searchLink, saveMapping } from '../services/catalogMatch.js';
import { sendWhatsApp } from '../services/whatsappSend.js';

const router = express.Router();

// PATCH /api/cart/run-items/:id — the human corrects the robot's pick before
// checkout: which product/brand was actually bought, the quantity, or whether
// it was bought at all. These feed the catalog when "I checked out" is tapped.
router.patch('/run-items/:id', async (req, res, next) => {
  try {
    const { product_name, price_cents, final_quantity, bought } = req.body;
    await query(
      `UPDATE cart_run_items SET
         product_name   = COALESCE($1, product_name),
         price_cents    = COALESCE($2, price_cents),
         final_quantity = COALESCE($3, final_quantity),
         bought         = COALESCE($4, bought)
       WHERE id = $5`,
      [product_name ?? null, price_cents ?? null, final_quantity ?? null,
       bought === undefined ? null : Boolean(bought), req.params.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// GET /api/cart/runs
router.get('/runs', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM cart_runs ORDER BY started_at DESC LIMIT 20');
    res.json(rows);
  } catch (e) { next(e); }
});

// DELETE /api/cart/runs — clear the run-history log. Removes done/failed runs
// plus any 'running' run older than 6h (stale — the home-PC watcher died
// mid-build), but keeps genuinely active runs ('requested', or 'running' within
// the last 6h). Cascades to cart_run_items. Purchase history and the learned
// catalog are separate tables and are NOT touched.
router.delete('/runs', async (req, res, next) => {
  try {
    const { rowCount } = await query(
      `DELETE FROM cart_runs
       WHERE status NOT IN ('requested','running')
          OR (status = 'running' AND started_at < now() - INTERVAL '6 hours')`);
    res.json({ cleared: rowCount });
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

// POST /api/cart/request — the app/phone asks for a cart build. The home-PC
// watcher (npm run watch) picks this up, fills the trolley, and notifies.
router.post('/request', async (req, res, next) => {
  try {
    // Don't stack duplicate requests if one is already waiting/running.
    const existing = await query(`SELECT id FROM cart_runs WHERE status IN ('requested','running') ORDER BY started_at DESC LIMIT 1`);
    if (existing.rows.length) return res.status(202).json({ run_id: existing.rows[0].id, already: true });
    const { rows } = await query(`INSERT INTO cart_runs (status) VALUES ('requested') RETURNING id`);
    res.status(202).json({ run_id: rows[0].id });
  } catch (e) { next(e); }
});

// POST /api/cart/runs/:id/notify — called by the watcher when a build finishes;
// sends a WhatsApp summary to the configured notify number (settings.notify_phone).
router.post('/runs/:id/notify', async (req, res, next) => {
  try {
    const run = (await query('SELECT * FROM cart_runs WHERE id = $1', [req.params.id])).rows[0];
    if (!run) return res.status(404).json({ error: 'run not found' });
    const row = (await query(`SELECT value FROM settings WHERE key = 'notify_phone'`)).rows[0];
    let raw = row ? row.value : null;
    if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { /* plain string */ } }
    if (raw && typeof raw === 'object') raw = raw.phone;          // {phone:"27..."}
    const phone = raw != null ? String(raw).replace(/[^\d]/g, '') : null; // digits only, no +
    if (!phone) return res.json({ notified: false, reason: 'no notify_phone configured' });
    const s = typeof run.summary === 'string' ? JSON.parse(run.summary) : (run.summary || {});
    const rand = s.est_total_cents ? `~R${(s.est_total_cents / 100).toFixed(0)}` : '';
    const reason = s.error ? ` ${s.error}` : '';
    const msg = run.status === 'done'
      ? `🛒 Your Checkers cart is ready: ${s.added || 0} items${rand ? `, ${rand}` : ''}${s.needs_review ? `, ${s.needs_review} to check` : ''}. Open checkers.co.za (logged in, NOT the Sixty60 app) to review & pay.`
      : `⚠️ The cart build hit a snag.${reason} Open the app → Cart tab for details.`;
    await sendWhatsApp(phone, msg);
    res.json({ notified: true });
  } catch (e) { next(e); }
});

// GET /api/cart/manual — the always-works fallback: pending items as tap-through search links
router.get('/manual', async (req, res, next) => {
  try {
    const { rows } = await query(`SELECT * FROM shopping_items WHERE status = 'pending' ORDER BY category, name`);
    res.json(rows.map(r => ({ id: r.id, name: r.name, quantity: r.quantity, unit: r.unit, category: r.category, link: searchLink(r.name) })));
  } catch (e) { next(e); }
});

// POST /api/cart/runs/:id/complete — user finished checkout. Records the FINAL
// (human-corrected) products + quantities to purchase_history, and confirms the
// ingredient→product mappings so next week the robot buys exactly these.
router.post('/runs/:id/complete', async (req, res, next) => {
  try {
    const items = (await query(
      `SELECT c.*, s.name AS item_name, s.quantity AS list_qty FROM cart_run_items c
       JOIN shopping_items s ON s.id = c.shopping_item_id
       WHERE c.run_id = $1 AND c.status IN ('added','substituted')`, [req.params.id])).rows;
    let purchased = 0;
    for (const it of items) {
      if (it.bought === false) {
        // robot added it but you didn't buy it — keep it on the list
        await query(`UPDATE shopping_items SET status = 'pending', updated_at = now() WHERE id = $1`, [it.shopping_item_id]);
        continue;
      }
      const qty = it.final_quantity ?? it.list_qty ?? 1;
      await query(`UPDATE shopping_items SET status = 'purchased', updated_at = now() WHERE id = $1`, [it.shopping_item_id]);
      await query(`INSERT INTO purchase_history (item_name, quantity, price_cents) VALUES ($1,$2,$3)`,
        [it.item_name, qty, it.price_cents]);
      // Confirm the mapping with whatever you actually bought (corrected brand & price).
      if (it.product_name) {
        await saveMapping({ itemName: it.item_name, productName: it.product_name, productUrl: it.product_url, priceCents: it.price_cents, confidence: 'confirmed' });
        await query(`UPDATE product_catalog SET times_purchased = times_purchased + 1, last_purchased_at = now() WHERE product_name = $1`, [it.product_name]);
      }
      purchased++;
    }
    res.json({ purchased });
  } catch (e) { next(e); }
});

export default router;
