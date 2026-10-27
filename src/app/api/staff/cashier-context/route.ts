import { NextResponse } from "next/server";
import { openAdminCashierContext, closeAdminCashierContext } from "@/lib/admin-cashier-context-server";
import { CASHIER_CONTEXT_HEADER, resolveCashierOperationalContext } from "@/lib/cashier-operational-context";
import { cashierLeaseGuard } from "@/lib/cashier-locks";
import { sql } from "@/lib/db";
import { staffSessionHash, StaffAuthError } from "@/lib/staff-session-server";
export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
function failure(error: unknown) {
  return NextResponse.json({ ok: false, error: error instanceof StaffAuthError ? error.code : "cashier_context_unavailable" },
    { status: error instanceof StaffAuthError ? error.status : 503, headers });
}
export async function POST(req: Request) {
  try { return NextResponse.json({ ok: true, context: await openAdminCashierContext(req, await req.json()) }, { headers }); }
  catch (error) { return failure(error); }
}
export async function DELETE(req: Request) {
  try { const body = await req.json(); return NextResponse.json({ ok: true, ...await closeAdminCashierContext(req, body?.contextId) }, { headers }); }
  catch (error) { return failure(error); }
}

// A reload validates the exact temporary context AND live V3 owner. It cannot
// acquire or revive a lease, nor expose the session hash to the browser.
export async function GET(req: Request) {
  try {
    if (!req.headers.has(CASHIER_CONTEXT_HEADER)) throw new StaffAuthError("cashier_context_invalid", 403);
    const resolved = await resolveCashierOperationalContext(req);
    const write = { userId: resolved.actor.id, username: resolved.actor.username, sessionHash: staffSessionHash(req),
      eventId: resolved.eventId, workstationId: resolved.workstation.id, workstationName: resolved.workstation.name,
      contextId: resolved.contextId, instanceId: resolved.instanceId! };
    try { await cashierLeaseGuard(write); } catch { throw new StaffAuthError("cashier_lease_required", 423); }
    const rows = await sql`SELECT cashier_context_expires_at FROM staff_sessions
      WHERE token_hash = ${staffSessionHash(req)} AND cashier_context_id = ${write.contextId} LIMIT 1`;
    if (!rows[0]) throw new StaffAuthError("cashier_context_invalid", 403);
    return NextResponse.json({ ok: true, context: { userId: write.userId, username: write.username, role: resolved.actor.role,
      eventId: write.eventId, workstationId: write.workstationId, workstationName: write.workstationName,
      contextId: write.contextId, instanceId: write.instanceId, expiresAt: new Date(rows[0].cashier_context_expires_at).toISOString() } }, { headers });
  } catch (error) { return failure(error); }
}
