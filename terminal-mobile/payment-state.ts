type PaidOrder = {
  id: string; status: string; payment: string; payment_provider?: string | null;
  paid_at?: string | null; stripe_payment_intent_id?: string | null;
  amount_cents?: number | null; currency?: string | null;
};
export function isVerifiedNativePayment(order: PaidOrder | null, expected: {
  orderId: string; paymentIntentId: string; amountCents?: number | null; currency?: string | null;
}): boolean {
  return !!order && ["NEW", "IN_PROGRESS", "READY", "DONE"].includes(order.status)
    && order.id === expected.orderId && order.payment === "card" && order.payment_provider === "stripe"
    && !!order.paid_at && !!expected.paymentIntentId && order.stripe_payment_intent_id === expected.paymentIntentId
    && Number.isSafeInteger(expected.amountCents) && Number(expected.amountCents) > 0
    && order.amount_cents === expected.amountCents && order.currency === "eur" && expected.currency === "eur";
}
export function nativeErrorMessage(error: unknown, fallback: string): string {
  return error && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message : fallback;
}
export async function revokeNativeSession(request: () => Promise<{ ok: boolean }>): Promise<void> {
  if (!(await request()).ok) throw new Error("Logout not confirmed");
}
