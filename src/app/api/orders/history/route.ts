import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireAssignedCashRegister, StaffAuthError } from "@/lib/staff-session-server";

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
    await requireAssignedCashRegister(req, eventId);
    const rows = await sql`
      SELECT id, created_at, customer_name, event_id, event_name, created_by, created_by_username, register_id, register_name, paid_by, paid_by_username, paid_register_id, paid_register_name,
        reservation_requested, reservation_time, payment, amount_cents,
        cash_received_cents, change_given_cents, currency, paid_at,
        UPPER(status) AS status, items,
        (payment = 'card' AND payment_provider = 'stripe' AND paid_at IS NOT NULL
          AND stripe_payment_intent_id IS NOT NULL AND amount_cents > 0 AND currency = 'eur'
          AND NOT EXISTS (SELECT 1 FROM order_refunds r WHERE r.order_id = orders.id)) AS can_refund,
        (SELECT jsonb_build_object('state', r.refund_state, 'amountCents', r.refund_amount_cents,
          'currency', r.currency, 'refundedAt', r.refunded_at)
          FROM order_refunds r WHERE r.order_id = orders.id) AS refund
      FROM orders
      WHERE event_id = ${eventId}
        AND UPPER(status) IN ('NEW', 'IN_PROGRESS', 'READY', 'DONE')
      ORDER BY created_at DESC, id DESC
      LIMIT ${limit + 1} OFFSET ${offset}
    `;
    return NextResponse.json({ eventId, orders: rows.slice(0, limit), hasMore: rows.length > limit }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof StaffAuthError) return NextResponse.json({ error: error.code }, { status: error.status });
    return NextResponse.json({ error: "Unable to load sales history" }, { status: 500 });
  }
}
