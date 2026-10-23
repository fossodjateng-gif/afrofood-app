import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { verifyStaffPassword } from "@/lib/staff-password";
import { assignedWorkstation } from "@/lib/workstations-server";
import { allowStaffLogin, createStaffSession, requireStaffOrigin, requireStaffWorkstation, revokeStaffSession, staffCookie, StaffAuthError } from "@/lib/staff-session-server";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
function failure(error: unknown) {
  return NextResponse.json({ ok: false, error: error instanceof StaffAuthError ? error.code : "session_unavailable" }, { status: error instanceof StaffAuthError ? error.status : 503, headers });
}
export async function GET(req: Request) {
  try { return NextResponse.json({ ok: true, user: await requireStaffWorkstation(req) }, { headers }); }
  catch (error) { return failure(error); }
}
export async function POST(req: Request) {
  try {
    requireStaffOrigin(req);
    const body = await req.json();
    const username = String(body.username || "").trim().toLowerCase();
    const password = typeof body.password === "string" ? body.password : "";
    if (!username || username.length > 80 || !password || password.length > 256) throw new StaffAuthError("invalid_credentials");
    if (!await allowStaffLogin(username)) throw new StaffAuthError("login_rate_limited", 429);
    const rows = await sql`SELECT id, username, password_hash, role, active, cashier_event_id, workstation_id FROM staff_users WHERE username = ${username} LIMIT 1`;
    const row = rows[0];
    // Perform the same expensive derivation for an unknown username.
    const hash = row?.password_hash ? String(row.password_hash) : `scrypt-v1:${"0".repeat(32)}:${"0".repeat(128)}`;
    const valid = await verifyStaffPassword(password, hash);
    if (!row?.active || !valid || !["admin", "cashier", "kitchen"].includes(String(row.role))) throw new StaffAuthError("invalid_credentials");
    if (row.role !== "admin") {
      try { await assignedWorkstation(String(row.role), row.cashier_event_id || null, row.workstation_id || null); }
      catch { throw new StaffAuthError("workstation_assignment_invalid", 403); }
    }
    const cookie = await createStaffSession(req, String(row.id));
    // Resolve the same authoritative assignment as every subsequent request.
    const authenticated = new Request(req.url, { headers: { cookie: cookie.split(";")[0] } });
    return NextResponse.json({ ok: true, user: await requireStaffWorkstation(authenticated) }, { headers: { ...headers, "Set-Cookie": cookie } });
  } catch (error) { return failure(error); }
}
export async function DELETE(req: Request) {
  try {
    requireStaffOrigin(req);
    await revokeStaffSession(req);
    return NextResponse.json({ ok: true }, { headers: { ...headers, "Set-Cookie": staffCookie(req, "", true) } });
  } catch (error) { return failure(error); }
}
