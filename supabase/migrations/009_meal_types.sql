-- Multiple meals per day: a plan entry is now per (day, meal_type), where
-- meal_type is breakfast | lunch | dinner. Existing rows are dinners.
ALTER TABLE meal_plan_entries ADD COLUMN IF NOT EXISTS meal_type TEXT DEFAULT 'dinner';
