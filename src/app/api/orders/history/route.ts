import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const eventId = String(params.get("eventId") || "").trim();
  if (!eventId) return NextResponse.json({ error: "eventId is required" }, { status: 400 });
  const limit = Number(params.get("limit") ?? 50);
  const offset = Number(params.get("offset") ?? 0);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0) {
    return NextResponse.json({ error: "Invalid pagination" }, { status: 400 });
  }
  try {
    const rows = await sql`
      SELECT id, created_at, customer_name, event_id, event_name,
        reservation_requested, reservation_time, payment, amount_cents,
        cash_received_cents, change_given_cents, currency, paid_at,
        UPPER(status) AS status, items
      FROM orders
      WHERE event_id = ${eventId}
        AND UPPER(status) IN ('NEW', 'IN_PROGRESS', 'READY', 'DONE')
      ORDER BY created_at DESC, id DESC
      LIMIT ${limit + 1} OFFSET ${offset}
    `;
    return NextResponse.json({ eventId, orders: rows.slice(0, limit), hasMore: rows.length > limit }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Unable to load sales history" }, { status: 500 });
  }
}
