import express from 'express';
import { query } from '../db/db.js';
import { generatePlan, swapMeal } from '../services/planner.js';
import { consolidate, normalizeName } from '../services/consolidate.js';

const router = express.Router();

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const isoDate = v => String(v).slice(0, 10);
function addDays(iso, n) {
  const [y, m, d] = isoDate(iso).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
const weekdayOf = iso => WEEKDAYS[(() => { const [y, m, d] = isoDate(iso).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); })()];
// The 7 calendar days of a plan, starting at startISO (any weekday).
const planWindow = startISO => Array.from({ length: 7 }, (_, i) => { const date = addDays(startISO, i); return { date, weekday: weekdayOf(date) }; });
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

async function getSetting(key, fallback) {
  const { rows } = await query('SELECT value FROM settings WHERE key = $1', [key]);
  if (!rows.length) return fallback;
  const v = rows[0].value;
  return typeof v === 'string' ? JSON.parse(v) : v;
}

async function loadPlan(weekStart) {
  const planRows = await query('SELECT * FROM meal_plans WHERE week_start = $1', [weekStart]);
  if (!planRows.rows.length) return null;
  const plan = planRows.rows[0];
  const entries = await query(`
    SELECT e.id AS entry_id, e.day_of_week, e.meal_date, e.locked, e.status AS entry_status, r.*
    FROM meal_plan_entries e LEFT JOIN recipes r ON r.id = e.recipe_id
    WHERE e.plan_id = $1`, [plan.id]);
  const order = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const meals = [];
  for (const row of entries.rows) {
    const ing = row.id
      ? (await query('SELECT name, quantity, unit, category FROM recipe_ingredients WHERE recipe_id = $1', [row.id])).rows
      : [];
    meals.push({ ...row, ingredients: ing });
  }
  // Order by actual date (rolling windows can start any day); fall back to the
  // Mon–Sun order for older entries that predate meal_date.
  meals.sort((a, b) => {
    if (a.meal_date && b.meal_date) return isoDate(a.meal_date) < isoDate(b.meal_date) ? -1 : 1;
    return order.indexOf(a.day_of_week) - order.indexOf(b.day_of_week);
  });
  return { ...plan, meals };
}

