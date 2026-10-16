import { sql } from "@/lib/db";
import { ensureOrdersSchema } from "@/lib/orders-schema";
import { ensureTerminalActiveOrdersSchema } from "@/lib/terminal-active-orders";
import { stripeGet, stripePost } from "@/lib/stripe-server";
import { matchesCardIntent, reconcileCardPayment, SUCCESS_AFTER_CANCEL, type CardIntent } from "@/lib/reconcile-card-payment";
import { publishOrderEvent } from "@/lib/order-events";
import type { OrderRow } from "@/lib/schema";

export type CancellationContext = { role: string; userId: string; username: string; eventId: string };
export type CancellationOutcome = "canceled" | "already_canceled" | "cancellation_pending" | "already_paid" | "requires_review";
type Result = { outcome: CancellationOutcome; order: OrderRow; reason?: string };
export class CardCancellationError extends Error {
  constructor(public code: string, public status: number) { super(code); }
}
const paid = (order: OrderRow) => order.payment_provider === "stripe" && !!order.paid_at
  && !!order.stripe_payment_intent_id && ["NEW", "IN_PROGRESS", "READY", "DONE"].includes(order.status);

export async function cancelCardPayment(orderId: string, context: CancellationContext): Promise<Result> {
  if (!["admin", "cashier"].includes(context.role)) throw new CardCancellationError("forbidden", 403);
  const username = context.username.trim().toLowerCase();
  if (!orderId || !username || !context.userId || !context.eventId) throw new CardCancellationError("missing_context", 400);
  await ensureOrdersSchema();
  const read = async () => (await sql`SELECT * FROM orders WHERE id = ${orderId} LIMIT 1`)[0] as OrderRow | undefined;
  let order = await read();
  if (!order) throw new CardCancellationError("order_not_found", 404);
  if (order.payment !== "card" || !order.pos_card_key) throw new CardCancellationError("not_pos_card", 409);
  if (order.pos_card_user_id !== context.userId || order.pos_card_username !== username || order.event_id !== context.eventId) {
    throw new CardCancellationError("context_mismatch", 403);
  }
  const terminalResult = (row: OrderRow): Result | undefined => {
    if (row.payment_error === SUCCESS_AFTER_CANCEL) return { outcome: "requires_review", order: row, reason: SUCCESS_AFTER_CANCEL };
    if (paid(row)) return { outcome: "already_paid", order: row };
    if (row.status === "CANCELED" && row.pos_card_state === "canceled") return { outcome: "already_canceled", order: row };
  };
  const terminal = terminalResult(order);
  if (terminal) return terminal;
  if (order.status !== "PENDING_PAYMENT" || order.paid_at || !["ready", "cancel_requested"].includes(order.pos_card_state || "")) {
    throw new CardCancellationError("order_not_cancelable", 409);
  }
  // Competes atomically with the PI-start UPDATE and terminal row lock.
  await sql`UPDATE orders SET pos_card_state = 'cancel_requested', payment_error = NULL
    WHERE id = ${orderId} AND payment = 'card' AND pos_card_key IS NOT NULL
      AND UPPER(status) = 'PENDING_PAYMENT' AND paid_at IS NULL AND pos_card_state = 'ready'
      AND pos_card_user_id = ${context.userId} AND pos_card_username = ${username} AND event_id = ${context.eventId}`;
  order = (await read())!;
  const raced = terminalResult(order);
  if (raced) return raced;
  if (order.status !== "PENDING_PAYMENT" || order.pos_card_state !== "cancel_requested" || order.paid_at) {
    throw new CardCancellationError("order_changed", 409);
  }

  const pending = async (outcome: "cancellation_pending" | "requires_review", reason: string): Promise<Result> => {
    await sql`UPDATE orders SET payment_error = ${reason}
      WHERE id = ${orderId} AND UPPER(status) = 'PENDING_PAYMENT' AND pos_card_state = 'cancel_requested' AND paid_at IS NULL`;
    const current = (await read())!;
    return terminalResult(current) || { outcome, reason, order: current };
  };
  const piId = order.stripe_payment_intent_id || null;
  if (!piId && order.stripe_pi_started_at) return pending("requires_review", "POS_CARD_CANCEL_PI_UNKNOWN");
  if (piId) {
    let pi: CardIntent;
    try {
      pi = await stripeGet<CardIntent>(`/payment_intents/${encodeURIComponent(piId)}`);
    } catch {
      return pending("cancellation_pending", "POS_CARD_CANCEL_STRIPE_UNCERTAIN");
    }
    if (!matchesCardIntent(order, pi)) return pending("requires_review", "POS_CARD_CANCEL_PI_MISMATCH");
    if (pi.status !== "canceled" && pi.status !== "succeeded") {
      if (!["requires_payment_method", "requires_confirmation", "requires_action", "processing", "requires_capture"].includes(pi.status)) {
        return pending("requires_review", "POS_CARD_CANCEL_UNSUPPORTED_STATE");
      }
      try {
        pi = await stripePost<CardIntent>(`/payment_intents/${encodeURIComponent(piId)}/cancel`, {}, `afrofood-terminal-cancel:${orderId}:v1`);
      } catch {
        return pending("cancellation_pending", "POS_CARD_CANCEL_STRIPE_UNCERTAIN");
      }
      if (!matchesCardIntent(order, pi)) return pending("requires_review", "POS_CARD_CANCEL_PI_MISMATCH");
    }
    if (pi.status === "succeeded") {
      if (!Number.isSafeInteger(pi.amount_received) || pi.amount_received !== order.amount_cents) {
        return pending("requires_review", "POS_CARD_CANCEL_SUCCESS_AMOUNT_MISMATCH");
      }
      const reconciled = await reconcileCardPayment(orderId, pi);
      if (reconciled.requiresReview) return { outcome: "requires_review", order: reconciled.order!, reason: SUCCESS_AFTER_CANCEL };
      if (reconciled.order && paid(reconciled.order)) return { outcome: "already_paid", order: reconciled.order };
      return pending("requires_review", "POS_CARD_CANCEL_SUCCESS_NOT_RECONCILED");
    }
    if (pi.status !== "canceled") return pending("cancellation_pending", "POS_CARD_CANCEL_NOT_CONFIRMED");
  }

  await ensureTerminalActiveOrdersSchema();
  // Never touch quantities or quantity_applied here. No PI is safe only if
  // stripe_pi_started_at is still NULL under this conditional row update.
  const result = await sql.transaction([
    sql`UPDATE orders SET status = 'CANCELED', pos_card_state = 'canceled', payment_error = NULL
      WHERE id = ${orderId} AND payment = 'card' AND pos_card_key IS NOT NULL
        AND UPPER(status) = 'PENDING_PAYMENT' AND paid_at IS NULL AND pos_card_state = 'cancel_requested'
        AND stripe_payment_intent_id IS NOT DISTINCT FROM ${piId}::text
        AND (${piId}::text IS NOT NULL OR stripe_pi_started_at IS NULL)
        AND pos_card_user_id = ${context.userId} AND pos_card_username = ${username} AND event_id = ${context.eventId}
      RETURNING id`,
    sql`DELETE FROM terminal_active_orders active USING orders canceled
      WHERE canceled.id = ${orderId} AND canceled.status = 'CANCELED' AND canceled.pos_card_state = 'canceled'
        AND active.order_id = canceled.id AND active.username = canceled.pos_card_username
        AND active.user_id = canceled.pos_card_user_id AND active.event_name = canceled.event_name
        AND active.payment_intent_id IS NOT DISTINCT FROM canceled.stripe_payment_intent_id`,
    sql`SELECT * FROM orders WHERE id = ${orderId} LIMIT 1`,
  ], { isolationLevel: "ReadCommitted" });
  const current = result[2][0] as OrderRow;
  if (!result[0].length) return terminalResult(current) || pending("requires_review", "POS_CARD_CANCEL_ORDER_CHANGED");
  publishOrderEvent({ type: "ORDER_STATUS_CHANGED", orderId, at: Date.now(), status: "CANCELED", previousStatus: "PENDING_PAYMENT" });
  return { outcome: "canceled", order: current };
}
