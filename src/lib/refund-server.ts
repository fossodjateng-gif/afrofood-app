import { randomUUID } from "node:crypto";
import { sql } from "@/lib/db";
import { stripeGet, stripePost } from "@/lib/stripe-server";
import { canAccessStaffEvent, canUseCashRegister, type AuthenticatedStaff } from "@/lib/staff-permissions";
import type { OrderRow } from "@/lib/schema";
import { cashierLeaseGuard } from "@/lib/cashier-locks";
import type { CashierWriteContext } from "@/lib/cashier-write-context";

export type RefundState = "requested" | "processing" | "refunded" | "requires_review";
export type RefundRow = {
  order_id: string; refund_key: string; stripe_payment_intent_id: string | null;
  payment_method?: "card" | "cash";
  refund_amount_cents: number; currency: string; refund_state: RefundState;
  stripe_refund_id: string | null; refund_requested_at: string; requested_by: string;
  refunded_at: string | null; refund_error: string | null;
  requested_by_username?: string | null; requested_event_id?: string | null;
  requested_register_id?: string | null; requested_register_name?: string | null;
};
type StripeRefund = { id: string; payment_intent: string; amount: number; currency: string; status: string; metadata?: Record<string, string> };
type Intent = { id: string; status: string; amount: number; amount_received: number; currency: string; metadata?: Record<string, string> };
export class RefundError extends Error {
  constructor(public code: string, public status = 409) { super(code); }
}
export function eligibleCardSale(order: OrderRow) {
  return order.payment === "card" && order.payment_provider === "stripe" && !!order.paid_at
    && ["NEW", "IN_PROGRESS", "READY", "DONE"].includes(order.status)
    && !!order.stripe_payment_intent_id && Number.isSafeInteger(order.amount_cents)
    && Number(order.amount_cents) > 0 && order.currency === "eur";
}
export function eligibleCashSale(order: OrderRow) {
  return order.payment === "cash" && order.stripe_payment_intent_id == null && order.payment_provider == null && !!order.paid_at
    && ["NEW", "IN_PROGRESS", "READY", "DONE"].includes(order.status)
    && Number.isSafeInteger(order.amount_cents) && Number(order.amount_cents) > 0 && order.currency === "eur";
}
export function refundSummary(row?: RefundRow) {
  return row ? { state: row.refund_state, amountCents: row.refund_amount_cents, currency: row.currency, refundedAt: row.refunded_at, paymentMethod: row.payment_method || "card" } : null;
}
async function readRefund(orderId: string) {
  return (await sql`SELECT * FROM order_refunds WHERE order_id = ${orderId} LIMIT 1`)[0] as RefundRow | undefined;
}
async function save(row: RefundRow, state: RefundState, error: string | null, refundId: string | null = row.stripe_refund_id) {
  // Never downgrade success or replace an already linked Refund with another.
  await sql`UPDATE order_refunds SET refund_state = ${state}, refund_error = ${error},
    stripe_refund_id = COALESCE(stripe_refund_id, ${refundId}),
    refunded_at = CASE WHEN ${state} = 'refunded' THEN COALESCE(refunded_at, NOW()) ELSE refunded_at END,
    updated_at = NOW()
    WHERE order_id = ${row.order_id} AND refund_key = ${row.refund_key} AND refund_state <> 'refunded'
      AND (${state} <> 'requested' OR refund_state = 'requested')
      AND (stripe_refund_id IS NULL OR stripe_refund_id IS NOT DISTINCT FROM ${refundId}::text)
      AND (${state} <> 'processing' OR refund_state IN ('requested', 'processing'))`;
  return (await readRefund(row.order_id))!;
}
function refundMatches(refund: StripeRefund, row: RefundRow, external = false) {
  if (typeof refund?.id !== "string" || !/^re_[A-Za-z0-9_]+$/.test(refund.id) || refund.payment_intent !== row.stripe_payment_intent_id
    || !Number.isSafeInteger(refund.amount) || refund.amount !== row.refund_amount_cents || refund.currency !== row.currency) return false;
  if (refund.metadata !== undefined && (!refund.metadata || typeof refund.metadata !== "object" || Array.isArray(refund.metadata))) return false;
  if (external) return (!refund.metadata?.order_id || refund.metadata.order_id === row.order_id)
    && (!refund.metadata?.refund_key || refund.metadata.refund_key === row.refund_key);
  return refund.metadata?.order_id === row.order_id && refund.metadata?.refund_key === row.refund_key;
}
async function accept(row: RefundRow, refund: StripeRefund, external = false, confirmed = true) {
  if (!refundMatches(refund, row, external)) return save(row, "requires_review", "REFUND_MISMATCH");
  if (refund.status === "succeeded") return save(row, confirmed ? "refunded" : "processing", external ? "EXTERNAL_REFUND" : null, refund.id);
  if (refund.status === "pending") return save(row, "processing", external ? "EXTERNAL_REFUND" : null, refund.id);
  return save(row, "requires_review", refund.status === "failed" ? "REFUND_FAILED" : refund.status === "canceled" ? "REFUND_CANCELED" : "REFUND_STATE_REQUIRES_REVIEW", refund.id);
}

