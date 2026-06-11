import express from 'express';
import { query } from '../db/db.js';
import { generatePlan, swapMeal } from '../services/planner.js';
import { consolidate, normalizeName } from '../services/consolidate.js';

const router = express.Router();

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
    SELECT e.id AS entry_id, e.day_of_week, e.locked, e.status AS entry_status, r.*
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
  meals.sort((a, b) => order.indexOf(a.day_of_week) - order.indexOf(b.day_of_week));
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
    if (!week_start) return res.status(400).json({ error: 'week_start (Monday, YYYY-MM-DD) is required' });

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
    const context = {
      profile,
      week: { ...week, ratings: ratings.rows, recent_meals_to_avoid: recent.rows.map(r => r.title) },
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
