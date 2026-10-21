BEGIN;
CREATE TABLE IF NOT EXISTS staff_users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE CHECK (username = lower(trim(username)) AND length(username) BETWEEN 1 AND 80),
  password_hash TEXT NOT NULL CHECK (password_hash LIKE 'scrypt-v1:%'),
  role TEXT NOT NULL CHECK (role IN ('cashier', 'admin', 'kitchen')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  cashier_event_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS staff_sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES staff_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ NOT NULL, revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS staff_sessions_user_idx ON staff_sessions(user_id);
CREATE TABLE IF NOT EXISTS staff_login_limits (
  bucket TEXT NOT NULL, window_start TIMESTAMPTZ NOT NULL, attempts INTEGER NOT NULL,
  PRIMARY KEY (bucket, window_start)
);
CREATE TABLE IF NOT EXISTS order_refunds (
  order_id TEXT PRIMARY KEY REFERENCES orders(id), refund_key TEXT NOT NULL UNIQUE,
  stripe_payment_intent_id TEXT NOT NULL UNIQUE,
  refund_amount_cents INTEGER NOT NULL CHECK (refund_amount_cents > 0), currency TEXT NOT NULL,
  refund_state TEXT NOT NULL CHECK (refund_state IN ('requested','processing','refunded','requires_review')),
  stripe_refund_id TEXT UNIQUE,
  refund_requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  requested_by TEXT NOT NULL REFERENCES staff_users(id), refunded_at TIMESTAMPTZ,
  refund_error TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Append-only attribution for migrated cashier API requests; no sale logic.
CREATE TABLE IF NOT EXISTS staff_action_audit (
  id BIGSERIAL PRIMARY KEY, actor_user_id TEXT NOT NULL REFERENCES staff_users(id),
  action TEXT NOT NULL, order_id TEXT, event_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_by TEXT REFERENCES staff_users(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_by_username TEXT;
COMMIT;
