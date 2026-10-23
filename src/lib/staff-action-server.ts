import { sql } from "@/lib/db";
import { requireAssignedCashRegister, requireStaffOrigin, StaffAuthError } from "@/lib/staff-session-server";

export async function cashRegisterActor(req: Request, eventId?: string) {
  requireStaffOrigin(req);
  const user = await requireAssignedCashRegister(req, eventId);
  const displayedActor = req.headers.get("x-staff-user-id");
  // This header can only restrict access (stale tab after cashier switch).
  if (displayedActor && displayedActor !== user.id) throw new StaffAuthError("cashier_changed", 409);
  return user;
}
export async function recordCashRegisterRequest(actorId: string, action: string, eventId: string, orderId: string | null) {
  await sql`INSERT INTO staff_action_audit (actor_user_id, action, event_id, order_id)
    VALUES (${actorId}, ${action}, ${eventId}, ${orderId})`;
}
