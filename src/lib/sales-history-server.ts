import { sql } from "@/lib/db";

export const CONFIRMED_SALE_STATUSES = ["NEW", "IN_PROGRESS", "READY", "DONE"];

// Reporting must never call getStoreConfig(), which also prepares the schema.
export async function salesHistoryEvents(): Promise<Array<{ id: string; name: string }>> {
  const rows = await sql`SELECT setting_value FROM app_settings WHERE setting_key = 'store_config' LIMIT 1`;
  const events: unknown = rows[0]?.setting_value?.events;
  if (!Array.isArray(events)) return [];
  return events.filter((event): event is { id: string; name: string } =>
    !!event && typeof event.id === "string" && !!event.id.trim() && typeof event.name === "string")
    .map(event => ({ id: event.id, name: event.name }));
}

// Call only after authorizing the event and register in the API.
export function salesHistoryQuery(eventId: string, workstationId: string | null, limit: number, offset: number) {
  return sql`
      SELECT id, created_at, customer_name, event_id, event_name, created_by, created_by_username, register_id, register_name, paid_by, paid_by_username, paid_register_id, paid_register_name,
        reservation_requested, reservation_time, payment, amount_cents,
        cash_received_cents, change_given_cents, currency, paid_at,
        UPPER(status) AS status, items,
        (paid_at IS NOT NULL AND amount_cents > 0 AND currency = 'eur'
          AND ((payment = 'card' AND payment_provider = 'stripe' AND stripe_payment_intent_id IS NOT NULL)
            OR (payment = 'cash' AND payment_provider IS NULL AND stripe_payment_intent_id IS NULL))
          AND NOT EXISTS (SELECT 1 FROM order_refunds r WHERE r.order_id = orders.id AND r.refund_state <> 'requested')) AS can_refund,
        (SELECT jsonb_build_object('state', r.refund_state, 'amountCents', r.refund_amount_cents,
          'currency', r.currency, 'refundedAt', r.refunded_at, 'paymentMethod', r.payment_method)
          FROM order_refunds r WHERE r.order_id = orders.id) AS refund
      FROM orders
      WHERE event_id = ${eventId}
        AND (${workstationId}::text IS NULL OR paid_register_id = ${workstationId})
        AND UPPER(status) = ANY(${CONFIRMED_SALE_STATUSES}::text[])
      ORDER BY created_at DESC, id DESC
      LIMIT ${limit + 1} OFFSET ${offset}
    `;
}
