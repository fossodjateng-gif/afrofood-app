import { randomUUID } from "node:crypto";
import { sql } from "@/lib/db";
import { stripeGet, stripePost } from "@/lib/stripe-server";
import { canAccessStaffEvent, canUseCashRegister, type AuthenticatedStaff } from "@/lib/staff-permissions";
import type { OrderRow } from "@/lib/schema";

export type RefundState = "requested" | "processing" | "refunded" | "requires_review";
export type RefundRow = {
  order_id: string; refund_key: string; stripe_payment_intent_id: string;
  refund_amount_cents: number; currency: string; refund_state: RefundState;
  stripe_refund_id: string | null; refund_requested_at: string; requested_by: string;
  refunded_at: string | null; refund_error: string | null;
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
export function refundSummary(row?: RefundRow) {
  return row ? { state: row.refund_state, amountCents: row.refund_amount_cents, currency: row.currency, refundedAt: row.refunded_at } : null;
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
      AND (stripe_refund_id IS NULL OR stripe_refund_id IS NOT DISTINCT FROM ${refundId}::text)`;
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
async function accept(row: RefundRow, refund: StripeRefund, external = false) {
  if (!refundMatches(refund, row, external)) return save(row, "requires_review", "REFUND_MISMATCH");
  if (refund.status === "succeeded") return save(row, "refunded", external ? "EXTERNAL_REFUND" : null, refund.id);
  if (refund.status === "pending") return save(row, "processing", external ? "EXTERNAL_REFUND" : null, refund.id);
  return save(row, "requires_review", "REFUND_STATE_REQUIRES_REVIEW", refund.id);
}

export async function reconcileRefund(row: RefundRow, order: OrderRow, allowCreate = false): Promise<RefundRow> {
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
  return accept(row, refund);
}

export async function getOrderRefund(orderId: string, user: AuthenticatedStaff, create: boolean) {
  const order = (await sql`SELECT * FROM orders WHERE id = ${orderId} LIMIT 1`)[0] as OrderRow | undefined;
  if (!order) throw new RefundError("order_not_found", 404);
  if (!canUseCashRegister(user) || !canAccessStaffEvent(user, order.event_id || "")) throw new RefundError("refund_forbidden", 403);
  if (!eligibleCardSale(order)) throw new RefundError("refund_not_eligible");
  let row = await readRefund(orderId);
  if (!row && create) {
    // The unique order/PI constraints serialize claims. No network call occurs
    // until this INSERT commits. requested_by is never updated by retries.
    await sql`INSERT INTO order_refunds (order_id, refund_key, stripe_payment_intent_id, refund_amount_cents, currency, refund_state, requested_by)
      VALUES (${order.id}, ${randomUUID()}, ${order.stripe_payment_intent_id}, ${order.amount_cents}, ${order.currency}, 'requested', ${user.id})
      ON CONFLICT DO NOTHING`;
    row = await readRefund(orderId);
    if (!row) throw new RefundError("refund_conflict");
  }
  return row ? reconcileRefund(row, order, create) : undefined;
}
