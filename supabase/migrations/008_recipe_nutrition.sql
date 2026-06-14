-- Per-serving nutrition for each generated recipe. Estimated by the planner
-- alongside cost; null on older recipes until they are regenerated.
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS calories_kcal INT;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS protein_g     INT;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS carbs_g       INT;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS fat_g         INT;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS fibre_g       INT;
