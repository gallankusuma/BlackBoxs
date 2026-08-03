-- Add description column to proposal_items
ALTER TABLE proposal_items ADD COLUMN IF NOT EXISTS description TEXT AFTER unit_price_snapshot;
