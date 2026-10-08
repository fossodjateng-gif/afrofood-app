import type { OrderRow } from "@/lib/schema";
import type { PosCartItem } from "@/lib/pos-cart";

export type CashAttempt = { key: string; eventId: string; eventName: string; userId: string; role: string; items: PosCartItem[]; amountCents: number; orderId?: string };
export type CashReceipt = OrderRow & { amount_cents: number; cash_received_cents: number; change_given_cents: number };
export const cashAttemptKey = (cartKey: string) => `${cartKey}:cash-attempt`;

export function parseReceivedCents(value: string): number | null {
  if (!/^\d+(?:[.,]\d{0,2})?$/.test(value.trim())) return null;
  const [euros, cents = ""] = value.trim().replace(",", ".").split(".");
  const amount = Number(euros) * 100 + Number(cents.padEnd(2, "0"));
  return Number.isSafeInteger(amount) && amount <= 2147483647 ? amount : null;
}

export function quickCashAmounts(totalCents: number) {
  return [...new Set([totalCents, 1000, 2000, 5000, 10000])].filter((amount) => amount >= totalCents);
}

export async function confirmPosCash(attempt: CashAttempt, received: number, persist: (attempt: CashAttempt) => void, request: typeof fetch = fetch): Promise<CashReceipt> {
  if (!Number.isSafeInteger(received) || received < attempt.amountCents) throw new Error("Der erhaltene Betrag ist zu niedrig.");
  if (!attempt.orderId) {
    const response = await request("/api/orders", { method: "POST", headers: { "Content-Type": "application/json", "x-staff-role": attempt.role }, body: JSON.stringify({ eventId: attempt.eventId, eventName: attempt.eventName, payment: "cash", posCashKey: attempt.key, items: attempt.items }) });
    const data = await response.json();
    if (!response.ok || !data.ok) throw Object.assign(new Error(data.error || "Die Bestellung konnte nicht erstellt werden."), { retryable: data.retryable === true });
    if (!data.order?.id || !Number.isSafeInteger(data.order.amountCents)) throw new Error("Ungültige Serverantwort. Dieselbe Zahlung erneut prüfen.");
    attempt.orderId = data.order.id;
    attempt.amountCents = data.order.amountCents;
    persist(attempt);
    if (received < attempt.amountCents) throw new Error("Der Serverbetrag wurde aktualisiert. Bitte den erhaltenen Betrag prüfen.");
  }
  if (!attempt.orderId) throw new Error("Die Bestellung konnte nicht bestätigt werden.");
  const response = await request(`/api/orders/${encodeURIComponent(attempt.orderId)}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "NEW", cashReceivedCents: received }) });
  const data = await response.json();
  if (!response.ok || !data.ok || data.order?.id !== attempt.orderId || !["NEW", "IN_PROGRESS", "READY", "DONE"].includes(data.order?.status) || !Number.isSafeInteger(data.order?.amount_cents) || !Number.isSafeInteger(data.order?.cash_received_cents) || !Number.isSafeInteger(data.order?.change_given_cents) || data.order.cash_received_cents < data.order.amount_cents || data.order.change_given_cents !== data.order.cash_received_cents - data.order.amount_cents) throw new Error(data.error || "Die Barzahlung konnte nicht bestätigt werden. Dieselbe Zahlung erneut prüfen.");
  return data.order;
}
