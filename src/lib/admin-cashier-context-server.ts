import { randomBytes } from "node:crypto";
import { sql } from "@/lib/db";
import { requireStaffSession, requireStaffOrigin, staffSessionHash, StaffAuthError } from "@/lib/staff-session-server";
import { prepareCashierContextLifetime } from "@/lib/cashier-operational-context";
import { WORKSTATION_ID } from "@/lib/workstations";

type OpeningIntent = { eventId?: unknown; workstationId?: unknown; instanceId?: unknown };
const CONTEXT_ID = /^[a-f0-9]{64}$/;

async function adminSession(req: Request) {
  requireStaffOrigin(req);
  const actor = await requireStaffSession(req);
  if (!actor.active || actor.role !== "admin") throw new StaffAuthError("admin_required", 403);
  if (req.headers.has("x-staff-user-id") && req.headers.get("x-staff-user-id") !== actor.id) throw new StaffAuthError("cashier_changed", 409);
  return { actor, sessionHash: staffSessionHash(req) };
}
function failure(error: unknown): never {
  if (error instanceof StaffAuthError) throw error;
  const code = error instanceof Error ? error.message : "";
  const status = ({ admin_required: 403, cashier_context_invalid: 403, cashier_context_event_invalid: 403,
    workstation_assignment_invalid: 403, cashier_locked: 423, cashier_context_instance_conflict: 409,
    cashier_lease_required: 423 } as Record<string, number>)[code];
  throw new StaffAuthError(status ? code : "cashier_context_unavailable", status || 503);
}
export async function openAdminCashierContext(req: Request, intent: OpeningIntent) {
  try {
    const { actor, sessionHash } = await adminSession(req);
    if (!intent || typeof intent !== "object") throw new StaffAuthError("invalid_cashier_context_intent", 400);
    const { eventId, workstationId, instanceId } = intent;
    if (typeof eventId !== "string" || !eventId.trim() || typeof workstationId !== "string" || !WORKSTATION_ID.test(workstationId) ||
      typeof instanceId !== "string" || !/^[a-f0-9-]{36}$/.test(instanceId)) throw new StaffAuthError("invalid_cashier_context_intent", 400);
    const rows = await sql`SELECT expires_at FROM staff_sessions WHERE token_hash = ${sessionHash}
      AND user_id = ${actor.id} AND revoked_at IS NULL AND expires_at > clock_timestamp() LIMIT 1`;
    if (!rows[0]) throw new StaffAuthError("session_required");
    const sessionExpiry = new Date(rows[0].expires_at);
    const lifetime = prepareCashierContextLifetime(sessionExpiry, sessionExpiry);
    const contextId = randomBytes(32).toString("hex");
    // This single SQL function performs validation, replacement and V3 acquire
    // in one DB transaction. There is no separate success-before-acquire step.
    const result = await sql`SELECT * FROM af_open_admin_cashier_context(${sessionHash}, ${actor.id}, ${contextId},
      ${eventId}, ${workstationId}, ${instanceId}, ${lifetime.expiresAt.toISOString()}::timestamptz)`;
    const row = result[0];
    if (!row || row.context_id !== contextId) throw new StaffAuthError("cashier_context_unavailable", 503);
    return { contextId, eventId: row.event_id as string, workstationId: row.workstation_id as string,
      instanceId: row.instance_id as string, createdAt: new Date(row.created_at).toISOString(), expiresAt: new Date(row.expires_at).toISOString() };
  } catch (error) { failure(error); }
}
export async function closeAdminCashierContext(req: Request, contextId: unknown) {
  try {
    const { actor, sessionHash } = await adminSession(req);
    if (typeof contextId !== "string" || !CONTEXT_ID.test(contextId)) throw new StaffAuthError("cashier_context_invalid", 403);
    const rows = await sql`SELECT af_close_admin_cashier_context(${sessionHash}, ${actor.id}, ${contextId}) AS closed`;
    return { closed: rows[0]?.closed === true };
  } catch (error) { failure(error); }
}
