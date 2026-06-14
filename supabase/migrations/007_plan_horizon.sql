-- Planning horizon: a plan can cover the next 3 nights or the next 7.
-- Stored per plan so the window length is known everywhere it is rendered.
ALTER TABLE meal_plans ADD COLUMN IF NOT EXISTS horizon_days INT DEFAULT 7;
