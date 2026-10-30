import { NextResponse } from "next/server";
import { requireStaffSession, StaffAuthError } from "@/lib/staff-session-server";
import { salesHistoryEvents } from "@/lib/sales-history-server";
import { getWorkstations } from "@/lib/workstations-server";

export async function GET(req: Request) {
  try {
    const actor = await requireStaffSession(req);
    if (actor.role !== "admin") throw new StaffAuthError("admin_required", 403);
    const events = await salesHistoryEvents();
    const entries = await Promise.all(events.map(async event => [event.id, await getWorkstations(event.id)]));
    return NextResponse.json({ ok: true, events, workstations: Object.fromEntries(entries) }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof StaffAuthError ? error.code : "admin_history_unavailable" }, {
      status: error instanceof StaffAuthError ? error.status : 503, headers: { "Cache-Control": "no-store" },
    });
  }
}
