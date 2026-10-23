import { sql } from "@/lib/db";
import { cashierLeaseGuard, type CashierLease } from "@/lib/cashier-locks";
import { cashRegisterActor } from "@/lib/staff-action-server";
import { staffSessionHash, StaffAuthError } from "@/lib/staff-session-server";
export type CashierWriteContext = CashierLease & { workstationName: string };
export async function requireCashierWrite(req: Request, eventId?: string, workstationId?: unknown): Promise<CashierWriteContext> {
  const actor = await cashRegisterActor(req, eventId);
  const instanceId = req.headers.get("x-cashier-instance-id") || "";
  if (!actor.cashierEventId || !actor.workstationId || actor.workstationType !== "cashier") throw new StaffAuthError("workstation_assignment_required", 403);
  if (!/^[a-f0-9-]{36}$/.test(instanceId)) throw new StaffAuthError("cashier_lease_required", 423);
  if ((workstationId !== undefined && workstationId !== actor.workstationId) || (req.headers.has("x-workstation-id") && req.headers.get("x-workstation-id") !== actor.workstationId)) throw new StaffAuthError("workstation_context_mismatch", 403);
  const context = { eventId: actor.cashierEventId, workstationId: actor.workstationId, workstationName: actor.workstationName || "", userId: actor.id, username: actor.username, sessionHash: staffSessionHash(req), instanceId };
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