export async function reconcileRefund(row: RefundRow, order: OrderRow, allowCreate = false): Promise<RefundRow> {
  // Cash is recorded atomically at confirmation; it never enters Stripe reconciliation.
  if (row.payment_method === "cash") return row;
  if (!row.stripe_payment_intent_id) throw new RefundError("refund_payment_mismatch");
  if (row.refund_state === "refunded") return row;
  let intent: Intent;
  try { intent = await stripeGet<Intent>(`/payment_intents/${encodeURIComponent(row.stripe_payment_intent_id)}`); }
  catch { return save(row, row.refund_state, "STRIPE_READ_UNCERTAIN"); }
  if (!eligibleCardSale(order) || intent.id !== row.stripe_payment_intent_id || intent.id !== order.stripe_payment_intent_id
    || intent.status !== "succeeded" || intent.metadata?.order_id !== order.id
    || !Number.isSafeInteger(intent.amount) || !Number.isSafeInteger(intent.amount_received)
    || intent.amount !== row.refund_amount_cents || intent.amount_received !== row.refund_amount_cents
    || order.amount_cents !== row.refund_amount_cents || intent.currency !== row.currency || order.currency !== row.currency) {
    return save(row, "requires_review", "PAYMENT_MISMATCH");
  }
  if (row.stripe_refund_id) {
    let refund: StripeRefund;
    try { refund = await stripeGet<StripeRefund>(`/refunds/${encodeURIComponent(row.stripe_refund_id)}`); }
    catch { return save(row, row.refund_state, "STRIPE_READ_UNCERTAIN"); }
    if (refund.id !== row.stripe_refund_id) return save(row, "requires_review", "REFUND_MISMATCH");
    return accept(row, refund, !refund.metadata?.refund_key);
  }
  const refunds: StripeRefund[] = [];
  let cursor = "";
  try {
    for (let page = 0; page < 100; page++) {
      const params = new URLSearchParams({ payment_intent: row.stripe_payment_intent_id, limit: "100" });
      if (cursor) params.set("starting_after", cursor);
      const list = await stripeGet<{ data: StripeRefund[]; has_more: boolean }>(`/refunds?${params}`);
      if (!Array.isArray(list.data) || typeof list.has_more !== "boolean") throw new Error("Invalid list");
      refunds.push(...list.data);
      if (!list.has_more) break;
      const next = list.data.at(-1)?.id;
      if (!next || next === cursor || page === 99) throw new Error("Incomplete list");
      cursor = next;
    }
  } catch { return save(row, row.refund_state, "STRIPE_READ_UNCERTAIN"); }
  if (refunds.length > 1) return save(row, "requires_review", "MULTIPLE_OR_PARTIAL_REFUNDS");
  if (refunds.length === 1) return accept(row, refunds[0], !refunds[0].metadata?.refund_key);
  // A missing list result is NOT proof of non-execution. Replays are limited
  // to the same immutable key and parameters within a conservative window.
  if (!allowCreate || row.refund_state !== "requested") return row;
  const age = Date.now() - new Date(row.refund_requested_at).getTime();
  if (!Number.isFinite(age) || age < 0 || age > 23 * 60 * 60 * 1000) return save(row, "requires_review", "IDEMPOTENCY_WINDOW_EXPIRED");
  // Enable only after the Stripe contract and Preview integration are verified.
  if (process.env.REFUND_CREATE_ENABLED !== "1") return save(row, "requested", "CREATION_DISABLED");
  let refund: StripeRefund;
  try {
    refund = await stripePost<StripeRefund>("/refunds", {
      payment_intent: row.stripe_payment_intent_id, amount: row.refund_amount_cents,
      "metadata[order_id]": row.order_id, "metadata[refund_key]": row.refund_key,
    }, `afrofood-refund-full:v1:${row.refund_key}`);
  } catch { return save(row, "requested", "STRIPE_CREATE_UNCERTAIN"); }
  // A create acknowledgement is not final confirmation. Retrieve current state
  // on the next reconciliation (GET/retry/webhook) before recording success.
  return accept(row, refund, false, false);
}

