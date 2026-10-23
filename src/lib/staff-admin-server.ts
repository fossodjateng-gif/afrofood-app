import { randomUUID } from "node:crypto";
import { sql } from "@/lib/db";
import { getStoreConfig } from "@/lib/menu-settings";
import { hashStaffPassword } from "@/lib/staff-password";
import { requireStaffOrigin, requireStaffSession, staffSessionHash, StaffAuthError } from "@/lib/staff-session-server";
import { findWorkstation, WORKSTATION_ID, type WorkstationType } from "@/lib/workstations";
import { getWorkstations } from "@/lib/workstations-server";

export async function requireStaffAdmin(req: Request, mutation = false) {
  if (mutation) requireStaffOrigin(req);
  const user = await requireStaffSession(req);
  if (user.role !== "admin") throw new StaffAuthError("admin_required", 403);
  return user;
}
function adminGuard(req: Request, id: string) {
  return sql`SELECT af_assert_staff_admin(${staffSessionHash(req)}, ${id})`;
}
export async function listStaff(req: Request) {
  await requireStaffAdmin(req);
  return sql`SELECT id, username, role, active, cashier_event_id, workstation_id FROM staff_users ORDER BY username`;
}
export async function saveStaff(req: Request, body: Record<string, unknown>, create: boolean) {
  const admin = await requireStaffAdmin(req, true);
  const role = String(body.role || "");
  const eventId = String(body.eventId || "").trim();
  const stationId = String(body.workstationId || "").trim();
  if (!["admin", "cashier", "kitchen"].includes(role) || typeof body.active !== "boolean") throw new StaffAuthError("invalid_staff_account", 400);
  if (role !== "admin" && (!eventId || !stationId)) throw new StaffAuthError("workstation_assignment_required", 400);
  if ((eventId || stationId) && (!eventId || !stationId)) throw new StaffAuthError("incomplete_assignment", 400);
  if (eventId && !(await getStoreConfig()).events.some(event => event.id === eventId)) throw new StaffAuthError("invalid_staff_event", 400);
  const config = eventId ? await getWorkstations(eventId) : null;
  if (config) {
    const station = findWorkstation(config, stationId);
    if (!station?.active || (role !== "admin" && station.type !== role)) throw new StaffAuthError("workstation_assignment_invalid", 400);
  }
  const id = create ? randomUUID() : String(body.id || "");
  if (!id) throw new StaffAuthError("invalid_staff_id", 400);
  if (id === admin.id && (role !== "admin" || !body.active)) throw new StaffAuthError("cannot_disable_current_admin", 409);
  const expected = JSON.stringify(config);
  const assignmentLock = sql`SELECT setting_value FROM app_settings WHERE setting_key = ${`workstations:${eventId}`} FOR SHARE`;
  if (create) {
    const username = String(body.username || "").trim().toLowerCase();
    if (!username || username.length > 80 || typeof body.password !== "string" || body.password.length < 12 || body.password.length > 256) throw new StaffAuthError("invalid_staff_credentials", 400);
    const passwordHash = await hashStaffPassword(body.password);
    const results = await sql.transaction([
      adminGuard(req, admin.id), assignmentLock,
      sql`INSERT INTO staff_users (id, username, password_hash, role, active, cashier_event_id, workstation_id)
        SELECT ${id}, ${username}, ${passwordHash}, ${role}, ${body.active}, ${eventId || null}, ${stationId || null}
        WHERE ${!eventId} OR EXISTS (SELECT 1 FROM app_settings WHERE setting_key = ${`workstations:${eventId}`} AND setting_value = ${expected}::jsonb)
        ON CONFLICT (username) DO NOTHING RETURNING id`,
    ], { isolationLevel: "ReadCommitted" });
    if (!results[2].length) throw new StaffAuthError("account_exists_or_assignment_changed", 409);
  } else {
    const results = await sql.transaction([
      adminGuard(req, admin.id), assignmentLock,
      sql`UPDATE staff_users SET role = ${role}, active = ${body.active}, cashier_event_id = ${eventId || null}, workstation_id = ${stationId || null}, updated_at = NOW()
        WHERE id = ${id} AND (${!eventId} OR EXISTS (SELECT 1 FROM app_settings WHERE setting_key = ${`workstations:${eventId}`} AND setting_value = ${expected}::jsonb)) RETURNING id`,
      sql`UPDATE staff_sessions SET revoked_at = COALESCE(revoked_at, NOW()) WHERE user_id = ${id}`,
      sql`DELETE FROM cashier_event_locks WHERE split_part(user_id, ':', 2) IN (SELECT token_hash FROM staff_sessions WHERE user_id = ${id})`,
    ], { isolationLevel: "ReadCommitted" });
    if (!results[2].length) throw new StaffAuthError("account_missing_or_assignment_changed", 409);
  }
}
export async function saveWorkstation(req: Request, body: Record<string, unknown>, create: boolean) {
  const admin = await requireStaffAdmin(req, true);
  const eventId = String(body.eventId || "");
  if (!(await getStoreConfig()).events.some(event => event.id === eventId)) throw new StaffAuthError("invalid_staff_event", 400);
  const config = await getWorkstations(eventId);
  const previous = JSON.stringify(config);
  const name = String(body.name || "").trim();
  const type = String(body.type || "") as WorkstationType;
  const id = create ? randomUUID() : String(body.id || "");
  if (!name || name.length > 100 || !["cashier", "kitchen"].includes(type) || !WORKSTATION_ID.test(id) || typeof body.active !== "boolean") throw new StaffAuthError("invalid_workstation", 400);
  const existing = findWorkstation(config, id);
  if (!create && (!existing || existing.type !== type)) throw new StaffAuthError("workstation_type_immutable", 400);
  const next = { id, name, type, active: body.active };
  config[type] = create ? [...config[type], next] : config[type].map(station => station.id === id ? next : station);
  const results = await sql.transaction([
    adminGuard(req, admin.id),
    sql`INSERT INTO app_settings (setting_key, setting_value, updated_at)
      VALUES (${`workstations:${eventId}`}, ${JSON.stringify(config)}::jsonb, NOW())
      ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()
      WHERE app_settings.setting_value = ${previous}::jsonb RETURNING setting_key`,
    sql`UPDATE staff_sessions SET revoked_at = COALESCE(revoked_at, NOW())
      WHERE ${!body.active} AND user_id IN (SELECT id FROM staff_users WHERE cashier_event_id = ${eventId} AND workstation_id = ${id})`,
    sql`DELETE FROM cashier_event_locks WHERE ${!body.active} AND split_part(user_id, ':', 2) IN
      (SELECT token_hash FROM staff_sessions WHERE user_id IN (SELECT id FROM staff_users WHERE cashier_event_id = ${eventId} AND workstation_id = ${id}))`,
  ], { isolationLevel: "ReadCommitted" });
  if (!results[1].length) throw new StaffAuthError("workstations_changed_reload", 409);
}
