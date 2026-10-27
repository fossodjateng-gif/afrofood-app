import { createHash } from "node:crypto";
import { sql } from "@/lib/db";

export type CashierLock = {
  eventId: string;
  username: string;
  heartbeatAt: string;
  expiresAt: string;
};
type LockRow = { username: string; heartbeat_at: string; expires_at: string };
export type CashierLease = {
  eventId: string; userId: string; username: string; sessionHash: string; instanceId: string;
  workstationId: string;
  contextId?: string | null;
};
export type CashierLockResult =
  | { ok: true; lock: CashierLock }
  | { ok: false; reason: "locked" | "lease_lost"; lock: CashierLock | null };

const LOCK_TTL_SECONDS = 120;

// Reuse existing TEXT columns without DDL: event_name holds a versioned stable
// event ID; user_id holds a session/instance-bound owner, never returned.
export function leaseKeys(input: CashierLease) {
  const instanceHash = createHash("sha256").update(JSON.stringify([input.userId, input.instanceId])).digest("hex");
  return { event: `v3:${JSON.stringify([input.eventId, input.workstationId])}`,
    owner: input.contextId ? `v2:${input.sessionHash}:ctx:${input.contextId}:${input.instanceId}` : `v2:${input.sessionHash}:${instanceHash}` };
}
export function cashierLeaseGuard(input: CashierLease) {
  const keys = leaseKeys(input);
  if (input.contextId) return sql`SELECT af_assert_cashier_lease(${input.sessionHash}, ${input.userId}, ${input.eventId}, ${input.workstationId}, ${keys.event}, ${keys.owner}, ${input.contextId}, ${input.instanceId}) AS authorized`;
  return sql`SELECT af_assert_cashier_lease(${input.sessionHash}, ${input.userId}, ${input.eventId}, ${input.workstationId}, ${keys.event}, ${keys.owner}) AS authorized`;
}
function toLock(row: LockRow, eventId: string): CashierLock {
  return { eventId, username: row.username, heartbeatAt: new Date(row.heartbeat_at).toISOString(), expiresAt: new Date(row.expires_at).toISOString() };
}
async function rejected(input: CashierLease, reason: "locked" | "lease_lost"): Promise<CashierLockResult> {
  const rows = await sql`
    SELECT username, heartbeat_at, expires_at FROM cashier_event_locks
    WHERE event_name = ${leaseKeys(input).event} AND expires_at > NOW() LIMIT 1
  `;
  return { ok: false, reason, lock: rows[0] ? toLock(rows[0] as LockRow, input.eventId) : null };
}

export async function acquireCashierLock(input: CashierLease): Promise<CashierLockResult> {
  // Temporary creation/acquisition is atomic in the opening service. Here we
  // may only resume a still-live owner; never resurrect an expired context.
  if (input.contextId) return heartbeatCashierLock(input);
  const keys = leaseKeys(input);
  // Session row locks serialize acquisition with logout's revocation/cleanup.
  const rows = await sql`
    WITH authorized_session AS (
      SELECT s.token_hash FROM staff_sessions s JOIN staff_users u ON u.id = s.user_id
      WHERE s.token_hash = ${input.sessionHash} AND u.id = ${input.userId}
        AND s.revoked_at IS NULL AND s.expires_at > NOW() AND u.active = TRUE
        AND u.role IN ('admin','cashier') AND u.cashier_event_id = ${input.eventId}
        AND u.workstation_id = ${input.workstationId}
        AND EXISTS (SELECT 1 FROM app_settings a, jsonb_array_elements(a.setting_value->'cashier') w
          WHERE a.setting_key = ${`workstations:${input.eventId}`} AND w->>'id' = ${input.workstationId}
            AND w->>'type' = 'cashier' AND w->>'active' = 'true')
        AND NOT EXISTS (SELECT 1 FROM cashier_event_locks legacy WHERE (legacy.event_name = ${`v2:${input.eventId}`} OR legacy.event_name NOT LIKE 'v3:%') AND legacy.expires_at > NOW())
      FOR SHARE OF s, u
    )
    INSERT INTO cashier_event_locks (event_name, user_id, username, heartbeat_at, expires_at)
    SELECT ${keys.event}, ${keys.owner}, ${input.username}, NOW(), NOW() + (${LOCK_TTL_SECONDS} || ' seconds')::interval
    FROM authorized_session
    ON CONFLICT (event_name) DO UPDATE SET
      user_id = EXCLUDED.user_id, username = EXCLUDED.username,
      heartbeat_at = EXCLUDED.heartbeat_at, expires_at = EXCLUDED.expires_at
    WHERE cashier_event_locks.expires_at <= NOW() OR cashier_event_locks.user_id = EXCLUDED.user_id
    RETURNING username, heartbeat_at, expires_at
  `;
  return rows[0] ? { ok: true, lock: toLock(rows[0] as LockRow, input.eventId) } : rejected(input, "locked");
}

export async function heartbeatCashierLock(input: CashierLease): Promise<CashierLockResult> {
  if (input.contextId) {
    const rows = await sql`SELECT * FROM af_heartbeat_admin_cashier_context(${input.sessionHash}, ${input.userId},
      ${input.eventId}, ${input.workstationId}, ${input.contextId}, ${input.instanceId})`;
    return rows[0] ? { ok: true, lock: toLock(rows[0] as LockRow, input.eventId) } : rejected(input, "lease_lost");
  }
  const keys = leaseKeys(input);
  const rows = await sql`
    WITH authorized_session AS (
      SELECT s.token_hash FROM staff_sessions s JOIN staff_users u ON u.id = s.user_id
      WHERE s.token_hash = ${input.sessionHash} AND u.id = ${input.userId}
        AND s.revoked_at IS NULL AND s.expires_at > NOW() AND u.active = TRUE
        AND u.role IN ('admin','cashier') AND u.cashier_event_id = ${input.eventId}
        AND u.workstation_id = ${input.workstationId}
        AND EXISTS (SELECT 1 FROM app_settings a, jsonb_array_elements(a.setting_value->'cashier') w
          WHERE a.setting_key = ${`workstations:${input.eventId}`} AND w->>'id' = ${input.workstationId}
            AND w->>'type' = 'cashier' AND w->>'active' = 'true')
      FOR SHARE OF s, u
    )
    UPDATE cashier_event_locks SET heartbeat_at = NOW(), expires_at = NOW() + (${LOCK_TTL_SECONDS} || ' seconds')::interval
    WHERE event_name = ${keys.event} AND user_id = ${keys.owner} AND expires_at > NOW()
      AND EXISTS (SELECT 1 FROM authorized_session)
    RETURNING username, heartbeat_at, expires_at
  `;
  return rows[0] ? { ok: true, lock: toLock(rows[0] as LockRow, input.eventId) } : rejected(input, "lease_lost");
}

export async function releaseCashierLock(input: CashierLease) {
  if (input.contextId) {
    await sql`SELECT af_close_admin_cashier_context(${input.sessionHash}, ${input.userId}, ${input.contextId}) AS closed`;
    return;
  }
  const keys = leaseKeys(input);
  await sql`DELETE FROM cashier_event_locks WHERE event_name = ${keys.event} AND user_id = ${keys.owner}`;
}

export async function releaseCashierSessionLocks(sessionHash: string) {
  // Called only after revocation, using the server-derived cookie hash.
  await sql`DELETE FROM cashier_event_locks WHERE split_part(user_id, ':', 1) = 'v2' AND split_part(user_id, ':', 2) = ${sessionHash}`;
}
