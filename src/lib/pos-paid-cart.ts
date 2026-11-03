import { cardAttemptKey, isPaidCardOrder, type CardAttempt } from "@/lib/pos-card";
import { posCartKey, readPosCart } from "@/lib/pos-cart";
import type { OrderRow } from "@/lib/schema";

export type PaidCardReference = Pick<CardAttempt, "key" | "userId" | "username" | "eventId" | "workstationId" | "orderId" | "amountCents" | "paymentIntentId">;
type Context = { userId: string; eventId: string; workstationId?: string };
export const paidCardKey = (cartKey: string) => `${cartKey}:paid-card-order`;
export function readPaidCard(cartKey: string): PaidCardReference | null {
  try { return JSON.parse(localStorage.getItem(paidCardKey(cartKey)) || "null"); } catch { return null; }
}

export function clearPaidPosCard(attempt: CardAttempt, row: OrderRow, context: Context) {
  if (context.userId !== attempt.userId || context.eventId !== attempt.eventId || context.workstationId !== attempt.workstationId
    || !isPaidCardOrder(row, attempt)) return false;
  const key = posCartKey(attempt.userId, attempt.eventId, attempt.workstationId);
  const stored: CardAttempt | null = JSON.parse(localStorage.getItem(cardAttemptKey(key)) || "null");
  if (!stored) return readPaidCard(key)?.key === attempt.key && readPaidCard(key)?.orderId === row.id;
  if (stored.key !== attempt.key || stored.orderId !== row.id || stored.fingerprint !== attempt.fingerprint
    || stored.userId !== context.userId || stored.eventId !== context.eventId || stored.workstationId !== context.workstationId) return false;
  const reference: PaidCardReference = { key: attempt.key, userId: attempt.userId, username: attempt.username,
    eventId: attempt.eventId, workstationId: attempt.workstationId, orderId: row.id,
    amountCents: row.amount_cents!, paymentIntentId: row.stripe_payment_intent_id! };
  // Persist only the identity needed to reload the server receipt, before removing the attempt.
  localStorage.setItem(paidCardKey(key), JSON.stringify(reference));
  if (JSON.stringify(readPosCart(key)) === JSON.stringify(attempt.items)) localStorage.removeItem(key);
  localStorage.removeItem(cardAttemptKey(key));
  return true;
}
