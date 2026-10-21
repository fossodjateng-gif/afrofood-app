import { makeNextOrderId } from "@/lib/order-number";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getPaymentConfig, getResolvedMenuSections } from "@/lib/menu-settings";
import { calculateOrderTotalCents, type PricedItem } from "@/lib/pricing";
import { publishOrderEvent } from "@/lib/order-events";

type CashRow = { id: string; event_id: string; event_name: string | null; amount_cents: number; items: PricedItem[]; pos_cash_state: string; pos_cash_fingerprint: string; status: string; created_by?: string | null };

function result(row: CashRow, fingerprint: string, actorId?: string) {
  if (row.created_by && row.created_by !== actorId) return NextResponse.json({ ok: false, error: "cashier_context_mismatch" }, { status: 403 });
  if (row.pos_cash_fingerprint !== fingerprint) return NextResponse.json({ ok: false, error: "Diese Zahlung gehört zu einem anderen Warenkorb." }, { status: 409 });
  if (row.pos_cash_state !== "ready") return NextResponse.json({ ok: false, retryable: row.pos_cash_state === "failed", error: row.pos_cash_state === "failed" ? "Artikel nicht verfügbar. Bitte das Menü aktualisieren." : "Die Erstellung konnte noch nicht bestätigt werden. Erneut prüfen; keine zweite Bestellung starten." }, { status: 409 });
  return NextResponse.json({ ok: true, order: { id: row.id, eventId: row.event_id, eventName: row.event_name, amountCents: row.amount_cents, items: row.items, payment: "cash", status: row.status } });
}

export async function createPosCashOrder(input: { key: string; eventId: string; eventName: string | null; items: PricedItem[]; actor?: { id: string; username: string } }) {
  const fingerprint = createHash("sha256").update(JSON.stringify({ eventId: input.eventId, items: input.items.map((item) => ({ id: item.id, qty: item.qty })) })).digest("hex");
  const existing = await sql`SELECT * FROM orders WHERE pos_cash_key = ${input.key} LIMIT 1`;
  if (existing.length) return result(existing[0] as CashRow, fingerprint, input.actor?.id);
  if (!(await getPaymentConfig(input.eventId)).cashEnabled) return NextResponse.json({ ok: false, retryable: true, error: "Cash payment disabled" }, { status: 400 });
  const sections = await getResolvedMenuSections(input.eventId);
  const catalog = new Map(sections.flatMap((section) => section.items.map((item) => [item.id, { item, kind: section.id === "dips" ? "dip" as const : "regular" as const }] as const)));
  const items: PricedItem[] = [];
  for (const item of input.items) {
    const product = catalog.get(String(item?.id || ""));
    if (!product?.item.visible || product.item.availability?.status === "blocked" || !Number.isSafeInteger(item.qty) || item.qty <= 0) return NextResponse.json({ ok: false, retryable: true, error: "Invalid order item" }, { status: 400 });
    items.push({ ...item, name: product.item.name.de, price: product.item.price, pricingKind: product.kind });
  }
  const amount = calculateOrderTotalCents(items);
  let id = "";
  // The unique durable claim makes retries reuse the same pending sale.
  let claimed = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    id = await makeNextOrderId();
    const rows = await sql`
      INSERT INTO orders (id, event_id, event_name, payment, amount_cents, currency, status, items, pos_cash_key, pos_cash_fingerprint, pos_cash_state, quantity_applied, created_by, created_by_username)
      VALUES (${id}, ${input.eventId}, ${input.eventName}, 'cash', ${amount}, 'eur', 'PENDING_PAYMENT', ${JSON.stringify(items)}::jsonb, ${input.key}, ${fingerprint}, 'creating', FALSE, ${input.actor?.id || null}, ${input.actor?.username || null})
      ON CONFLICT DO NOTHING RETURNING *
    `;
    if (rows.length) { claimed = true; break; }
    const existing = await sql`SELECT * FROM orders WHERE pos_cash_key = ${input.key} LIMIT 1`;
    if (existing.length) return result(existing[0] as CashRow, fingerprint, input.actor?.id);
    // Another order took the daily number. Re-read the shared sequence;
    // No quantity is consumed during order creation.
  }
  if (!claimed) return NextResponse.json({ ok: false, error: "Bestellnummer konnte nicht reserviert werden. Dieselbe Zahlung erneut versuchen." }, { status: 409 });
  const ready = await sql`UPDATE orders SET pos_cash_state = 'ready' WHERE id = ${id} RETURNING *`;
  publishOrderEvent({ type: "ORDER_CREATED", orderId: id, status: "PENDING_PAYMENT", at: Date.now() });
  return result(ready[0] as CashRow, fingerprint, input.actor?.id);
}
