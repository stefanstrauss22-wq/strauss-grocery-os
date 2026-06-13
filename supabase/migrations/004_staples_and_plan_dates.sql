-- Persistent, editable weekly-staples staging list.
-- Staples live here so the family can preview/edit them before they are pulled
-- into the shopping list. Seeded from settings.shopping_preferences; later the
-- system can add learned suggestions (kind='learned') from real purchase history.
CREATE TABLE IF NOT EXISTS staple_items (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  quantity        NUMERIC DEFAULT 1,
  unit            TEXT,
  category        TEXT DEFAULT 'other',           -- produce|meat|dairy|...
  kind            TEXT NOT NULL DEFAULT 'fixed',   -- fixed | rotation | learned | custom
  active          BOOLEAN NOT NULL DEFAULT true,   -- included on the next "send to list"
  note            TEXT,                            -- e.g. why it was suggested
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staples_norm ON staple_items(normalized_name);

-- Meal-plan entries get an actual calendar date so a plan can start on ANY day
-- (a rolling 7-day window from "today"), not just Mondays. day_of_week stays for
-- display/labels and remains unique within a 7-consecutive-day window.
ALTER TABLE meal_plan_entries ADD COLUMN IF NOT EXISTS meal_date DATE;
