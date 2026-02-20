import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET() {
  await sql`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      customer_name TEXT,
      payment TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      items JSONB NOT NULL
    );
  `;

  return NextResponse.json({ ok: true, message: "orders table ready" });
}