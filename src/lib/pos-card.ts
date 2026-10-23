import { staffFetch } from "@/lib/staff-auth";
import type { CancellationOutcome } from "@/lib/pos-card-cancel-server";
import type { OrderRow } from "@/lib/schema";
import type { PosCartItem } from "@/lib/pos-cart";
import { cardIdentityPayload } from "@/lib/pos-card-identity";
import { prepareTerminalCheckout } from "@/lib/terminal-checkout";

export type CardAttempt = { key: string; fingerprint: string; userId: string; username: string; role: string; workstationId?: string; eventId: string; eventName: string; items: PosCartItem[]; amountCents: number; createdAt: number; orderId?: string; paymentIntentId?: string; published?: boolean; cancelRequested?: boolean; cancellationOutcome?: CancellationOutcome };
export const cardAttemptKey = (cartKey: string) => `${cartKey}:card-attempt`;

export async function makeCardFingerprint(input: Pick<CardAttempt, "userId" | "username" | "eventId" | "workstationId" | "items">) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(cardIdentityPayload(input)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isPaidCardOrder(order: OrderRow, attempt: CardAttempt) {
  return order.id === attempt.orderId && order.event_id === attempt.eventId && order.payment === "card" && order.payment_provider === "stripe"
    && !!order.paid_at && !!order.stripe_payment_intent_id && (!attempt.paymentIntentId || order.stripe_payment_intent_id === attempt.paymentIntentId)
    && order.amount_cents === attempt.amountCents && order.currency === "eur" && ["NEW", "IN_PROGRESS", "READY", "DONE"].includes(order.status);
}

export async function checkPosCard(attempt: CardAttempt, request: typeof fetch = staffFetch): Promise<OrderRow | null> {
  if (!attempt.orderId) return null;
  const response = await request(`/api/orders?id=${encodeURIComponent(attempt.orderId)}`, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok || !Array.isArray(data) || data.length !== 1 || data[0].id !== attempt.orderId || data[0].event_id !== attempt.eventId || data[0].payment !== "card") throw new Error("Status konnte nicht bestätigt werden. Bitte nicht erneut bezahlen.");
  return data[0];
}

export async function preparePosCard(attempt: CardAttempt, persist: (attempt: CardAttempt) => void, request: typeof fetch = staffFetch) {
  if (await makeCardFingerprint(attempt) !== attempt.fingerprint) throw new Error("Die gespeicherte Kartenzahlung wurde verändert.");
  if (!attempt.orderId) {
    const response = await request("/api/orders", { method: "POST", headers: { "Content-Type": "application/json", "x-staff-role": attempt.role, "x-staff-user-id": attempt.userId }, body: JSON.stringify({ posCardKey: attempt.key, fingerprint: attempt.fingerprint, userId: attempt.userId, username: attempt.username, eventId: attempt.eventId, workstationId: attempt.workstationId, payment: "card", items: attempt.items }) });
    const data = await response.json();
    if (!response.ok || !data?.ok || data.fingerprint !== attempt.fingerprint || !data.order?.id || data.order.eventId !== attempt.eventId || data.order.payment !== "card" || !Number.isSafeInteger(data.order.amountCents)) throw new Error(data?.error || "Bestellung noch nicht bestätigt. Dieselbe Zahlung prüfen.");
    attempt.orderId = data.order.id;
    attempt.amountCents = data.order.amountCents;
    attempt.eventName = data.order.eventName;
    persist(attempt);
  }
  // Always check before preparing again: the previous response may have been
  // lost after Stripe already charged the card and the webhook already ran.
  const row = await checkPosCard(attempt, request);
  if (row && isPaidCardOrder(row, attempt)) return row;
  if (attempt.cancelRequested || ["cancel_requested", "canceled"].includes(row?.pos_card_state || "")) throw new Error("Stornierung angefordert. Nur dieselbe Stornierung erneut pr?fen.");
  if (row?.status !== "PENDING_PAYMENT") throw new Error("Diese Zahlung muss geprüft werden. Bitte nicht erneut bezahlen.");
  if (!attempt.published) {
    const prepared = await prepareTerminalCheckout({ orderId: attempt.orderId!, username: attempt.username, userId: attempt.userId, role: attempt.role, eventName: attempt.eventName }, request);
    attempt.paymentIntentId = prepared.paymentIntentId;
    attempt.published = true;
    persist(attempt);
  }
  return row;
}

export function isCanceledCardOrder(order: OrderRow | null, attempt: CardAttempt) {
  return !!order && order.id === attempt.orderId && order.event_id === attempt.eventId && order.payment === "card"
    && order.status === "CANCELED" && order.pos_card_state === "canceled" && !order.paid_at
    && order.payment_error !== "POS_CARD_SUCCESS_AFTER_CANCEL";
}

export async function cancelPosCard(attempt: CardAttempt, persist: (attempt: CardAttempt) => void, request: typeof fetch = staffFetch) {
  if (!attempt.orderId) throw new Error("Bestellnummer fehlt. Zuerst dieselbe Bestellung pr?fen.");
  // Persist before the request: a lost response/reload must never auto-resume payment.
  attempt.cancelRequested = true;
  persist(attempt);
  const response = await request(`/api/orders/${encodeURIComponent(attempt.orderId)}/cancel-card-payment`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-staff-role": attempt.role, "x-staff-user-id": attempt.userId },
    body: JSON.stringify({ userId: attempt.userId, username: attempt.username, eventId: attempt.eventId }),
  });
  const data = await response.json();
  if (!response.ok || !data?.ok || !["canceled", "already_canceled", "cancellation_pending", "already_paid", "requires_review"].includes(data.outcome)
    || data.order?.id !== attempt.orderId || data.order?.event_id !== attempt.eventId || data.order?.payment !== "card") {
    throw new Error(data?.error || "Stornierung unklar. Dieselbe Stornierung erneut pr?fen.");
  }
  attempt.cancellationOutcome = data.outcome;
  persist(attempt);
  return data as { outcome: CancellationOutcome; order: OrderRow; reason?: string };
}
