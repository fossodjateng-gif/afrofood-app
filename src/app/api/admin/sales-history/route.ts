import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireStaffSession, StaffAuthError } from "@/lib/staff-session-server";
import { getWorkstations } from "@/lib/workstations-server";
import { WORKSTATION_ID } from "@/lib/workstations";
import { CONFIRMED_SALE_STATUSES, salesHistoryEvents, salesHistoryQuery } from "@/lib/sales-history-server";

// Reporting uses the real ADMIN session only. No temporary context, lease,
// operational assignment, DDL, payment reconciliation or refund authorization.
export async function GET(req: Request) {
  try {
    const actor = await requireStaffSession(req);
    if (actor.role !== "admin") throw new StaffAuthError("admin_required", 403);
    const params = new URL(req.url).searchParams;
    const eventId = (params.get("eventId") || "").trim();
    const workstationId = params.get("workstationId") || null;
    const limit = Number(params.get("limit") ?? 50), offset = Number(params.get("offset") ?? 0);
    if (!eventId || !Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0) throw new StaffAuthError("invalid_history_filter", 400);
    if (!(await salesHistoryEvents()).some(event => event.id === eventId)) throw new StaffAuthError("invalid_staff_event", 400);
    if (params.has("workstationId")) {
      if (!workstationId || !WORKSTATION_ID.test(workstationId)) throw new StaffAuthError("invalid_register", 400);
      const stations = await getWorkstations(eventId);
      // Inactive registers remain valid historical filters.
      if (!stations.cashier.some(station => station.id === workstationId && station.type === "cashier")) throw new StaffAuthError("register_event_mismatch", 403);
    }
    const [rows, totals] = await sql.transaction([
      salesHistoryQuery(eventId, workstationId, limit, offset),
      sql`SELECT to_char((COALESCE(paid_at, created_at) AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD') AS day,
          COALESCE(currency, 'eur') AS currency, COUNT(*) AS count,
          CASE WHEN COUNT(amount_cents) = COUNT(*) THEN SUM(amount_cents) ELSE NULL END AS total_cents
        FROM orders WHERE event_id = ${eventId}
          AND (${workstationId}::text IS NULL OR paid_register_id = ${workstationId})
          AND UPPER(status) = ANY(${CONFIRMED_SALE_STATUSES}::text[])
        GROUP BY 1, 2 ORDER BY 1 DESC, 2`,
    ], { readOnly: true, isolationLevel: "RepeatableRead" });
    return NextResponse.json({ eventId, workstationId, readOnly: true, hasMore: rows.length > limit,
      orders: rows.slice(0, limit).map(row => ({ ...row, can_refund: false })),
      dailyTotals: totals.map(row => ({ day: String(row.day), currency: String(row.currency), count: Number(row.count),
        totalCents: row.total_cents !== null && Number.isSafeInteger(Number(row.total_cents)) ? Number(row.total_cents) : null })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof StaffAuthError ? error.code : "admin_history_unavailable" }, {
      status: error instanceof StaffAuthError ? error.status : 503, headers: { "Cache-Control": "no-store" },
    });
  }
}
