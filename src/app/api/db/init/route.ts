import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET() {
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

  return NextResponse.json({ ok: true, message: "orders table ready" });
}
