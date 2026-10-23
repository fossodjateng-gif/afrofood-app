-- Review and apply explicitly to the intended Preview database only.
-- Never executed by application startup or ensureOrdersSchema.
BEGIN;
ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS workstation_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS register_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS register_name TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_by TEXT REFERENCES staff_users(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_by_username TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_register_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_register_name TEXT;

CREATE OR REPLACE FUNCTION af_assert_staff_admin(session_hash TEXT, actor_id TEXT)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM staff_sessions s JOIN staff_users u ON u.id = s.user_id
    WHERE s.token_hash = session_hash AND u.id = actor_id AND u.role = 'admin' AND u.active
      AND s.revoked_at IS NULL AND s.expires_at > clock_timestamp() FOR SHARE OF s, u;
  IF NOT FOUND THEN RAISE EXCEPTION 'admin_required'; END IF;
  RETURN TRUE;
END $$;

CREATE OR REPLACE FUNCTION af_assert_staff_assignment(session_hash TEXT, actor_id TEXT, assigned_event TEXT, station_id TEXT)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE staff_role TEXT; station_config JSONB;
BEGIN
  SELECT u.role INTO staff_role FROM staff_sessions s JOIN staff_users u ON u.id = s.user_id
    WHERE s.token_hash = session_hash AND u.id = actor_id AND u.active
      AND s.revoked_at IS NULL AND s.expires_at > clock_timestamp()
      AND (u.role = 'admin' OR (u.cashier_event_id = assigned_event AND u.workstation_id = station_id))
      FOR SHARE OF s, u;
  IF NOT FOUND THEN RAISE EXCEPTION 'staff_context_changed'; END IF;
  IF staff_role <> 'admin' THEN
    SELECT setting_value INTO station_config FROM app_settings
      WHERE setting_key = 'workstations:' || assigned_event FOR SHARE;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(station_config->staff_role, '[]'::jsonb)) w
      WHERE w->>'id' = station_id AND w->>'type' = staff_role AND w->>'active' = 'true')
      THEN RAISE EXCEPTION 'workstation_assignment_invalid'; END IF;
  END IF;
  RETURN TRUE;
END $$;

-- Old application instances must stop acquiring/renewing event-wide leases.
-- Existing v2 rows remain until logout/release/TTL; v3 acquisition respects them.
CREATE OR REPLACE FUNCTION af_reject_legacy_cashier_protocol() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.event_name LIKE 'v2:%' THEN
    RAISE EXCEPTION 'cashier_protocol_upgrade_required';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS af_cashier_protocol_version ON cashier_event_locks;
CREATE TRIGGER af_cashier_protocol_version BEFORE INSERT OR UPDATE ON cashier_event_locks
FOR EACH ROW EXECUTE FUNCTION af_reject_legacy_cashier_protocol();

-- Lock authorization rows for the entire transaction containing the sale write.
-- Admin reassignment, station edits, logout and lease replacement must wait.
CREATE OR REPLACE FUNCTION af_assert_cashier_lease(
  session_hash TEXT, actor_id TEXT, assigned_event TEXT, station_id TEXT, lease_key TEXT, lease_owner TEXT
) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE station_config JSONB;
BEGIN
  PERFORM 1 FROM staff_sessions s JOIN staff_users u ON u.id = s.user_id
    WHERE s.token_hash = session_hash AND u.id = actor_id AND u.active = TRUE
      AND s.revoked_at IS NULL AND s.expires_at > clock_timestamp()
      AND u.role IN ('cashier','admin') AND u.cashier_event_id = assigned_event
      AND u.workstation_id = station_id FOR SHARE OF s, u;
  IF NOT FOUND THEN RAISE EXCEPTION 'cashier_context_changed'; END IF;
  SELECT setting_value INTO station_config FROM app_settings
    WHERE setting_key = 'workstations:' || assigned_event FOR SHARE;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(station_config->'cashier', '[]'::jsonb)) w
    WHERE w->>'id' = station_id AND w->>'type' = 'cashier' AND w->>'active' = 'true')
    THEN RAISE EXCEPTION 'workstation_assignment_invalid'; END IF;
  PERFORM 1 FROM cashier_event_locks
    WHERE event_name = lease_key AND user_id = lease_owner AND expires_at > clock_timestamp() FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'cashier_lease_required'; END IF;
  RETURN TRUE;
END $$;
COMMIT;
