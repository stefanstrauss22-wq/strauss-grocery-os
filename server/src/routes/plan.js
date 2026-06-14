import express from 'express';
import { query } from '../db/db.js';
import { generatePlan, swapMeal } from '../services/planner.js';
import { consolidate, normalizeName, shoppableQuantity } from '../services/consolidate.js';
import { ensureAfTranslations, planDisplayStrings } from '../services/translateService.js';

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
// The calendar days of a plan (3 or 7), starting at startISO (any weekday).
const planWindow = (startISO, days = 7) => Array.from({ length: days }, (_, i) => { const date = addDays(startISO, i); return { date, weekday: weekdayOf(date) }; });
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const MEAL_ORDER = { breakfast: 0, lunch: 1, dinner: 2 };
const mealSlot = m => MEAL_ORDER[m?.meal_type] ?? 2;

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
    SELECT e.id AS entry_id, e.day_of_week, e.meal_type, e.meal_date, e.locked, e.status AS entry_status, r.*
    FROM meal_plan_entries e LEFT JOIN recipes r ON r.id = e.recipe_id
    WHERE e.plan_id = $1`, [plan.id]);
  const order = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const meals = [];
  for (const row of entries.rows) {
    const ing = row.id
      ? (await query('SELECT name, quantity, unit, category FROM recipe_ingredients WHERE recipe_id = $1', [row.id])).rows
      : [];
    meals.push({ ...row, meal_type: row.meal_type || 'dinner', ingredients: ing });
  }
  // Order by actual date (rolling windows can start any day), then by meal slot
  // (breakfast → lunch → dinner). Fall back to Mon–Sun for pre-date entries.
  meals.sort((a, b) => {
    if (a.meal_date && b.meal_date && isoDate(a.meal_date) !== isoDate(b.meal_date))
      return isoDate(a.meal_date) < isoDate(b.meal_date) ? -1 : 1;
    if (a.day_of_week !== b.day_of_week)
      return order.indexOf(a.day_of_week) - order.indexOf(b.day_of_week);
    return mealSlot(a) - mealSlot(b);
  });
  return { ...plan, meals };
}

async function persistGeneratedPlan(weekStart, context, generated, { replace = null, existingPlanId = null, days = 7, mealTypes = ['dinner'] } = {}) {
  let planId = existingPlanId;
  if (!planId) {
    const existing = await query('SELECT id FROM meal_plans WHERE week_start = $1', [weekStart]);
    if (existing.rows.length) {
      planId = existing.rows[0].id;
      await query('UPDATE meal_plans SET context = $1, horizon_days = $2 WHERE id = $3', [JSON.stringify(context), days, planId]);
    } else {
      const { rows } = await query(
        'INSERT INTO meal_plans (week_start, context, horizon_days) VALUES ($1, $2, $3) RETURNING id',
        [weekStart, JSON.stringify(context), days]
      );
      planId = rows[0].id;
    }
  }
  // Full regen may change the horizon (7 → 3 days) or the chosen meals (drop
  // lunch): remove any entry whose weekday or meal_type is no longer included.
  if (!replace) {
    const windowWeekdays = planWindow(weekStart, days).map(w => w.weekday);
    await query(
      `DELETE FROM meal_plan_entries WHERE plan_id = $1
         AND (day_of_week <> ALL($2::text[]) OR COALESCE(meal_type, 'dinner') <> ALL($3::text[]))`,
      [planId, windowWeekdays, mealTypes]);
  }
  // Rolling regen: carry any LOCKED meal whose date falls in this window into
  // this plan (even if it lived on a previous plan), matched by date + meal_type,
  // so "keep my locked meals" survives the window rolling forward.
  if (!replace) {
    const windowDates = planWindow(weekStart, days).map(w => w.date);
    await query(
      `INSERT INTO meal_plan_entries (plan_id, day_of_week, meal_type, recipe_id, locked, meal_date)
       SELECT $1, e.day_of_week, COALESCE(e.meal_type, 'dinner'), e.recipe_id, true, e.meal_date
       FROM meal_plan_entries e
       WHERE e.locked = true AND e.meal_date = ANY($2::date[]) AND e.plan_id <> $1
         AND NOT EXISTS (SELECT 1 FROM meal_plan_entries x WHERE x.plan_id = $1
           AND x.day_of_week = e.day_of_week AND COALESCE(x.meal_type,'dinner') = COALESCE(e.meal_type,'dinner'))`,
      [planId, windowDates]);
  }
  for (const meal of generated.meals) {
    const mealType = meal.meal_type || 'dinner';
    if (replace && (meal.day !== replace.day || mealType !== replace.meal_type)) continue;
    // skip locked entries on full regeneration
    const entryRow = await query(
      `SELECT id, locked, recipe_id FROM meal_plan_entries WHERE plan_id = $1 AND day_of_week = $2 AND COALESCE(meal_type,'dinner') = $3`,
      [planId, meal.day, mealType]
    );
    if (entryRow.rows.length && entryRow.rows[0].locked && !replace) continue;

    const n = meal.nutrition || {};
    const { rows: recipeRows } = await query(
      `INSERT INTO recipes (title, description, cuisine, instructions, prep_minutes, cook_minutes, servings, tags, est_cost_cents, calories_kcal, protein_g, carbs_g, fat_g, fibre_g)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
      [meal.title, meal.description, meal.cuisine, meal.instructions, meal.prep_minutes,
       meal.cook_minutes, meal.servings, JSON.stringify(meal.tags || []), (meal.est_cost_rand || 0) * 100,
       n.calories_kcal ?? null, n.protein_g ?? null, n.carbs_g ?? null, n.fat_g ?? null, n.fibre_g ?? null]
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
      await query('INSERT INTO meal_plan_entries (plan_id, day_of_week, meal_type, recipe_id) VALUES ($1,$2,$3,$4)',
        [planId, meal.day, mealType, recipeId]);
    }
  }
  // Stamp every entry in the window with its calendar date (covers generated,
  // swapped and locked-and-kept entries) so the plan renders in date order.
  for (const w of planWindow(weekStart, days)) {
    await query('UPDATE meal_plan_entries SET meal_date = $1 WHERE plan_id = $2 AND day_of_week = $3',
      [w.date, planId, w.weekday]);
  }
  return planId;
}

