-- Explicit prerequisites mirrored from runtime schema helpers.
-- Manual only; no historic payer/quantity backfill.
BEGIN;

CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      customer_name TEXT,
      payment TEXT NOT NULL,
      payment_provider TEXT,
      stripe_payment_intent_id TEXT,
      amount_cents INTEGER,
      currency TEXT DEFAULT 'eur',
      paid_at TIMESTAMP,
      payment_error TEXT,
      event_id TEXT,
      event_name TEXT,
      reservation_requested BOOLEAN NOT NULL DEFAULT FALSE,
      reservation_time TIMESTAMP,
      status TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
      items JSONB NOT NULL
    );

ALTER TABLE orders ADD COLUMN IF NOT EXISTS quantity_applied BOOLEAN;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_provider TEXT;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS amount_cents INTEGER;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'eur';

ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_error TEXT;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS event_id TEXT;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS event_name TEXT;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS reservation_requested BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS reservation_time TIMESTAMP;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS cash_received_cents INTEGER;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS change_given_cents INTEGER;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS pos_cash_key TEXT;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS pos_cash_fingerprint TEXT;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS pos_cash_state TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS orders_pos_cash_key_unique ON orders (pos_cash_key) WHERE pos_cash_key IS NOT NULL;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS pos_card_key TEXT;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS pos_card_fingerprint TEXT;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS pos_card_state TEXT;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS pos_card_user_id TEXT;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS pos_card_username TEXT;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_pi_started_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS orders_pos_card_key_unique ON orders (pos_card_key) WHERE pos_card_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS menu_item_settings (
      item_id TEXT PRIMARY KEY,
      price NUMERIC(10,2) NOT NULL,
      visible BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

CREATE TABLE IF NOT EXISTS event_menu_item_settings (
	      event_id TEXT NOT NULL,
	      item_id TEXT NOT NULL,
	      price NUMERIC(10,2) NOT NULL,
	      visible BOOLEAN NOT NULL DEFAULT TRUE,
	      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	      PRIMARY KEY (event_id, item_id)
	    );

CREATE TABLE IF NOT EXISTS app_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

CREATE TABLE IF NOT EXISTS custom_menu_items (
      item_id TEXT PRIMARY KEY,
      section_id TEXT NOT NULL,
      name_de TEXT NOT NULL,
      name_fr TEXT NOT NULL,
      name_en TEXT NOT NULL,
      desc_de TEXT,
      desc_fr TEXT,
      desc_en TEXT,
      price NUMERIC(10,2) NOT NULL,
      visible BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

CREATE TABLE IF NOT EXISTS terminal_active_orders (
      username TEXT PRIMARY KEY,
      user_id TEXT,
      event_name TEXT NOT NULL,
      order_id TEXT NOT NULL,
      payment_intent_id TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

CREATE TABLE IF NOT EXISTS cashier_event_locks (
  event_name TEXT PRIMARY KEY, user_id TEXT NOT NULL, username TEXT NOT NULL,
  heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ NOT NULL
);

COMMIT;
