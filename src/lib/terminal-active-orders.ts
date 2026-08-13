import { sql } from "@/lib/db";

export type TerminalActiveOrder = {
  username: string;
  userId: string | null;
  eventName: string;
  orderId: string;
  paymentIntentId: string | null;
  updatedAt: string;
  expiresAt: string;
};

const ACTIVE_ORDER_TTL_SECONDS = 900;

function normalizeUsername(username: string) {
  return String(username || "").trim().toLowerCase();
}

function normalizeEventName(eventName: string) {
  return String(eventName || "").trim() || "Evenement par defaut";
}

function toActiveOrder(row: {
  username: string;
  user_id: string | null;
  event_name: string;
  order_id: string;
  payment_intent_id: string | null;
  updated_at: string;
  expires_at: string;
}): TerminalActiveOrder {
  return {
    username: String(row.username || ""),
    userId: row.user_id ? String(row.user_id) : null,
    eventName: String(row.event_name || ""),
    orderId: String(row.order_id || ""),
    paymentIntentId: row.payment_intent_id ? String(row.payment_intent_id) : null,
    updatedAt: new Date(row.updated_at).toISOString(),
    expiresAt: new Date(row.expires_at).toISOString(),
  };
}

export async function ensureTerminalActiveOrdersSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS terminal_active_orders (
      username TEXT PRIMARY KEY,
      user_id TEXT,
      event_name TEXT NOT NULL,
      order_id TEXT NOT NULL,
      payment_intent_id TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
}

export async function setTerminalActiveOrder(input: {
  username: string;
  userId?: string | null;
  eventName: string;
  orderId: string;
  paymentIntentId?: string | null;
}) {
  await ensureTerminalActiveOrdersSchema();
  const username = normalizeUsername(input.username);
  const eventName = normalizeEventName(input.eventName);
  const orderId = String(input.orderId || "").trim();
  const userId = input.userId ? String(input.userId).trim() : null;
  const paymentIntentId = input.paymentIntentId ? String(input.paymentIntentId).trim() : null;
  if (!username || !orderId) throw new Error("Missing terminal order target");

  const rows = (await sql`
    INSERT INTO terminal_active_orders (username, user_id, event_name, order_id, payment_intent_id, updated_at, expires_at)
    VALUES (${username}, ${userId}, ${eventName}, ${orderId}, ${paymentIntentId}, NOW(), NOW() + (${ACTIVE_ORDER_TTL_SECONDS} || ' seconds')::interval)
    ON CONFLICT (username)
    DO UPDATE SET
      user_id = EXCLUDED.user_id,
      event_name = EXCLUDED.event_name,
      order_id = EXCLUDED.order_id,
      payment_intent_id = EXCLUDED.payment_intent_id,
      updated_at = NOW(),
      expires_at = NOW() + (${ACTIVE_ORDER_TTL_SECONDS} || ' seconds')::interval
    RETURNING username, user_id, event_name, order_id, payment_intent_id, updated_at, expires_at
  `) as Array<{
    username: string;
    user_id: string | null;
    event_name: string;
    order_id: string;
    payment_intent_id: string | null;
    updated_at: string;
    expires_at: string;
  }>;

  return toActiveOrder(rows[0]);
}

export async function getTerminalActiveOrder(usernameInput: string) {
  await ensureTerminalActiveOrdersSchema();
  await sql`DELETE FROM terminal_active_orders WHERE expires_at < NOW();`;
  const username = normalizeUsername(usernameInput);
  if (!username) return null;

  const rows = (await sql`
    SELECT username, user_id, event_name, order_id, payment_intent_id, updated_at, expires_at
    FROM terminal_active_orders
    WHERE username = ${username}
    LIMIT 1
  `) as Array<{
    username: string;
    user_id: string | null;
    event_name: string;
    order_id: string;
    payment_intent_id: string | null;
    updated_at: string;
    expires_at: string;
  }>;

  return rows[0] ? toActiveOrder(rows[0]) : null;
}

export async function clearTerminalActiveOrder(input: { username: string; orderId?: string | null }) {
  await ensureTerminalActiveOrdersSchema();
  const username = normalizeUsername(input.username);
  const orderId = input.orderId ? String(input.orderId).trim() : "";
  if (!username) return;
  if (orderId) {
    await sql`DELETE FROM terminal_active_orders WHERE username = ${username} AND order_id = ${orderId};`;
    return;
  }
  await sql`DELETE FROM terminal_active_orders WHERE username = ${username};`;
}
