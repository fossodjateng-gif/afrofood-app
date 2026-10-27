-- Phases 6B-1/2: prepare only. Apply explicitly after review; never from startup.
-- The existing six-argument permanent lease guard is retained unchanged.
BEGIN;
ALTER TABLE staff_sessions
  ADD COLUMN cashier_context_id TEXT,
  ADD COLUMN cashier_context_event_id TEXT,
  ADD COLUMN cashier_context_workstation_id TEXT,
  ADD COLUMN cashier_context_instance_id TEXT,
  ADD COLUMN cashier_context_created_at TIMESTAMPTZ,
  ADD COLUMN cashier_context_expires_at TIMESTAMPTZ,
  ADD CONSTRAINT staff_sessions_cashier_context_complete CHECK (
    (
      cashier_context_id IS NULL
      AND cashier_context_event_id IS NULL
      AND cashier_context_workstation_id IS NULL
      AND cashier_context_instance_id IS NULL
      AND cashier_context_created_at IS NULL
      AND cashier_context_expires_at IS NULL
    ) OR (
      cashier_context_id IS NOT NULL
      AND cashier_context_event_id IS NOT NULL
      AND cashier_context_workstation_id IS NOT NULL
      AND cashier_context_instance_id IS NOT NULL
      AND cashier_context_created_at IS NOT NULL
      AND cashier_context_expires_at IS NOT NULL
      AND cashier_context_id ~ '^[a-f0-9]{64}$'
      AND length(trim(cashier_context_event_id)) > 0
      AND length(trim(cashier_context_workstation_id)) > 0
      AND cashier_context_instance_id ~ '^[a-f0-9-]{36}$'
      AND cashier_context_created_at >= created_at
      AND cashier_context_expires_at > cashier_context_created_at
      AND cashier_context_expires_at <= expires_at
    )
  );

-- Canonical resource shared with leaseKeys(): compact JSON, no new lock scope.
CREATE FUNCTION af_cashier_context_resource(p_event TEXT, p_station TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT 'v3:[' || to_json(p_event)::text || ',' || to_json(p_station)::text || ']'
$$;

-- The eight-argument overload does not replace or relax the permanent guard.
CREATE FUNCTION af_assert_cashier_lease(
  p_session TEXT, p_actor TEXT, p_event TEXT, p_station TEXT,
  p_key TEXT, p_owner TEXT, p_context TEXT, p_instance TEXT
) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE station_config JSONB; event_config JSONB;
BEGIN
  IF p_context IS NULL THEN
    RETURN af_assert_cashier_lease(p_session, p_actor, p_event, p_station, p_key, p_owner);
  END IF;
  IF p_instance IS NULL OR p_key IS DISTINCT FROM af_cashier_context_resource(p_event, p_station)
    OR p_owner IS DISTINCT FROM ('v2:' || p_session || ':ctx:' || p_context || ':' || p_instance)
    THEN RAISE EXCEPTION 'cashier_context_invalid'; END IF;
  PERFORM 1 FROM staff_sessions s JOIN staff_users u ON u.id = s.user_id
    WHERE s.token_hash = p_session AND u.id = p_actor AND u.active AND u.role = 'admin'
      AND s.revoked_at IS NULL AND s.expires_at > clock_timestamp()
      AND s.cashier_context_id = p_context AND s.cashier_context_event_id = p_event
      AND s.cashier_context_workstation_id = p_station AND s.cashier_context_instance_id = p_instance
      AND s.cashier_context_created_at <= clock_timestamp()
      AND s.cashier_context_expires_at > clock_timestamp()
      AND s.cashier_context_expires_at <= s.expires_at
    FOR SHARE OF s, u;
  IF NOT FOUND THEN RAISE EXCEPTION 'cashier_context_invalid'; END IF;
  SELECT setting_value INTO event_config FROM app_settings WHERE setting_key = 'store_config' FOR SHARE;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(event_config->'events', '[]'::jsonb)) e WHERE e->>'id' = p_event)
    THEN RAISE EXCEPTION 'cashier_context_event_invalid'; END IF;
  SELECT setting_value INTO station_config FROM app_settings WHERE setting_key = 'workstations:' || p_event FOR SHARE;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(station_config->'cashier', '[]'::jsonb)) w
    WHERE w->>'id' = p_station AND w->>'type' = 'cashier' AND w->>'active' = 'true')
    THEN RAISE EXCEPTION 'workstation_assignment_invalid'; END IF;
  PERFORM 1 FROM cashier_event_locks WHERE event_name = p_key AND user_id = p_owner
    AND expires_at > clock_timestamp() FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'cashier_lease_required'; END IF;
  RETURN TRUE;
