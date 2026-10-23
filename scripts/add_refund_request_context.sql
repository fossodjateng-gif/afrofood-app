-- Additive audit snapshots for Refund V1. Review/apply separately to Preview.
-- Never executed by application startup. No historical attribution is guessed.
BEGIN;
ALTER TABLE order_refunds ADD COLUMN IF NOT EXISTS requested_by_username TEXT;
ALTER TABLE order_refunds ADD COLUMN IF NOT EXISTS requested_event_id TEXT;
ALTER TABLE order_refunds ADD COLUMN IF NOT EXISTS requested_register_id TEXT;
ALTER TABLE order_refunds ADD COLUMN IF NOT EXISTS requested_register_name TEXT;
COMMIT;