async function persistGeneratedPlan(weekStart, context, generated, { replaceDay = null, existingPlanId = null } = {}) {
  let planId = existingPlanId;
  if (!planId) {
    const existing = await query('SELECT id FROM meal_plans WHERE week_start = $1', [weekStart]);
    if (existing.rows.length) {
      planId = existing.rows[0].id;
      await query('UPDATE meal_plans SET context = $1 WHERE id = $2', [JSON.stringify(context), planId]);
    } else {
      const { rows } = await query(
        'INSERT INTO meal_plans (week_start, context) VALUES ($1, $2) RETURNING id',
        [weekStart, JSON.stringify(context)]
      );
      planId = rows[0].id;
    }
  }
  for (const meal of generated.meals) {
    if (replaceDay && meal.day !== replaceDay) continue;
    // skip locked entries on full regeneration
    const entryRow = await query(
      'SELECT id, locked, recipe_id FROM meal_plan_entries WHERE plan_id = $1 AND day_of_week = $2',
      [planId, meal.day]
    );
    if (entryRow.rows.length && entryRow.rows[0].locked && !replaceDay) continue;

    const { rows: recipeRows } = await query(
      `INSERT INTO recipes (title, description, cuisine, instructions, prep_minutes, cook_minutes, servings, tags, est_cost_cents)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [meal.title, meal.description, meal.cuisine, meal.instructions, meal.prep_minutes,
       meal.cook_minutes, meal.servings, JSON.stringify(meal.tags || []), (meal.est_cost_rand || 0) * 100]
    );
    const recipeId = recipeRows[0].id;
    for (const ing of meal.ingredients || []) {
      await query(
        'INSERT INTO recipe_ingredients (recipe_id, name, quantity, unit, category) VALUES ($1,$2,$3,$4,$5)',
        [recipeId, ing.name, ing.quantity, ing.unit, ing.category]
      );
    }
    if (entryRow.rows.length) {
      await query('UPDATE meal_plan_entries SET recipe_id = $1 WHERE id = $2', [recipeId, entryRow.rows[0].id]);
    } else {
      await query('INSERT INTO meal_plan_entries (plan_id, day_of_week, recipe_id) VALUES ($1,$2,$3)',
        [planId, meal.day, recipeId]);
    }
  }
  // Stamp every entry in the window with its calendar date (covers generated,
  // swapped and locked-and-kept entries) so the plan renders in date order.
  for (const w of planWindow(weekStart)) {
    await query('UPDATE meal_plan_entries SET meal_date = $1 WHERE plan_id = $2 AND day_of_week = $3',
      [w.date, planId, w.weekday]);
  }
  return planId;
}

// Mark a week's plan row with a generation status so the client can poll.
async function setPlanStatus(weekStart, status, extra = {}) {
  await query(
    `INSERT INTO meal_plans (week_start, status, context) VALUES ($1, $2, $3)
     ON CONFLICT (week_start) DO UPDATE SET status = EXCLUDED.status`,
    [weekStart, status, JSON.stringify(extra)]
  );
}

// POST /api/plan/generate  { week_start, week: {...} }
// Returns 202 immediately and generates in the background — AI generation takes
// longer than gateway timeouts allow, so the client polls GET /plan/:week
// until status flips from 'generating' to 'active' (or 'error').
router.post('/generate', async (req, res, next) => {
  try {
    const { week_start, week = {} } = req.body;
    if (!week_start) return res.status(400).json({ error: 'week_start (start date, YYYY-MM-DD) is required' });

    const window = planWindow(week_start); // 7 days from the chosen start, any weekday
    const profile = await getSetting('household_profile', {});
    const ratings = await query(`
      SELECT r.title, SUM(m.rating)::int AS score, COUNT(*)::int AS votes
      FROM meal_ratings m JOIN recipes r ON r.id = m.recipe_id
      GROUP BY r.title ORDER BY score DESC LIMIT 30`);
    const recent = await query(`
      SELECT DISTINCT r.title FROM meal_plan_entries e
      JOIN recipes r ON r.id = e.recipe_id
      JOIN meal_plans p ON p.id = e.plan_id
      WHERE p.week_start >= (DATE($1) - INTERVAL '21 days') AND p.week_start < DATE($1)`, [week_start]);
    // Locked days in this window are kept verbatim — tell the planner so it fills
    // only the open days and never duplicates a locked meal.
    const lockedRows = await query(`
      SELECT e.day_of_week, e.meal_date, r.title FROM meal_plan_entries e
      JOIN meal_plans p ON p.id = e.plan_id LEFT JOIN recipes r ON r.id = e.recipe_id
      WHERE p.week_start = $1 AND e.locked = true`, [week_start]);
    const lockedDays = lockedRows.rows.map(r => r.day_of_week);
    const context = {
      profile,
      week: {
        ...week,
        days: window,
        days_to_plan: window.filter(w => !lockedDays.includes(w.weekday)),
        locked_days: lockedRows.rows.map(r => ({ day: r.day_of_week, title: r.title })),
        ratings: ratings.rows,
        recent_meals_to_avoid: recent.rows.map(r => r.title),
      },
    };

    await setPlanStatus(week_start, 'generating');
    res.status(202).json({ status: 'generating' });

    // Background work — not awaited by the response.
    (async () => {
      try {
        const generated = await generatePlan(context);
        const planId = await persistGeneratedPlan(week_start, context, generated);
        await query(`UPDATE meal_plans SET status = 'active' WHERE id = $1`, [planId]);
        console.log(`plan generated for ${week_start}`);
      } catch (err) {
        console.error(`plan generation failed for ${week_start}:`, err.message);
        await query(`UPDATE meal_plans SET status = 'error' WHERE week_start = $1`, [week_start]).catch(() => {});
      }
    })();
  } catch (e) { next(e); }
});

// GET /api/plan/current — the plan whose 7-day window covers today, else the latest.
router.get('/current', async (req, res, next) => {
  try {
    const today = todayISO();
    const { rows } = await query(`SELECT week_start FROM meal_plans WHERE status <> 'error' ORDER BY week_start DESC`);
    if (!rows.length) return res.status(404).json({ error: 'no plans yet' });
    const inWindow = rows.find(r => isoDate(r.week_start) <= today && today <= addDays(r.week_start, 6));
    const plan = await loadPlan(isoDate((inWindow || rows[0]).week_start));
    res.json(plan);
  } catch (e) { next(e); }
});

// GET /api/plan/:weekStart
router.get('/:weekStart', async (req, res, next) => {
  try {
    const plan = await loadPlan(req.params.weekStart);
    if (!plan) return res.status(404).json({ error: 'no plan for that week' });
    res.json(plan);
  } catch (e) { next(e); }
});

// GET /api/plan  — list all weeks
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM meal_plans ORDER BY week_start DESC LIMIT 26');
    res.json(rows);
  } catch (e) { next(e); }
});

// POST /api/plan/:weekStart/swap  { day, reason }
// Async like /generate: returns 202, swaps one meal in the background, client polls.
router.post('/:weekStart/swap', async (req, res, next) => {
  try {
    const weekStart = req.params.weekStart;
    const { day, reason } = req.body;
    const plan = await loadPlan(weekStart);
    if (!plan) return res.status(404).json({ error: 'no plan for that week' });
    const current = {
      meals: plan.meals.map(m => ({
        day: m.day_of_week, title: m.title, description: m.description, cuisine: m.cuisine,
        prep_minutes: m.prep_minutes, cook_minutes: m.cook_minutes, servings: m.servings,
        tags: m.tags, est_cost_rand: Math.round((m.est_cost_cents || 0) / 100),
        instructions: m.instructions, ingredients: m.ingredients,
      })),
    };
    const ctx = typeof plan.context === 'string' ? JSON.parse(plan.context) : plan.context;

    await query(`UPDATE meal_plans SET status = 'generating' WHERE id = $1`, [plan.id]);
    res.status(202).json({ status: 'generating' });

    (async () => {
      try {
        const generated = await swapMeal(ctx, current, day, reason);
        await persistGeneratedPlan(weekStart, ctx, generated, { replaceDay: day, existingPlanId: plan.id });
        await query(`UPDATE meal_plans SET status = 'active' WHERE id = $1`, [plan.id]);
        console.log(`swapped ${day} for ${weekStart}`);
      } catch (err) {
        console.error(`swap failed for ${weekStart} ${day}:`, err.message);
        await query(`UPDATE meal_plans SET status = 'active' WHERE id = $1`, [plan.id]).catch(() => {});
      }
    })();
  } catch (e) { next(e); }
});

// POST /api/plan/:weekStart/lock  { entry_id, locked }
router.post('/:weekStart/lock', async (req, res, next) => {
  try {
    await query('UPDATE meal_plan_entries SET locked = $1 WHERE id = $2', [Boolean(req.body.locked), req.body.entry_id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/plan/:weekStart/to-list  — consolidate plan ingredients into shopping_items
router.post('/:weekStart/to-list', async (req, res, next) => {
  try {
    const plan = await loadPlan(req.params.weekStart);
    if (!plan) return res.status(404).json({ error: 'no plan for that week' });
    const allIngredients = plan.meals.flatMap(m =>
      (m.ingredients || []).map(i => ({ ...i, source: 'meal_plan' })));
    const merged = consolidate(allIngredients);
    let added = 0, mergedCount = 0;
    for (const item of merged) {
      const existing = await query(
        `SELECT id, quantity FROM shopping_items WHERE normalized_name = $1 AND status = 'pending' AND (unit IS NOT DISTINCT FROM $2)`,
        [item.normalized_name, item.unit]
      );
      if (existing.rows.length) {
        await query('UPDATE shopping_items SET quantity = quantity + $1, updated_at = now() WHERE id = $2',
          [item.quantity, existing.rows[0].id]);
        mergedCount++;
      } else {
        await query(
          `INSERT INTO shopping_items (name, normalized_name, quantity, unit, category, source)
           VALUES ($1,$2,$3,$4,$5,'meal_plan')`,
          [item.name, item.normalized_name, item.quantity, item.unit, item.category]
        );
        added++;
      }
    }
    res.json({ added, merged: mergedCount, total: merged.length });
  } catch (e) { next(e); }
});

// POST /api/plan/rate  { recipe_id, member?, rating, comment? }
router.post('/rate', async (req, res, next) => {
  try {
    const { recipe_id, member = null, rating, comment = null } = req.body;
    if (!recipe_id || rating === undefined) return res.status(400).json({ error: 'recipe_id and rating required' });
    await query('INSERT INTO meal_ratings (recipe_id, member, rating, comment) VALUES ($1,$2,$3,$4)',
      [recipe_id, member, rating, comment]);
    res.status(201).json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
