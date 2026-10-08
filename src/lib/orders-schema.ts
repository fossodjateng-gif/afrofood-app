import { sql } from "@/lib/db";

export async function ensureOrdersSchema() {
  await sql`
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
  `;

  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_provider TEXT;`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS amount_cents INTEGER;`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'eur';`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP;`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_error TEXT;`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS event_id TEXT;`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS event_name TEXT;`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS reservation_requested BOOLEAN NOT NULL DEFAULT FALSE;`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS reservation_time TIMESTAMP;`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS cash_received_cents INTEGER;`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS change_given_cents INTEGER;`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS pos_cash_key TEXT;`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS pos_cash_fingerprint TEXT;`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS pos_cash_state TEXT;`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS orders_pos_cash_key_unique ON orders (pos_cash_key) WHERE pos_cash_key IS NOT NULL;`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS pos_card_key TEXT;`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS pos_card_fingerprint TEXT;`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS pos_card_state TEXT;`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS pos_card_user_id TEXT;`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS pos_card_username TEXT;`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_pi_started_at TIMESTAMPTZ;`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS orders_pos_card_key_unique ON orders (pos_card_key) WHERE pos_card_key IS NOT NULL;`;
}
