import { createHash, randomBytes } from "node:crypto";
import { sql } from "@/lib/db";
import { releaseCashierSessionLocks } from "@/lib/cashier-locks";
import { canAccessStaffEvent, canUseCashRegister, type AuthenticatedStaff } from "@/lib/staff-permissions";
import { assignedWorkstation } from "@/lib/workstations-server";

export const STAFF_COOKIE = "af_staff_session";
export const SESSION_SECONDS = 2 * 60 * 60;
export class StaffAuthError extends Error {
  constructor(public code: string, public status = 401) { super(code); }
}
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export function requireStaffOrigin(req: Request) {
  const url = new URL(req.url);
  const configured = process.env.STAFF_AUTH_ORIGIN;
  const origin = req.headers.get("origin");
  if (!origin || (origin !== configured && origin !== url.origin) || req.headers.get("sec-fetch-site") === "cross-site") throw new StaffAuthError("invalid_origin", 403);
}

function cookieToken(req: Request) {
  const entries = (req.headers.get("cookie") || "").split(";").map(value => value.trim()).filter(value => value.startsWith(`${STAFF_COOKIE}=`));
  if (entries.length !== 1) return "";
  const token = entries[0].slice(STAFF_COOKIE.length + 1);
  return /^[a-f0-9]{64}$/.test(token) ? token : "";
}

export function staffCookie(req: Request, token: string, clear = false) {
  const secure = process.env.NODE_ENV === "production" || new URL(req.url).protocol === "https:";
  return `${STAFF_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${clear ? 0 : SESSION_SECONDS}${secure ? "; Secure" : ""}`;
}

export async function requireStaffSession(req: Request): Promise<AuthenticatedStaff> {
  const token = cookieToken(req);
  if (!token) throw new StaffAuthError("session_required");
  const rows = await sql`
    SELECT u.id, u.username, u.role, u.active, u.cashier_event_id, u.workstation_id
    FROM staff_sessions s JOIN staff_users u ON u.id = s.user_id
    WHERE s.token_hash = ${tokenHash(token)} AND s.revoked_at IS NULL
      AND s.expires_at > NOW() AND u.active = TRUE
    LIMIT 1
  `;
  const row = rows[0];
  if (!row || !["admin", "cashier", "kitchen"].includes(String(row.role))) throw new StaffAuthError("session_required");
  return { id: String(row.id), username: String(row.username), role: row.role as AuthenticatedStaff["role"], active: true,
    cashierEventId: row.cashier_event_id ? String(row.cashier_event_id) : null, workstationId: row.workstation_id ? String(row.workstation_id) : null };

}

// Operational workstation validation is separate from the common identity guard.
// Refund keeps its existing role/event authorization independently of workstation setup.
export async function requireStaffWorkstation(req: Request): Promise<AuthenticatedStaff> {
  const actor = await requireStaffSession(req);
  let station;
  try { station = await assignedWorkstation(actor.role, actor.cashierEventId, actor.workstationId || null); }
  catch { if (actor.role !== "admin") throw new StaffAuthError("workstation_assignment_invalid", 403); station = null; }
  return { ...actor, workstationId: station?.id || null, workstationName: station?.name || null, workstationType: station?.type || null };
}
export async function requireAssignedCashRegister(req: Request, eventId?: string) {
  const actor = await requireStaffWorkstation(req);
  if (!actor.cashierEventId || !actor.workstationId || actor.workstationType !== "cashier") throw new StaffAuthError("workstation_assignment_required", 403);
  if (!canUseCashRegister(actor) || eventId !== undefined && !canAccessStaffEvent(actor, eventId)) throw new StaffAuthError("cash_register_forbidden", 403);
  return actor;
}

// Server-only lease binding; never send this digest to the browser.
export function staffSessionHash(req: Request) {
  const token = cookieToken(req);
  if (!token) throw new StaffAuthError("session_required");
  return tokenHash(token);
}

export async function requireCashRegisterPermission(req: Request, eventId?: string) {
  const user = await requireStaffSession(req);
  if (!canUseCashRegister(user) || (eventId !== undefined && !canAccessStaffEvent(user, eventId))) throw new StaffAuthError("cash_register_forbidden", 403);
  return user;
}

export async function revokeStaffSession(req: Request) {
  const token = cookieToken(req);
  if (token) {
    const hash = tokenHash(token);
    await sql`UPDATE staff_sessions SET revoked_at = COALESCE(revoked_at, NOW()) WHERE token_hash = ${hash}`;
    await releaseCashierSessionLocks(hash);
  }
}

export async function createStaffSession(req: Request, userId: string) {
  // Replacing a cashier on the same browser invalidates the previous session.
  await revokeStaffSession(req);
  const token = randomBytes(32).toString("hex");
  await sql`INSERT INTO staff_sessions (token_hash, user_id, expires_at)
    VALUES (${tokenHash(token)}, ${userId}, NOW() + INTERVAL '2 hours')`;
  return staffCookie(req, token);
}

export async function allowStaffLogin(username: string) {
  // Durable per-account AND global buckets: no per-instance memory limiter.
  for (const [bucket, limit] of [["global", 120], [`user:${tokenHash(username)}`, 8]] as const) {
    const rows = await sql`
      INSERT INTO staff_login_limits (bucket, window_start, attempts)
      VALUES (${bucket}, date_trunc('hour', NOW()) + floor(extract(minute from NOW()) / 15) * INTERVAL '15 minutes', 1)
      ON CONFLICT (bucket, window_start) DO UPDATE SET attempts = staff_login_limits.attempts + 1
      RETURNING attempts
    `;
    const attempts = Number(rows[0]?.attempts);
    if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > limit) return false;
  }
  return true;
}
