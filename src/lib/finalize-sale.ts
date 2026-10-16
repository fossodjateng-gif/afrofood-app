import { AVAILABILITY_LOCK } from "@/lib/quantity-policy";
import { sql } from "@/lib/db";
import { ensureMenuSettingsSchema } from "@/lib/menu-settings";
import type { OrderRow } from "@/lib/schema";

type SalePayment =
  | { payment: "card"; paymentIntentId: string; amountReceived: number; currency: string }
  | { payment: "cash"; received?: number }
  | { payment: "cashless" };

// Shared with administrative availability writes. The first statement takes
// the transaction lock; subsequent statements get a fresh READ COMMITTED
// snapshot after any preceding sale/admin transaction has committed.
export async function finalizeSale(orderId: string, payment: SalePayment) {
  await ensureMenuSettingsSchema();
  const isCard = payment.payment === "card";
  const received = payment.payment === "cash" ? payment.received ?? null : null;
  const pi = isCard ? payment.paymentIntentId : null;
  const amount = isCard ? payment.amountReceived : null;
  const currency = isCard ? payment.currency : null;
  const results = await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${AVAILABILITY_LOCK}, 0))`,
    sql`
      WITH candidate AS MATERIALIZED (
        SELECT * FROM orders WHERE id = ${orderId} FOR UPDATE
      ), changed AS (
        UPDATE orders o SET
          status = 'NEW', paid_at = COALESCE(o.paid_at, NOW()),
          payment_provider = CASE WHEN ${isCard} THEN 'stripe' ELSE o.payment_provider END,
          payment_error = NULL,
          pos_card_state = CASE WHEN c.payment = 'card' AND c.pos_card_state = 'cancel_requested' THEN 'ready' ELSE o.pos_card_state END,
          cash_received_cents = CASE WHEN ${received}::integer IS NOT NULL THEN ${received}::integer ELSE o.cash_received_cents END,
          change_given_cents = CASE WHEN ${received}::integer IS NOT NULL THEN ${received}::integer - o.amount_cents ELSE o.change_given_cents END,
          quantity_applied = CASE WHEN c.quantity_applied IS FALSE THEN TRUE ELSE c.quantity_applied END
        FROM candidate c
        WHERE o.id = c.id AND UPPER(c.status) = 'PENDING_PAYMENT'
          AND c.payment = ${payment.payment} AND c.paid_at IS NULL
          AND (c.pos_card_key IS NULL OR c.pos_card_state = 'ready' OR (c.payment = 'card' AND c.pos_card_state = 'cancel_requested'))
          AND (c.pos_cash_key IS NULL OR c.pos_cash_state = 'ready')
          AND (NOT ${isCard} OR (c.stripe_payment_intent_id = ${pi}
            AND c.amount_cents = ${amount}::integer AND c.currency = ${currency}))
          AND (${received}::integer IS NULL OR (${received}::integer >= c.amount_cents AND ${received}::integer >= 0))
          AND (c.pos_cash_key IS NULL OR ${received}::integer IS NOT NULL)
        RETURNING o.*, c.quantity_applied AS previous_quantity_applied
      ), counters AS (
        UPDATE app_settings a SET setting_value = (
          SELECT COALESCE(jsonb_object_agg(entry.key,
            CASE WHEN entry.value->>'status' = 'limited'
              AND (entry.value->>'resumeAt' IS NULL OR (entry.value->>'resumeAt')::timestamptz > NOW())
              AND sold.qty IS NOT NULL
            THEN jsonb_set(entry.value, '{remainingQty}',
              to_jsonb(GREATEST(0::numeric, COALESCE((entry.value->>'remainingQty')::numeric, 0) - sold.qty)))
            ELSE entry.value END), '{}'::jsonb)
          FROM jsonb_each(a.setting_value) entry
          LEFT JOIN (
            SELECT item->>'id' AS id, SUM((item->>'qty')::numeric) AS qty
            FROM jsonb_array_elements(changed.items) item
            GROUP BY item->>'id'
          ) sold ON sold.id = entry.key
        ), updated_at = NOW()
        FROM changed
        WHERE changed.previous_quantity_applied IS FALSE
          AND a.setting_key = CASE WHEN COALESCE(changed.event_id, '') = '' THEN 'item_availability'
            ELSE 'item_availability:' || changed.event_id END
        RETURNING a.setting_key
      )
      SELECT id FROM changed
    `,
    sql`SELECT * FROM orders WHERE id = ${orderId} LIMIT 1`,
  ], { isolationLevel: "ReadCommitted" });
  return { changed: results[1].length > 0, order: results[2][0] as OrderRow | undefined };
}