export async function getOrderRefund(orderId: string, user: AuthenticatedStaff, create: boolean, context?: CashierWriteContext, requestedAmount?: unknown) {
  const order = (await sql`SELECT * FROM orders WHERE id = ${orderId} LIMIT 1`)[0] as OrderRow | undefined;
  if (!order) throw new RefundError("order_not_found", 404);
  if (!canUseCashRegister(user) || !canAccessStaffEvent(user, order.event_id || "")) throw new RefundError("refund_forbidden", 403);
  if (!user.workstationId || user.workstationType !== "cashier" || user.cashierEventId !== order.event_id) throw new RefundError("refund_context_forbidden", 403);
  const cash = eligibleCashSale(order);
  if (!cash && !eligibleCardSale(order)) throw new RefundError("refund_not_eligible");
  // Total only, for both methods. The client confirms the amount, never chooses it.
  if (requestedAmount !== undefined && (!Number.isSafeInteger(requestedAmount) || requestedAmount !== order.amount_cents)) throw new RefundError("refund_invalid_amount", 400);
  if (create && (!context || context.userId !== user.id || context.eventId !== order.event_id || context.workstationId !== user.workstationId)) throw new RefundError("refund_context_forbidden", 403);
  let row = await readRefund(orderId);
  if (cash) {
    if (!row && create) {
      if (process.env.REFUND_CREATE_ENABLED !== "1") throw new RefundError("refund_creation_disabled", 503);
      await sql.transaction([
        cashierLeaseGuard(context!),
        // Lock eligibility with the sale while serializing concurrent confirmations.
        sql`SELECT id FROM orders WHERE id = ${order.id} FOR UPDATE`,
        sql`INSERT INTO order_refunds (order_id, refund_key, payment_method, stripe_payment_intent_id,
          refund_amount_cents, currency, refund_state, requested_by, requested_by_username,
          requested_event_id, requested_register_id, requested_register_name, refunded_at)
          SELECT id, ${randomUUID()}, 'cash', NULL, amount_cents, currency, 'refunded', ${user.id},
            ${context!.username}, ${context!.eventId}, ${context!.workstationId}, ${context!.workstationName}, NOW()
          FROM orders WHERE id = ${order.id} AND event_id = ${context!.eventId}
            AND payment = 'cash' AND payment_provider IS NULL AND stripe_payment_intent_id IS NULL
            AND paid_at IS NOT NULL AND UPPER(status) IN ('NEW','IN_PROGRESS','READY','DONE')
            AND amount_cents = ${order.amount_cents} AND currency = 'eur'
          ON CONFLICT (order_id) DO NOTHING`,
      ], { isolationLevel: "ReadCommitted" });
      row = await readRefund(orderId);
      if (!row) throw new RefundError("refund_conflict");
    }
    if (row && (row.payment_method !== "cash" || row.refund_state !== "refunded"
      || row.refund_amount_cents !== order.amount_cents || row.currency !== order.currency
      || row.stripe_payment_intent_id || row.stripe_refund_id || !row.refunded_at)) throw new RefundError("refund_payment_mismatch");
    return row;
  }
  if (row?.payment_method === "cash") throw new RefundError("refund_payment_mismatch");
  if (!row && create) {
    // The unique order/PI constraints serialize claims. No network call occurs
    // until this INSERT commits. requested_by is never updated by retries.
    await sql.transaction([
      cashierLeaseGuard(context!),
      sql`INSERT INTO order_refunds (order_id, refund_key, stripe_payment_intent_id, refund_amount_cents, currency, refund_state, requested_by,
        requested_by_username, requested_event_id, requested_register_id, requested_register_name)
        SELECT id, ${randomUUID()}, stripe_payment_intent_id, amount_cents, currency, 'requested', ${user.id},
          ${context!.username}, ${context!.eventId}, ${context!.workstationId}, ${context!.workstationName}
        FROM orders WHERE id = ${order.id} AND event_id = ${context!.eventId}
          AND payment = 'card' AND payment_provider = 'stripe' AND paid_at IS NOT NULL
          AND UPPER(status) IN ('NEW','IN_PROGRESS','READY','DONE')
          AND stripe_payment_intent_id = ${order.stripe_payment_intent_id}
          AND amount_cents = ${order.amount_cents} AND currency = ${order.currency}
        ON CONFLICT DO NOTHING`,
    ], { isolationLevel: "ReadCommitted" });
    row = await readRefund(orderId);
    if (!row) throw new RefundError("refund_conflict");
  }
  return row ? reconcileRefund(row, order, create) : undefined;
}
