import { cartSnapshot, clearCartIfUnchanged, withCartLock } from "@/lib/cart";
import type { OrderRow } from "@/lib/schema";

export const CART_ORDER_KEY = "af_cart_order_v1";
type CartOrder = { orderId: string; eventId: string; payment: string; amountCents: number; revision: string; fingerprint: string };

// Only consume server order rows. Kitchen status alone is not payment proof.
export function isConfirmedPaidOrder(row: OrderRow) {
  return !!row.paid_at && Number.isFinite(Date.parse(row.paid_at))
    && ["NEW", "IN_PROGRESS", "READY", "DONE"].includes(row.status)
    && Number.isSafeInteger(row.amount_cents) && Number(row.amount_cents) > 0 && row.currency === "eur"
    && (row.payment === "cash" || row.payment === "cashless"
      || row.payment === "card" && row.payment_provider === "stripe" && !!row.stripe_payment_intent_id);
}

export function rememberCartOrder(order: { id: string; eventId?: string; payment: string; amountCents?: number }, snapshot: ReturnType<typeof cartSnapshot>) {
  if (!order.eventId || !Number.isSafeInteger(order.amountCents)) return;
  const association: CartOrder = { orderId: order.id, eventId: order.eventId, payment: order.payment,
    amountCents: order.amountCents!, revision: snapshot.revision, fingerprint: snapshot.fingerprint };
  return withCartLock(() => localStorage.setItem(CART_ORDER_KEY, JSON.stringify(association)));
}

export function readCartOrder(): CartOrder | null {
  try { return JSON.parse(localStorage.getItem(CART_ORDER_KEY) || "null"); } catch { return null; }
}

export function clearConfirmedCart(row: OrderRow) {
  if (!isConfirmedPaidOrder(row)) return Promise.resolve(false);
  return withCartLock(() => {
    const association = readCartOrder();
    if (!association || row.id !== association.orderId
      || row.event_id !== association.eventId || row.payment !== association.payment || row.amount_cents !== association.amountCents
      || localStorage.getItem("af_event_id") !== association.eventId) return false;
    const matches = clearCartIfUnchanged(association);
    // Keep af_last_order_id: receipts reload from the server, independently of the basket.
    localStorage.removeItem(CART_ORDER_KEY);
    return matches;
  }, () => false);
}

// Used by /menu too: a customer may return there without revisiting /cart.
export async function reconcilePaidCart(request: typeof fetch = fetch) {
  const association = readCartOrder();
  if (!association) return;
  try {
    const response = await request(`/api/orders?id=${encodeURIComponent(association.orderId)}`, { cache: "no-store" });
    const rows = await response.json();
    if (response.ok && Array.isArray(rows) && rows.length === 1 && rows[0].id === association.orderId) await clearConfirmedCart(rows[0]);
  } catch { /* Unknown payment: retain the basket and retry on the next navigation. */ }
}
