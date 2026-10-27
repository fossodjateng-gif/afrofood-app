// Server-only operational resolution. The common staff identity is unchanged.
// Resolving a context neither acquires a lease nor authorizes a sale: callers
// must still acquire/validate V3, including its transactional SQL guard.
import { sql } from "@/lib/db";
import { requireAssignedCashRegister, requireStaffSession, staffSessionHash, StaffAuthError } from "@/lib/staff-session-server";
import type { AuthenticatedStaff } from "@/lib/staff-permissions";
import { getWorkstations } from "@/lib/workstations-server";

export const CASHIER_CONTEXT_HEADER = "x-cashier-context-id";
const CONTEXT_ID = /^[a-f0-9]{64}$/;
const INSTANCE_ID = /^[a-f0-9-]{36}$/;

export type CashierOperationalContext = {
  // Real identity and permanent assignment remain untouched, even for Admin.
  actor: AuthenticatedStaff;
  eventId: string;
  workstation: { eventId: string; id: string; name: string; type: "cashier" };
  contextId: string | null;
  instanceId: string | null;
};
type RequestedContext = { eventId?: string; workstationId?: unknown };

export function assertCashierContextMatches(context: CashierOperationalContext, requested: RequestedContext = {}) {
  if (!context.eventId || context.workstation.eventId !== context.eventId ||
      (requested.eventId !== undefined && requested.eventId !== context.eventId)) {
    throw new StaffAuthError("cashier_event_context_mismatch", 403);
  }
  if (requested.workstationId !== undefined && requested.workstationId !== context.workstation.id) {
    throw new StaffAuthError("workstation_context_mismatch", 403);
  }
}

// The future opening endpoint must pass the real server session expiry and an
// explicit requested expiry. No independent/default long-lived duration.
export function prepareCashierContextLifetime(sessionExpiresAt: Date, requestedExpiresAt: Date, now = new Date()) {
  const created = now.getTime();
  const expires = Math.min(sessionExpiresAt.getTime(), requestedExpiresAt.getTime());
  if (!Number.isFinite(created) || !Number.isFinite(expires) || expires <= created) {
    throw new StaffAuthError("invalid_cashier_context_lifetime", 400);
  }
  return { createdAt: new Date(created), expiresAt: new Date(expires) };
}

function timestamp(value: unknown) {
  return value instanceof Date ? value.getTime() : typeof value === "string" && value.length > 0 ? Date.parse(value) : NaN;
}

function checkedContext(req: Request, context: CashierOperationalContext, requested: RequestedContext) {
  assertCashierContextMatches(context, requested);
  if (req.headers.has("x-workstation-id")) {
    assertCashierContextMatches(context, { workstationId: req.headers.get("x-workstation-id") });
  }
  return context;
}

export async function resolveCashierOperationalContext(req: Request, requested: RequestedContext = {}): Promise<CashierOperationalContext> {
  const instanceId = req.headers.get("x-cashier-instance-id");
  // Presence is deliberate: even an empty/invalid explicit ID must fail closed.
  if (!req.headers.has(CASHIER_CONTEXT_HEADER)) {
    const actor = await requireAssignedCashRegister(req);
    if (instanceId !== null && !INSTANCE_ID.test(instanceId)) throw new StaffAuthError("invalid_lock_instance", 400);
    const eventId = actor.cashierEventId!;
    return checkedContext(req, {
      actor, eventId, workstation: { eventId, id: actor.workstationId!, name: actor.workstationName || "", type: "cashier" },
      contextId: null, instanceId,
    }, requested);
  }

  const actor = await requireStaffSession(req);
  if (!actor.active || actor.role !== "admin") throw new StaffAuthError("admin_required", 403);
  const contextId = req.headers.get(CASHIER_CONTEXT_HEADER)!;
  if (!CONTEXT_ID.test(contextId)) throw new StaffAuthError("cashier_context_invalid", 403);
  if (!instanceId || !INSTANCE_ID.test(instanceId)) throw new StaffAuthError("cashier_context_instance_required", 403);
  const rows = await sql`
    SELECT s.cashier_context_id, s.cashier_context_event_id, s.cashier_context_workstation_id,
      s.cashier_context_instance_id, s.cashier_context_created_at, s.cashier_context_expires_at,
      s.expires_at AS session_expires_at
    FROM staff_sessions s JOIN staff_users u ON u.id = s.user_id
    WHERE s.token_hash = ${staffSessionHash(req)} AND s.user_id = ${actor.id}
      AND s.revoked_at IS NULL AND s.expires_at > clock_timestamp()
      AND u.active = TRUE AND u.role = 'admin'
      AND s.cashier_context_id = ${contextId}
      AND s.cashier_context_created_at <= clock_timestamp()
      AND s.cashier_context_expires_at > clock_timestamp()
      AND s.cashier_context_expires_at <= s.expires_at
    LIMIT 1
  `;
  const row = rows[0];
  const created = timestamp(row?.cashier_context_created_at);
  const expires = timestamp(row?.cashier_context_expires_at);
  const sessionExpires = timestamp(row?.session_expires_at);
  const now = Date.now();
  if (!row || row.cashier_context_id !== contextId || row.cashier_context_instance_id !== instanceId ||
      !Number.isFinite(created) || !Number.isFinite(expires) || !Number.isFinite(sessionExpires) ||
      created > now || expires <= now || expires <= created || expires > sessionExpires ||
      typeof row.cashier_context_event_id !== "string" || !row.cashier_context_event_id.trim() ||
      typeof row.cashier_context_workstation_id !== "string" || !row.cashier_context_workstation_id.trim()) {
    throw new StaffAuthError("cashier_context_invalid", 403);
  }
  const eventId = row.cashier_context_event_id;
  const events = await sql`SELECT setting_value FROM app_settings WHERE setting_key = 'store_config' LIMIT 1`;
  if (!Array.isArray(events[0]?.setting_value?.events) ||
      !events[0].setting_value.events.some((event: { id?: unknown }) => event.id === eventId)) {
    throw new StaffAuthError("cashier_context_event_invalid", 403);
  }
  const config = await getWorkstations(eventId);
  const station = config.cashier.find(station => station.id === row.cashier_context_workstation_id);
  if (!station || !station.active || station.type !== "cashier") throw new StaffAuthError("workstation_assignment_invalid", 403);
  return checkedContext(req, {
    actor, eventId, workstation: { eventId, id: station.id, name: station.name, type: "cashier" }, contextId, instanceId,
  }, requested);
}
