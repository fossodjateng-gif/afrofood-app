import { sql } from "@/lib/db";

export type CashierLock = {
  eventName: string;
  userId: string;
  username: string;
  heartbeatAt: string;
  expiresAt: string;
};

export type CashierLockResult =
  | { ok: true; lock: CashierLock }
  | { ok: false; reason: "locked"; lock: CashierLock };

const LOCK_TTL_SECONDS = 120;

function normalizeEventName(eventName: string) {
  return String(eventName || "").trim() || "Evenement par defaut";
}

function toLock(row: {
  event_name: string;
  user_id: string;
  username: string;
  heartbeat_at: string;
  expires_at: string;
}): CashierLock {
  return {
    eventName: String(row.event_name || ""),
    userId: String(row.user_id || ""),
    username: String(row.username || ""),
    heartbeatAt: new Date(row.heartbeat_at).toISOString(),
    expiresAt: new Date(row.expires_at).toISOString(),
  };
}

export async function ensureCashierLocksSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS cashier_event_locks (
      event_name TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
}

export async function acquireCashierLock(input: {
  eventName: string;
  userId: string;
  username: string;
}): Promise<CashierLockResult> {
  await ensureCashierLocksSchema();
  const eventName = normalizeEventName(input.eventName);
  const userId = String(input.userId || "").trim();
  const username = String(input.username || "").trim() || "cashier";

  await sql`DELETE FROM cashier_event_locks WHERE expires_at < NOW();`;

  const existing = (await sql`
    SELECT event_name, user_id, username, heartbeat_at, expires_at
    FROM cashier_event_locks
    WHERE event_name = ${eventName}
    LIMIT 1
  `) as Array<{
    event_name: string;
    user_id: string;
    username: string;
    heartbeat_at: string;
    expires_at: string;
  }>;

  if (existing[0] && existing[0].user_id !== userId) {
    return { ok: false, reason: "locked", lock: toLock(existing[0]) };
  }

  const rows = (await sql`
    INSERT INTO cashier_event_locks (event_name, user_id, username, heartbeat_at, expires_at)
    VALUES (${eventName}, ${userId}, ${username}, NOW(), NOW() + (${LOCK_TTL_SECONDS} || ' seconds')::interval)
    ON CONFLICT (event_name)
    DO UPDATE SET
      user_id = EXCLUDED.user_id,
      username = EXCLUDED.username,
      heartbeat_at = NOW(),
      expires_at = NOW() + (${LOCK_TTL_SECONDS} || ' seconds')::interval
    RETURNING event_name, user_id, username, heartbeat_at, expires_at
  `) as Array<{
    event_name: string;
    user_id: string;
    username: string;
    heartbeat_at: string;
    expires_at: string;
  }>;

  return { ok: true, lock: toLock(rows[0]) };
}

export async function heartbeatCashierLock(input: {
  eventName: string;
  userId: string;
  username: string;
}): Promise<CashierLockResult> {
  return acquireCashierLock(input);
}

export async function releaseCashierLock(input: { eventName: string; userId: string }) {
  await ensureCashierLocksSchema();
  const eventName = normalizeEventName(input.eventName);
  const userId = String(input.userId || "").trim();
  await sql`
    DELETE FROM cashier_event_locks
    WHERE event_name = ${eventName}
      AND user_id = ${userId}
  `;
}
