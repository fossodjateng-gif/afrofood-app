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
};
export type CashierLockResult =
  | { ok: true; lock: CashierLock }
  | { ok: false; reason: "locked" | "lease_lost"; lock: CashierLock | null };

const LOCK_TTL_SECONDS = 120;

// Reuse existing TEXT columns without DDL: event_name holds a versioned stable
// event ID; user_id holds a session/instance-bound owner, never returned.
function leaseKeys(input: CashierLease) {
  const instanceHash = createHash("sha256").update(JSON.stringify([input.userId, input.instanceId])).digest("hex");
  return { event: `v2:${input.eventId}`, owner: `v2:${input.sessionHash}:${instanceHash}` };
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
  const keys = leaseKeys(input);
  // Session row locks serialize acquisition with logout's revocation/cleanup.
  const rows = await sql`
    WITH authorized_session AS (
      SELECT s.token_hash FROM staff_sessions s JOIN staff_users u ON u.id = s.user_id
      WHERE s.token_hash = ${input.sessionHash} AND u.id = ${input.userId}
        AND s.revoked_at IS NULL AND s.expires_at > NOW() AND u.active = TRUE
        AND (u.role = 'admin' OR (u.role = 'cashier' AND u.cashier_event_id = ${input.eventId}))
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
  const keys = leaseKeys(input);
  const rows = await sql`
    WITH authorized_session AS (
      SELECT s.token_hash FROM staff_sessions s JOIN staff_users u ON u.id = s.user_id
      WHERE s.token_hash = ${input.sessionHash} AND u.id = ${input.userId}
        AND s.revoked_at IS NULL AND s.expires_at > NOW() AND u.active = TRUE
        AND (u.role = 'admin' OR (u.role = 'cashier' AND u.cashier_event_id = ${input.eventId}))
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
  const keys = leaseKeys(input);
  await sql`DELETE FROM cashier_event_locks WHERE event_name = ${keys.event} AND user_id = ${keys.owner}`;
}

export async function releaseCashierSessionLocks(sessionHash: string) {
  // Called only after revocation, using the server-derived cookie hash.
  await sql`DELETE FROM cashier_event_locks WHERE split_part(user_id, ':', 1) = 'v2' AND split_part(user_id, ':', 2) = ${sessionHash}`;
}
