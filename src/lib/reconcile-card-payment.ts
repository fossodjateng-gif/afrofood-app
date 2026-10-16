import { sql } from "@/lib/db";
import { finalizeSale } from "@/lib/finalize-sale";
import { publishOrderEvent } from "@/lib/order-events";
import type { OrderRow } from "@/lib/schema";

export type CardIntent = {
  id: string; status: string; amount: number; currency: string;
  amount_received?: number; metadata?: Record<string, string>;
};

export const SUCCESS_AFTER_CANCEL = "POS_CARD_SUCCESS_AFTER_CANCEL";

export function matchesCardIntent(order: OrderRow, pi: CardIntent) {
  return order.payment === "card" && order.stripe_payment_intent_id === pi.id
    && pi.metadata?.order_id === order.id && Number.isSafeInteger(pi.amount)
    && pi.amount === order.amount_cents && pi.currency === order.currency;
}

// Only call with a verified Stripe success (signed webhook or server retrieval).
export async function reconcileCardPayment(orderId: string, pi: CardIntent) {
  const rows = await sql`SELECT * FROM orders WHERE id = ${orderId} LIMIT 1`;
  const before = rows[0] as OrderRow | undefined;
  if (!before || !matchesCardIntent(before, pi) || pi.status !== "succeeded"
    || !Number.isSafeInteger(pi.amount_received) || pi.amount_received !== before.amount_cents) {
    throw new Error("Stripe payment does not match the order");
  }
  const result = await finalizeSale(orderId, { payment: "card", paymentIntentId: pi.id, amountReceived: pi.amount_received!, currency: pi.currency });
  // Check the final row too: cancellation may have committed after our read.
  if (result.order?.status === "CANCELED" && result.order.pos_card_state === "canceled") {
    await sql`UPDATE orders SET payment_error = ${SUCCESS_AFTER_CANCEL}
      WHERE id = ${orderId} AND UPPER(status) = 'CANCELED' AND pos_card_state = 'canceled'
        AND stripe_payment_intent_id = ${pi.id}`;
    return { ...result, requiresReview: true };
  }
  if (result.changed) {
    publishOrderEvent({ type: "ORDER_STATUS_CHANGED", orderId, at: Date.now(), status: "NEW", previousStatus: "PENDING_PAYMENT" });
    publishOrderEvent({ type: "PAYMENT_VALIDATED", orderId, at: Date.now(), status: "NEW", previousStatus: "PENDING_PAYMENT" });
  }
  return { ...result, requiresReview: false };
}
