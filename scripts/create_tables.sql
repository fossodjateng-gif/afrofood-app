CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  customer_name TEXT NULL,
  payment TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'NEW',
  items JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS orders_status_idx 
ON orders(status);

CREATE INDEX IF NOT EXISTS orders_created_at_idx 
ON orders(created_at DESC);