END $$;

-- One function call = one transaction: failed acquisition rolls back the new
-- context AND any deletion of its predecessor. No pending/unlocked context.
CREATE FUNCTION af_open_admin_cashier_context(
  p_session TEXT, p_actor TEXT, p_context TEXT, p_event TEXT, p_station TEXT,
  p_instance TEXT, p_requested_expiry TIMESTAMPTZ
) RETURNS TABLE(context_id TEXT, event_id TEXT, workstation_id TEXT, instance_id TEXT, created_at TIMESTAMPTZ, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql AS $$
DECLARE saved staff_sessions%ROWTYPE; real_username TEXT; station_config JSONB;
  event_config JSONB; started TIMESTAMPTZ; deadline TIMESTAMPTZ; resource TEXT; owner TEXT;
BEGIN
  SELECT s.* INTO saved FROM staff_sessions s JOIN staff_users u ON u.id = s.user_id
    WHERE s.token_hash = p_session AND u.id = p_actor AND u.active AND u.role = 'admin'
      AND s.revoked_at IS NULL AND s.expires_at > clock_timestamp()
    FOR UPDATE OF s FOR SHARE OF u;
  IF NOT FOUND THEN RAISE EXCEPTION 'admin_required'; END IF;
  SELECT u.username INTO real_username FROM staff_users u WHERE u.id = p_actor;
  started := clock_timestamp();
  deadline := LEAST(p_requested_expiry, saved.expires_at);
  IF p_context IS NULL OR p_context !~ '^[a-f0-9]{64}$' OR p_context = saved.cashier_context_id
    OR p_instance IS NULL OR p_instance !~ '^[a-f0-9-]{36}$'
    OR p_requested_expiry IS NULL OR deadline <= started
    THEN RAISE EXCEPTION 'cashier_context_invalid'; END IF;
  SELECT setting_value INTO event_config FROM app_settings WHERE setting_key = 'store_config' FOR SHARE;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(event_config->'events', '[]'::jsonb)) e WHERE e->>'id' = p_event)
    THEN RAISE EXCEPTION 'cashier_context_event_invalid'; END IF;
  SELECT setting_value INTO station_config FROM app_settings WHERE setting_key = 'workstations:' || p_event FOR SHARE;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(station_config->'cashier', '[]'::jsonb)) w
    WHERE w->>'id' = p_station AND w->>'type' = 'cashier' AND w->>'active' = 'true')
    THEN RAISE EXCEPTION 'workstation_assignment_invalid'; END IF;

  IF saved.cashier_context_id IS NOT NULL THEN
    -- Another live tab cannot displace this session's active context, even
    -- when it asks for a different workstation. Explicit close must come first.
    IF saved.cashier_context_instance_id <> p_instance AND saved.cashier_context_expires_at > clock_timestamp()
      AND EXISTS (SELECT 1 FROM cashier_event_locks
        WHERE event_name = af_cashier_context_resource(saved.cashier_context_event_id, saved.cashier_context_workstation_id)
          AND user_id = 'v2:' || p_session || ':ctx:' || saved.cashier_context_id || ':' || saved.cashier_context_instance_id
          AND cashier_event_locks.expires_at > clock_timestamp())
      THEN RAISE EXCEPTION 'cashier_context_instance_conflict'; END IF;
    DELETE FROM cashier_event_locks
      WHERE event_name = af_cashier_context_resource(saved.cashier_context_event_id, saved.cashier_context_workstation_id)
        AND user_id = 'v2:' || p_session || ':ctx:' || saved.cashier_context_id || ':' || saved.cashier_context_instance_id;
  END IF;
  IF EXISTS (SELECT 1 FROM cashier_event_locks legacy
    WHERE (legacy.event_name = 'v2:' || p_event OR legacy.event_name NOT LIKE 'v3:%') AND legacy.expires_at > clock_timestamp())
    THEN RAISE EXCEPTION 'cashier_locked'; END IF;
  resource := af_cashier_context_resource(p_event, p_station);
  owner := 'v2:' || p_session || ':ctx:' || p_context || ':' || p_instance;
  UPDATE staff_sessions SET cashier_context_id = p_context, cashier_context_event_id = p_event,
    cashier_context_workstation_id = p_station, cashier_context_instance_id = p_instance,
    cashier_context_created_at = started, cashier_context_expires_at = deadline
    WHERE token_hash = p_session;
  INSERT INTO cashier_event_locks (event_name, user_id, username, heartbeat_at, expires_at)
    VALUES (resource, owner, real_username, clock_timestamp(), LEAST(deadline, clock_timestamp() + INTERVAL '120 seconds'))
    ON CONFLICT (event_name) DO UPDATE SET user_id = EXCLUDED.user_id, username = EXCLUDED.username,
      heartbeat_at = EXCLUDED.heartbeat_at, expires_at = EXCLUDED.expires_at
    WHERE cashier_event_locks.expires_at <= clock_timestamp() OR cashier_event_locks.user_id = EXCLUDED.user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'cashier_locked'; END IF;
  -- Revalidate after waits on the resource; also locks auth/config/lease rows
  -- for the entire opening transaction. A deadline crossed while waiting fails.
  PERFORM af_assert_cashier_lease(p_session, p_actor, p_event, p_station, resource, owner, p_context, p_instance);
  RETURN QUERY SELECT p_context, p_event, p_station, p_instance, started, deadline;
