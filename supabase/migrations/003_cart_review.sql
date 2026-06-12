-- Let the human correct what the robot picked, before "I checked out" records it.
ALTER TABLE cart_run_items ADD COLUMN IF NOT EXISTS bought BOOLEAN DEFAULT true;
ALTER TABLE cart_run_items ADD COLUMN IF NOT EXISTS final_quantity NUMERIC;
