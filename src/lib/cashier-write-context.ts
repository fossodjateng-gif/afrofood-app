import { sql } from "@/lib/db";
import { cashierLeaseGuard, type CashierLease } from "@/lib/cashier-locks";
import { resolveCashierOperationalContext } from "@/lib/cashier-operational-context";
import { requireStaffOrigin, staffSessionHash, StaffAuthError } from "@/lib/staff-session-server";
export type CashierWriteContext = CashierLease & { workstationName: string };
export async function requireCashierWrite(req: Request, eventId?: string, workstationId?: unknown): Promise<CashierWriteContext> {
  requireStaffOrigin(req);
  const resolved = await resolveCashierOperationalContext(req, { eventId, workstationId });
  const actor = resolved.actor;
  const displayedActor = req.headers.get("x-staff-user-id");
  if (displayedActor && displayedActor !== actor.id) throw new StaffAuthError("cashier_changed", 409);
  const instanceId = resolved.instanceId || "";
  if (!/^[a-f0-9-]{36}$/.test(instanceId)) throw new StaffAuthError("cashier_lease_required", 423);
  const context: CashierWriteContext = { eventId: resolved.eventId, workstationId: resolved.workstation.id,
    workstationName: resolved.workstation.name, userId: actor.id, username: actor.username,
    sessionHash: staffSessionHash(req), instanceId, contextId: resolved.contextId };
  try { await cashierLeaseGuard(context); } catch { throw new StaffAuthError("cashier_lease_required", 423); }
  return context;
}
export async function reserveCardCashier(orderId: string, context: CashierWriteContext) {
  const result = await sql.transaction([
    cashierLeaseGuard(context),
    sql`UPDATE orders SET paid_by = COALESCE(paid_by, ${context.userId}),
      paid_by_username = CASE WHEN paid_by IS NULL THEN ${context.username} ELSE paid_by_username END,
      paid_register_id = CASE WHEN paid_by IS NULL THEN ${context.workstationId} ELSE paid_register_id END,
      paid_register_name = CASE WHEN paid_by IS NULL THEN ${context.workstationName} ELSE paid_register_name END
      WHERE id = ${orderId} AND event_id = ${context.eventId} AND payment = 'card'
        AND paid_at IS NULL AND UPPER(status) = 'PENDING_PAYMENT'
        AND (paid_by IS NULL OR (paid_by = ${context.userId} AND paid_register_id = ${context.workstationId}))
      RETURNING id`,
  ], { isolationLevel: "ReadCommitted" });
  if (!result[1].length) throw new StaffAuthError("payment_cashier_context_mismatch", 409);
}