END $$;

CREATE FUNCTION af_close_admin_cashier_context(p_session TEXT, p_actor TEXT, p_context TEXT)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE saved staff_sessions%ROWTYPE;
BEGIN
  SELECT s.* INTO saved FROM staff_sessions s JOIN staff_users u ON u.id = s.user_id
    WHERE s.token_hash = p_session AND u.id = p_actor AND u.active AND u.role = 'admin'
      AND s.revoked_at IS NULL AND s.expires_at > clock_timestamp()
    FOR UPDATE OF s FOR SHARE OF u;
  IF NOT FOUND THEN RAISE EXCEPTION 'admin_required'; END IF;
  IF saved.cashier_context_id IS DISTINCT FROM p_context OR p_context IS NULL THEN RETURN FALSE; END IF;
  DELETE FROM cashier_event_locks
    WHERE event_name = af_cashier_context_resource(saved.cashier_context_event_id, saved.cashier_context_workstation_id)
      AND user_id = 'v2:' || p_session || ':ctx:' || p_context || ':' || saved.cashier_context_instance_id;
  UPDATE staff_sessions SET cashier_context_id = NULL, cashier_context_event_id = NULL,
    cashier_context_workstation_id = NULL, cashier_context_instance_id = NULL,
    cashier_context_created_at = NULL, cashier_context_expires_at = NULL WHERE token_hash = p_session;
  RETURN TRUE;
END $$;

-- Resume/heartbeat must never resurrect a lost or expired temporary lease.
CREATE FUNCTION af_heartbeat_admin_cashier_context(
  p_session TEXT, p_actor TEXT, p_event TEXT, p_station TEXT, p_context TEXT, p_instance TEXT
) RETURNS TABLE(username TEXT, heartbeat_at TIMESTAMPTZ, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql AS $$
DECLARE resource TEXT; owner TEXT; deadline TIMESTAMPTZ;
BEGIN
  resource := af_cashier_context_resource(p_event, p_station);
  owner := 'v2:' || p_session || ':ctx:' || p_context || ':' || p_instance;
  PERFORM af_assert_cashier_lease(p_session, p_actor, p_event, p_station, resource, owner, p_context, p_instance);
  SELECT s.cashier_context_expires_at INTO deadline FROM staff_sessions s WHERE s.token_hash = p_session;
  RETURN QUERY UPDATE cashier_event_locks l SET heartbeat_at = clock_timestamp(),
    expires_at = LEAST(deadline, clock_timestamp() + INTERVAL '120 seconds')
    WHERE l.event_name = resource AND l.user_id = owner AND l.expires_at > clock_timestamp()
    RETURNING l.username, l.heartbeat_at, l.expires_at;
  IF NOT FOUND THEN RAISE EXCEPTION 'cashier_lease_required'; END IF;
END $$;
COMMIT;
