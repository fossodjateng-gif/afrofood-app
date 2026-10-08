// Shared by both cash registers. No Stripe secret is returned to or persisted by
// this helper: the native SDK fetches its own short-lived client secret.
export async function prepareTerminalCheckout(input: { orderId: string; username: string; userId: string; role: string; eventName: string }, request: typeof fetch = fetch) {
  const response = await request("/api/stripe/terminal/payment-intent", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: input.orderId, includeClientSecret: false }),
  });
  const data = await response.json();
  if (!response.ok || !data?.ok || data.orderId !== input.orderId || !data.paymentIntentId) throw new Error(data?.error || "Kartenzahlung konnte nicht vorbereitet werden.");
  const publication = await request("/api/terminal-active-order", {
    method: "POST", headers: { "Content-Type": "application/json", "x-staff-role": input.role },
    body: JSON.stringify({ username: input.username, userId: input.userId, eventName: input.eventName, orderId: input.orderId, paymentIntentId: data.paymentIntentId }),
  });
  const published = await publication.json();
  if (!publication.ok || !published?.ok) throw new Error(published?.error || "Bestellung noch nicht auf dem iPhone verfügbar.");
  return { paymentIntentId: String(data.paymentIntentId), status: String(data.status || "") };
}
