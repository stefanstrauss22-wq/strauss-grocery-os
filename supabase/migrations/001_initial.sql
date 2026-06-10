-- Strauss Grocery OS — initial schema
-- Plain Postgres SQL: runs on Supabase, Railway Postgres, and embedded PGlite.

CREATE TABLE IF NOT EXISTS members (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member',  -- parent | child | domestic | member
  phone         TEXT UNIQUE,                     -- E.164, links WhatsApp senders to members
  language      TEXT DEFAULT 'en',               -- en | af
  dietary_notes TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Household-level profile: budget default, equipment, weekly rhythms, allergies.
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- The unified shopping list. Items flow in from WhatsApp, meal plans, manual adds,
-- and (later) predictions. One list, many sources.
CREATE TABLE IF NOT EXISTS shopping_items (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  quantity        NUMERIC DEFAULT 1,
  unit            TEXT,                          -- e.g. kg, g, L, ml, each, pack
  category        TEXT DEFAULT 'other',          -- produce|meat|dairy|bakery|pantry|frozen|household|toiletries|pet|other
  source          TEXT NOT NULL DEFAULT 'manual',-- whatsapp | meal_plan | manual | predicted
  added_by        TEXT,                          -- member name or phone
  urgency         TEXT DEFAULT 'normal',         -- normal | urgent
  status          TEXT NOT NULL DEFAULT 'pending',-- pending | in_cart | purchased | unavailable | removed
  note            TEXT,
  plan_entry_id   INT,                           -- set when sourced from a meal plan
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_items_status ON shopping_items(status);
CREATE INDEX IF NOT EXISTS idx_items_norm   ON shopping_items(normalized_name);

-- THE DATA MOAT: confirmed mappings from ingredient text to a real Sixty60 product.
-- Every successful cart add teaches the system; tier-1 replay needs no AI at all.
CREATE TABLE IF NOT EXISTS product_catalog (
  id                  SERIAL PRIMARY KEY,
  ingredient_key      TEXT NOT NULL,             -- normalized ingredient ("milk", "melk" maps via aliases)
  aliases             JSONB DEFAULT '[]',        -- alternative names that map to this product
  retailer            TEXT NOT NULL DEFAULT 'sixty60',
  product_name        TEXT NOT NULL,             -- "Clover Full Cream Milk 2L"
  external_product_id TEXT,                      -- retailer product id if known
  product_url         TEXT,                      -- direct PDP URL (tier-1 replay target)
  pack_size           TEXT,
  last_price_cents    INT,
  currency            TEXT DEFAULT 'ZAR',
  confidence          TEXT NOT NULL DEFAULT 'suggested', -- suggested (AI-picked) | confirmed (human-approved)
  substitution_policy TEXT DEFAULT 'equivalent', -- exact | same_brand | equivalent | ask
  times_purchased     INT DEFAULT 0,
  last_purchased_at   TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE (ingredient_key, retailer)
);

CREATE TABLE IF NOT EXISTS recipes (
  id           SERIAL PRIMARY KEY,
  title        TEXT NOT NULL,
  description  TEXT,
  cuisine      TEXT,
  instructions TEXT,
  prep_minutes INT,
  cook_minutes INT,
  servings     INT DEFAULT 6,
  tags         JSONB DEFAULT '[]',               -- ["braai","one-pot","air-fryer","kid-friendly",...]
  est_cost_cents INT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id        SERIAL PRIMARY KEY,
  recipe_id INT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  name      TEXT NOT NULL,
  quantity  NUMERIC,
  unit      TEXT,
  category  TEXT DEFAULT 'other'
);

CREATE TABLE IF NOT EXISTS meal_plans (
  id         SERIAL PRIMARY KEY,
  week_start DATE NOT NULL UNIQUE,               -- Monday
  context    JSONB DEFAULT '{}',                 -- wizard inputs: budget, schedule grid, mood chips
  status     TEXT DEFAULT 'draft',               -- draft | active | done
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meal_plan_entries (
  id          SERIAL PRIMARY KEY,
  plan_id     INT NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
  day_of_week TEXT NOT NULL,                     -- Monday..Sunday
  recipe_id   INT REFERENCES recipes(id),
  locked      BOOLEAN DEFAULT false,
  status      TEXT DEFAULT 'planned'             -- planned | cooked | skipped
);

CREATE TABLE IF NOT EXISTS meal_ratings (
  id         SERIAL PRIMARY KEY,
  recipe_id  INT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  member     TEXT,
  rating     INT NOT NULL,                       -- 1 = thumbs up, -1 = thumbs down, 0 = meh
  comment    TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Raw inbound WhatsApp log (audit trail + extraction training data).
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id            SERIAL PRIMARY KEY,
  wa_message_id TEXT UNIQUE,
  from_phone    TEXT,
  from_name     TEXT,
  body          TEXT,
  media_type    TEXT,                            -- text | audio | image
  transcript    TEXT,                            -- for voice notes
  extracted     JSONB,                           -- items the AI pulled out
  processed     BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cart_runs (
  id          SERIAL PRIMARY KEY,
  status      TEXT NOT NULL DEFAULT 'running',   -- running | done | failed
  summary     JSONB DEFAULT '{}',                -- counts, total estimate, notes
  started_at  TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS cart_run_items (
  id               SERIAL PRIMARY KEY,
  run_id           INT NOT NULL REFERENCES cart_runs(id) ON DELETE CASCADE,
  shopping_item_id INT REFERENCES shopping_items(id),
  tier             INT,                          -- 1 known-SKU replay | 2 search+AI | 3 flagged
  status           TEXT NOT NULL,                -- added | substituted | unavailable | needs_review | error
  product_name     TEXT,
  product_url      TEXT,
  price_cents      INT,
  note             TEXT
);

-- Feeds Phase-3 predictive staples ("you buy milk every 5 days").
CREATE TABLE IF NOT EXISTS purchase_history (
  id           SERIAL PRIMARY KEY,
  item_name    TEXT NOT NULL,
  catalog_id   INT REFERENCES product_catalog(id),
  quantity     NUMERIC DEFAULT 1,
  price_cents  INT,
  purchased_at TIMESTAMPTZ DEFAULT now()
);
