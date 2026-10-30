import { NextResponse } from "next/server";
import { salesHistoryQuery } from "@/lib/sales-history-server";
import { requireAssignedCashRegister, staffSessionHash, StaffAuthError } from "@/lib/staff-session-server";
import { CASHIER_CONTEXT_HEADER, resolveCashierOperationalContext } from "@/lib/cashier-operational-context";
import { cashierLeaseGuard } from "@/lib/cashier-locks";

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
    const temporary = req.headers.has(CASHIER_CONTEXT_HEADER);
    let workstationId: string | null = null;
    if (temporary) {
      // Read-only access uses the real Admin, exact Phase 6 context and live V3
      // owner. An invalid explicit context never falls back to an assignment.
      const context = await resolveCashierOperationalContext(req, {
        eventId, workstationId: params.has("workstationId") ? params.get("workstationId") : undefined,
      });
      if (!context.contextId || !context.instanceId) throw new StaffAuthError("cashier_context_invalid", 403);
      try {
        await cashierLeaseGuard({ userId: context.actor.id, username: context.actor.username,
          sessionHash: staffSessionHash(req), eventId: context.eventId, workstationId: context.workstation.id,
          contextId: context.contextId, instanceId: context.instanceId });
      } catch { throw new StaffAuthError("cashier_lease_required", 423); }
      workstationId = context.workstation.id;
    } else {
      const actor = await requireAssignedCashRegister(req, eventId);
      workstationId = actor.workstationId!;
      if (params.has("workstationId") && params.get("workstationId") !== workstationId) throw new StaffAuthError("workstation_context_mismatch", 403);
    }
    const rows = await salesHistoryQuery(eventId, workstationId, limit, offset);
    // Presentation capability only. The refund service independently guards creation.
    const orders = rows.slice(0, limit).map(row => ({
      ...row, can_refund: !temporary && process.env.REFUND_CREATE_ENABLED === "1" && row.can_refund === true,
    }));
    return NextResponse.json({ eventId, workstationId, readOnly: temporary, orders, hasMore: rows.length > limit }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof StaffAuthError) return NextResponse.json({ error: error.code }, { status: error.status });
    return NextResponse.json({ error: "Unable to load sales history" }, { status: 500 });
  }
}
