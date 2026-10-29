import { retryStaffTransaction } from "@/lib/staff-transaction-retry";
import { randomUUID } from "node:crypto";
import { sql } from "@/lib/db";
import { getStoreConfig } from "@/lib/menu-settings";
import { hashStaffPassword } from "@/lib/staff-password";
import { requireStaffOrigin, requireStaffSession, staffSessionHash, StaffAuthError } from "@/lib/staff-session-server";
import { findWorkstation, parseWorkstations, WORKSTATION_ID, type WorkstationConfig, type WorkstationType } from "@/lib/workstations";
import { getWorkstations } from "@/lib/workstations-server";
import { resolveAutomaticWorkstation, type StaffAssignment } from "@/lib/automatic-workstations";

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
  if (!["admin", "cashier", "kitchen"].includes(role) || typeof body.active !== "boolean") throw new StaffAuthError("invalid_staff_account", 400);
  // A workstation supplied by an old client is never an assignment authority.
  const eventId = role === "admin" ? "" : String(body.eventId || "").trim();
  if (role !== "admin" && !eventId) throw new StaffAuthError("workstation_assignment_required", 400);
  const users = await sql`SELECT id, username, role, active, cashier_event_id, workstation_id FROM staff_users ORDER BY username` as StaffAssignment[];
  const requestedUsername = String(body.username || "").trim().toLowerCase();
  const previous = create ? undefined : users.find(user => body.id ? user.id === String(body.id) : user.username === requestedUsername);
  if (!create && !previous) throw new StaffAuthError("invalid_staff_id", 400);
  if (create && users.some(user => user.username === requestedUsername)) throw new StaffAuthError("account_exists_or_assignment_changed", 409);
  const id = previous?.id ?? randomUUID();
  const username = previous?.username ?? requestedUsername;
  if (id === admin.id && (role !== "admin" || !body.active)) throw new StaffAuthError("cannot_disable_current_admin", 409);
  let passwordHash: string | null = null;
  if (create) {
    if (!username || username.length > 80 || typeof body.password !== "string" || body.password.length < 12 || body.password.length > 256) throw new StaffAuthError("invalid_staff_credentials", 400);
    passwordHash = await hashStaffPassword(body.password);
  }
  const events = (await getStoreConfig()).events;
  if (eventId && !events.some(event => event.id === eventId)) throw new StaffAuthError("invalid_staff_event", 400);
  type Plan = { key: string; expected: unknown; next: WorkstationConfig };
  const plans = new Map<string, Plan>();
  async function configFor(event: string) {
    if (!plans.has(event)) {
      const rows = await sql`SELECT setting_value FROM app_settings WHERE setting_key = ${`workstations:${event}`} LIMIT 1`;
      const expected = rows[0]?.setting_value ?? null;
      plans.set(event, { key: `workstations:${event}`, expected, next: parseWorkstations(structuredClone(expected)) });
    }
    return plans.get(event)!.next;
  }
  // Adopt the assignment being left as well, so the first role/event round trip
  // can return to its original UUID. Never adopt an Admin's legacy assignment.
  if (previous && role !== "admin" && (previous.role === "cashier" || previous.role === "kitchen") &&
    previous.cashier_event_id && previous.workstation_id && events.some(event => event.id === previous.cashier_event_id)) {
    resolveAutomaticWorkstation(await configFor(previous.cashier_event_id), previous, previous.cashier_event_id, previous.role, users, false);
  }
  const identity: StaffAssignment = previous ?? { id, username, role, active: body.active, cashier_event_id: null, workstation_id: null };
  const station = role === "admin" ? null : resolveAutomaticWorkstation(await configFor(eventId), identity, eventId, role as WorkstationType, users, true);
  const stationId = station?.id ?? null;
  const serializedPlans = JSON.stringify([...plans.values()]);
  // All mutations share one gate and one statement. SERIALIZABLE protects the
  // absence checks too (new event config, owner, peer assignment, username).
  // A stale snapshot writes nothing; a uniqueness/serialization error rolls
  // back configs, user, revocations and leases together. No advisory lock/DDL.
  const savedUser = create
    ? sql`INSERT INTO staff_users (id, username, password_hash, role, active, cashier_event_id, workstation_id)
        SELECT ${id}, ${username}, ${passwordHash}, ${role}, ${body.active}, ${eventId || null}, ${stationId}
        FROM verified WHERE (SELECT count(*) FROM saved_configs) = (SELECT count(*) FROM plans) RETURNING id`
    : sql`UPDATE staff_users SET role = ${role}, active = ${body.active}, cashier_event_id = ${eventId || null}, workstation_id = ${stationId}, updated_at = NOW()
        WHERE id = ${id} AND EXISTS (SELECT 1 FROM verified)
          AND (SELECT count(*) FROM saved_configs) = (SELECT count(*) FROM plans) RETURNING id`;
  try {
    const results = await retryStaffTransaction(() => sql.transaction([
      adminGuard(req, admin.id),
      sql`WITH plans AS MATERIALIZED (
        SELECT * FROM jsonb_to_recordset(${serializedPlans}::jsonb) AS p(key text, expected jsonb, next jsonb)
      ), checked AS MATERIALIZED (
        SELECT 1 WHERE
          (${create} AND NOT EXISTS (SELECT 1 FROM staff_users WHERE username = ${username}))
          OR (NOT ${create} AND EXISTS (SELECT 1 FROM staff_users u WHERE u.id = ${id}
            AND jsonb_build_object('id', u.id, 'username', u.username, 'role', u.role, 'active', u.active,
              'cashier_event_id', u.cashier_event_id, 'workstation_id', u.workstation_id) = ${JSON.stringify(previous ?? null)}::jsonb))
      ), verified AS MATERIALIZED (
        SELECT * FROM checked WHERE NOT EXISTS (
          SELECT 1 FROM plans p WHERE (SELECT setting_value FROM app_settings WHERE setting_key = p.key) IS DISTINCT FROM p.expected
        ) AND (${!eventId} OR EXISTS (SELECT 1 FROM app_settings a, jsonb_array_elements(a.setting_value->'events') e
          WHERE a.setting_key = 'store_config' AND e->>'id' = ${eventId}))
        AND NOT EXISTS (SELECT 1 FROM plans p, jsonb_array_elements((p.next->'cashier') || (p.next->'kitchen')) w
          JOIN staff_users peer ON peer.workstation_id = w->>'id'
          WHERE w->>'ownerUserId' = ${id} AND peer.id <> ${id}
            AND peer.cashier_event_id = substring(p.key from 14))
      ), saved_configs AS (
        INSERT INTO app_settings (setting_key, setting_value, updated_at)
          SELECT p.key, p.next, NOW() FROM plans p CROSS JOIN verified ORDER BY p.key
        ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()
        RETURNING setting_key
      ), saved_user AS (${savedUser}), revoked AS (
        UPDATE staff_sessions SET revoked_at = COALESCE(revoked_at, NOW())
          WHERE user_id IN (SELECT id FROM saved_user) AND NOT ${create} RETURNING token_hash
      ), released AS (
        DELETE FROM cashier_event_locks WHERE split_part(user_id, ':', 2) IN
          (SELECT token_hash FROM staff_sessions WHERE user_id IN (SELECT id FROM saved_user))
          AND NOT ${create} RETURNING event_name
      ) SELECT id FROM saved_user`,
    ], { isolationLevel: "Serializable" }));
    if (!results[1].length) throw new StaffAuthError("staff_assignment_changed_reload", 409);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && ["23505", "40001", "40P01"].includes(String(error.code))) {
      throw new StaffAuthError("staff_assignment_changed_reload", 409);
    }
    throw error;
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
  const next = { ...existing, id, name, type, active: body.active };
  config[type] = create ? [...config[type], next] : config[type].map(station => station.id === id ? next : station);
  const results = await retryStaffTransaction(() => sql.transaction([
    adminGuard(req, admin.id),
    sql`INSERT INTO app_settings (setting_key, setting_value, updated_at)
      VALUES (${`workstations:${eventId}`}, ${JSON.stringify(config)}::jsonb, NOW())
      ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()
      WHERE app_settings.setting_value = ${previous}::jsonb RETURNING setting_key`,
    sql`UPDATE staff_sessions SET revoked_at = COALESCE(revoked_at, NOW())
      WHERE ${!body.active} AND user_id IN (SELECT id FROM staff_users WHERE cashier_event_id = ${eventId} AND workstation_id = ${id})`,
    sql`DELETE FROM cashier_event_locks WHERE ${!body.active} AND split_part(user_id, ':', 2) IN
      (SELECT token_hash FROM staff_sessions WHERE user_id IN (SELECT id FROM staff_users WHERE cashier_event_id = ${eventId} AND workstation_id = ${id}))`,
  ], { isolationLevel: "ReadCommitted" }));
  if (!results[1].length) throw new StaffAuthError("workstations_changed_reload", 409);
}
