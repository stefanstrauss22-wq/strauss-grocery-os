-- Simple family to-do list. Tasks come from the app or the WhatsApp bot
-- (which now splits reminders out from grocery items). Title + done only for now.
CREATE TABLE IF NOT EXISTS tasks (
  id         SERIAL PRIMARY KEY,
  title      TEXT NOT NULL,
  done       BOOLEAN NOT NULL DEFAULT false,
  source     TEXT NOT NULL DEFAULT 'manual',  -- manual | whatsapp
  added_by   TEXT,                            -- member name or phone
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tasks_done ON tasks(done);
