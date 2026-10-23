-- Read-only historical baseline check. Run on the explicitly reviewed target.
BEGIN READ ONLY;
DO $$
DECLARE required RECORD; actual TEXT; key_name TEXT; duplicates BOOLEAN;
BEGIN
  IF current_setting('server_version_num')::integer < 140000 THEN
    RAISE EXCEPTION 'PostgreSQL 14+ required for reviewed trigger cutover';
  END IF;
  FOR required IN SELECT * FROM (VALUES
    ('id', 'text'), ('created_at', 'timestamp'), ('customer_name', 'text'),
    ('payment', 'text'), ('status', 'text'), ('items', 'jsonb')
  ) AS columns(name, kind) LOOP
    SELECT data_type INTO actual FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'orders' AND column_name = required.name;
    IF actual IS NULL OR (required.kind = 'timestamp' AND actual NOT LIKE 'timestamp%')
      OR (required.kind <> 'timestamp' AND actual <> required.kind) THEN
      RAISE EXCEPTION 'Historical orders column missing/incompatible: %', required.name;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'orders'::regclass AND contype = 'p'
    AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'orders'::regclass AND attname = 'id')]) THEN
    RAISE EXCEPTION 'orders.id primary key prerequisite missing';
  END IF;
  FOREACH key_name IN ARRAY ARRAY['pos_cash_key','pos_card_key'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema()
      AND table_name = 'orders' AND column_name = key_name) THEN
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM orders WHERE %I IS NOT NULL GROUP BY %I HAVING count(*) > 1)', key_name, key_name) INTO duplicates;
      IF duplicates THEN RAISE EXCEPTION 'Duplicate %: review without automatic cleanup', key_name; END IF;
    END IF;
  END LOOP;
END $$;
-- Review existing optional tables/types, indexes and constraints before IF NOT EXISTS.
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns WHERE table_schema = current_schema() AND table_name IN
 ('orders','staff_users','staff_sessions','staff_login_limits','order_refunds','staff_action_audit',
 'cashier_event_locks','terminal_active_orders','app_settings','menu_item_settings','event_menu_item_settings','custom_menu_items')
ORDER BY table_name, ordinal_position;
SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = current_schema() ORDER BY tablename, indexname;
ROLLBACK;