// Mark a week's plan row with a generation status so the client can poll.
// Stamps the chosen horizon up front so the window length is known while the
// plan is still generating.
async function setPlanStatus(weekStart, status, horizonDays = null) {
  if (horizonDays) {
    await query(
      `INSERT INTO meal_plans (week_start, status, horizon_days) VALUES ($1, $2, $3)
       ON CONFLICT (week_start) DO UPDATE SET status = EXCLUDED.status, horizon_days = EXCLUDED.horizon_days`,
      [weekStart, status, horizonDays]
    );
  } else {
    await query(
      `INSERT INTO meal_plans (week_start, status) VALUES ($1, $2)
       ON CONFLICT (week_start) DO UPDATE SET status = EXCLUDED.status`,
      [weekStart, status]
    );
  }
}

// POST /api/plan/generate  { week_start, week: {...} }
// Returns 202 immediately and generates in the background — AI generation takes
// longer than gateway timeouts allow, so the client polls GET /plan/:week
// until status flips from 'generating' to 'active' (or 'error').
router.post('/generate', async (req, res, next) => {
  try {
    const { week_start, week = {}, language = 'en' } = req.body;
    if (!week_start) return res.status(400).json({ error: 'week_start (start date, YYYY-MM-DD) is required' });

    const horizon = Number(req.body.horizon_days) === 3 ? 3 : 7; // next 3 or next 7 nights
    // Which meals to plan (breakfast/lunch/dinner) and a per-meal per-day style.
    const mealTypes = (Array.isArray(week.meal_types) && week.meal_types.length
      ? week.meal_types : ['dinner']).filter(t => ['breakfast', 'lunch', 'dinner'].includes(t));
    const schedule = week.schedule || {};
    const window = planWindow(week_start, horizon); // N days from the chosen start, any weekday
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
    // Locked meals anywhere in this window are kept verbatim — tell the planner
    // so it fills only the open slots and never duplicates a locked meal.
    // Matched by date + meal_type so locks survive the window rolling forward.
    const lockedRows = await query(`
      SELECT DISTINCT e.day_of_week, COALESCE(e.meal_type,'dinner') AS meal_type, e.meal_date, r.title FROM meal_plan_entries e
      LEFT JOIN recipes r ON r.id = e.recipe_id
      WHERE e.locked = true AND e.meal_date = ANY($1::date[])`, [window.map(w => w.date)]);
    const lockedSet = new Set(lockedRows.rows.map(r => `${r.day_of_week}|${r.meal_type}`));
    // Explicit work list: every (day, meal_type) we need, minus the locked ones.
    const toPlan = [];
    for (const w of window) {
      for (const mt of mealTypes) {
        if (lockedSet.has(`${w.weekday}|${mt}`)) continue;
        const style = (schedule[mt] && schedule[mt][w.weekday]) || 'normal';
        toPlan.push({ date: w.date, weekday: w.weekday, meal_type: mt, style });
      }
    }
    const context = {
      profile,
      language, // 'en' | 'af' — recipe prose language (ingredient names stay English)
      week: {
        ...week,
        meal_types: mealTypes,
        days: window,
        to_plan: toPlan,
        locked_meals: lockedRows.rows.map(r => ({ day: r.day_of_week, meal_type: r.meal_type, title: r.title })),
        ratings: ratings.rows,
        recent_meals_to_avoid: recent.rows.map(r => r.title),
      },
    };

    await setPlanStatus(week_start, 'generating', horizon);
    res.status(202).json({ status: 'generating' });

    // Background work — not awaited by the response.
    (async () => {
      try {
        const generated = await generatePlan(context);
        const planId = await persistGeneratedPlan(week_start, context, generated, { days: horizon, mealTypes });
        // Pre-warm Afrikaans translations so the plan shows in AF immediately,
        // with no English-then-Afrikaans flip after it loads.
        if (language === 'af') await ensureAfTranslations(planDisplayStrings(generated)).catch(() => {});
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
    const { rows } = await query(`SELECT week_start, COALESCE(horizon_days, 7) AS horizon_days FROM meal_plans WHERE status <> 'error' ORDER BY week_start DESC`);
    if (!rows.length) return res.status(404).json({ error: 'no plans yet' });
    const inWindow = rows.find(r => isoDate(r.week_start) <= today && today <= addDays(r.week_start, r.horizon_days - 1));
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

// POST /api/plan/:weekStart/swap  { day, meal_type?, reason }
// Async like /generate: returns 202, swaps one meal in the background, client polls.
router.post('/:weekStart/swap', async (req, res, next) => {
  try {
    const weekStart = req.params.weekStart;
    const { day, reason } = req.body;
    const mealType = ['breakfast', 'lunch', 'dinner'].includes(req.body.meal_type) ? req.body.meal_type : 'dinner';
    const plan = await loadPlan(weekStart);
    if (!plan) return res.status(404).json({ error: 'no plan for that week' });
    const current = {
      meals: plan.meals.map(m => ({
        day: m.day_of_week, meal_type: m.meal_type || 'dinner', title: m.title, description: m.description, cuisine: m.cuisine,
        prep_minutes: m.prep_minutes, cook_minutes: m.cook_minutes, servings: m.servings,
        tags: m.tags, est_cost_rand: Math.round((m.est_cost_cents || 0) / 100),
        nutrition: {
          calories_kcal: m.calories_kcal, protein_g: m.protein_g,
          carbs_g: m.carbs_g, fat_g: m.fat_g, fibre_g: m.fibre_g,
        },
        instructions: m.instructions, ingredients: m.ingredients,
      })),
    };
    const ctx = typeof plan.context === 'string' ? JSON.parse(plan.context) : plan.context;

    await query(`UPDATE meal_plans SET status = 'generating' WHERE id = $1`, [plan.id]);
    res.status(202).json({ status: 'generating' });

    (async () => {
      try {
        const generated = await swapMeal(ctx, current, day, mealType, reason);
        await persistGeneratedPlan(weekStart, ctx, generated, { replace: { day, meal_type: mealType }, existingPlanId: plan.id, days: plan.horizon_days || 7 });
        // Pre-warm AF translations for the new meal before the plan flips to ready.
        if (ctx?.language === 'af') await ensureAfTranslations(planDisplayStrings(generated)).catch(() => {});
        await query(`UPDATE meal_plans SET status = 'active' WHERE id = $1`, [plan.id]);
        console.log(`swapped ${mealType} ${day} for ${weekStart}`);
      } catch (err) {
        console.error(`swap failed for ${weekStart} ${day} ${mealType}:`, err.message);
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
      // Recipe amounts → shoppable amounts (no "3 tablespoons of curry").
      const { quantity, unit } = shoppableQuantity(item);
      const existing = await query(
        `SELECT id, quantity FROM shopping_items WHERE normalized_name = $1 AND status = 'pending' AND (unit IS NOT DISTINCT FROM $2)`,
        [item.normalized_name, unit]
      );
      if (existing.rows.length) {
        // Pack-style items (no unit) don't accumulate — one jar covers the week.
        if (unit !== null) {
          await query('UPDATE shopping_items SET quantity = quantity + $1, updated_at = now() WHERE id = $2',
            [quantity, existing.rows[0].id]);
        }
        mergedCount++;
      } else {
        await query(
          `INSERT INTO shopping_items (name, normalized_name, quantity, unit, category, source)
           VALUES ($1,$2,$3,$4,$5,'meal_plan')`,
          [item.name, item.normalized_name, quantity, unit, item.category]
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
