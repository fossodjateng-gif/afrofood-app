import { createHash, randomBytes } from "node:crypto";
import { sql } from "@/lib/db";
import { canAccessStaffEvent, canUseCashRegister, type AuthenticatedStaff } from "@/lib/staff-permissions";

export const STAFF_COOKIE = "af_staff_session";
export const SESSION_SECONDS = 2 * 60 * 60;
export class StaffAuthError extends Error {
  constructor(public code: string, public status = 401) { super(code); }
}
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export function requireStaffOrigin(req: Request) {
  const url = new URL(req.url);
  const configured = process.env.STAFF_AUTH_ORIGIN;
  const local = process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(url.hostname);
  const expected = configured || (local ? url.origin : "");
  if (!expected || req.headers.get("origin") !== expected || req.headers.get("sec-fetch-site") === "cross-site") throw new StaffAuthError("invalid_origin", 403);
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
    SELECT u.id, u.username, u.role, u.active, u.cashier_event_id
    FROM staff_sessions s JOIN staff_users u ON u.id = s.user_id
    WHERE s.token_hash = ${tokenHash(token)} AND s.revoked_at IS NULL
      AND s.expires_at > NOW() AND u.active = TRUE
    LIMIT 1
  `;
  const row = rows[0];
  if (!row || !["admin", "cashier", "kitchen"].includes(String(row.role))) throw new StaffAuthError("session_required");
  return { id: String(row.id), username: String(row.username), role: row.role as AuthenticatedStaff["role"], active: true, cashierEventId: row.cashier_event_id ? String(row.cashier_event_id) : null };
}

export async function requireCashRegisterPermission(req: Request, eventId?: string) {
  const user = await requireStaffSession(req);
  if (!canUseCashRegister(user) || (eventId !== undefined && !canAccessStaffEvent(user, eventId))) throw new StaffAuthError("cash_register_forbidden", 403);
  return user;
}

export async function revokeStaffSession(req: Request) {
  const token = cookieToken(req);
  if (token) await sql`UPDATE staff_sessions SET revoked_at = COALESCE(revoked_at, NOW()) WHERE token_hash = ${tokenHash(token)}`;
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
