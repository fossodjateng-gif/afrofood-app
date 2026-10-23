-- MANUAL CUTOVER ONLY: all legacy tills/deployments must first be stopped.
-- Existing leases expire naturally (120s); do not delete another owner's lease.
BEGIN;
LOCK TABLE cashier_event_locks IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cashier_event_locks WHERE event_name NOT LIKE 'v3:%' AND expires_at > clock_timestamp()) THEN
    RAISE EXCEPTION 'legacy_cashier_leases_active: close tills and wait for TTL';
  END IF;
END $$;
CREATE OR REPLACE TRIGGER af_cashier_protocol_version BEFORE INSERT OR UPDATE ON cashier_event_locks
FOR EACH ROW EXECUTE FUNCTION af_reject_legacy_cashier_protocol();
COMMIT;
