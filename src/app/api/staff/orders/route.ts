import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireStaffWorkstation, StaffAuthError } from "@/lib/staff-session-server";
import { canAccessStaffEvent } from "@/lib/staff-permissions";
import { validateAdminKitchenEvent } from "@/lib/admin-kitchen-context";
export async function GET(req: Request) {
  try {
    const actor = await requireStaffWorkstation(req);
    const params = new URL(req.url).searchParams;
    const adminEvent = actor.role === "admin" || params.has("adminEventId") ? await validateAdminKitchenEvent(actor, params.get("adminEventId")) : null;
    if (adminEvent && params.has("eventId") && params.get("eventId") !== adminEvent.id) throw new StaffAuthError("staff_event_forbidden", 403);
    const eventId = adminEvent?.id || params.get("eventId") || actor.cashierEventId || "";
    if (!canAccessStaffEvent(actor, eventId)) throw new StaffAuthError("staff_event_forbidden", 403);
    const status = params.get("status") || "NEW";
    if (!["NEW", "READY", "IN_PROGRESS", "DONE"].includes(status)) throw new StaffAuthError("invalid_status", 400);
    const rows = await sql`SELECT id, created_at, customer_name, event_id, event_name, payment, amount_cents, currency, paid_at, UPPER(status) AS status, items
      FROM orders WHERE event_id = ${eventId} AND UPPER(status) = ${status} ORDER BY created_at DESC`;
    return NextResponse.json(rows, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof StaffAuthError ? error.code : "staff_orders_unavailable" }, { status: error instanceof StaffAuthError ? error.status : 503 }); }
}
