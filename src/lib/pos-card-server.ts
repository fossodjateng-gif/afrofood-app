import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { makeNextOrderId } from "@/lib/order-number";
import { cardIdentityPayload, type CardIdentity } from "@/lib/pos-card-identity";
import { consumeItemAvailability, getPaymentConfig, getResolvedMenuSections, getStoreConfig } from "@/lib/menu-settings";
import { calculateOrderTotalCents, type PricedItem } from "@/lib/pricing";
import { publishOrderEvent } from "@/lib/order-events";

type CardRow = { id: string; event_id: string; event_name: string; items: PricedItem[]; amount_cents: number; status: string; pos_card_state: string; pos_card_fingerprint: string };

function result(row: CardRow, fingerprint: string) {
  if (row.pos_card_fingerprint !== fingerprint) return NextResponse.json({ ok: false, error: "Diese Kartenzahlung gehört zu einem anderen Warenkorb oder Kassenkontext." }, { status: 409 });
  if (row.pos_card_state !== "ready") return NextResponse.json({ ok: false, error: "Erstellung noch nicht bestätigt. Dieselbe Zahlung prüfen; keine neue Bestellung starten." }, { status: 409 });
  return NextResponse.json({ ok: true, order: { id: row.id, eventId: row.event_id, eventName: row.event_name, items: row.items, amountCents: row.amount_cents, payment: "card", status: row.status }, fingerprint });
}

export async function createPosCardOrder(input: CardIdentity & { key: string; fingerprint: string }) {
  const fingerprint = createHash("sha256").update(cardIdentityPayload(input)).digest("hex");
  if (input.fingerprint !== fingerprint) return NextResponse.json({ ok: false, error: "Invalid card fingerprint" }, { status: 400 });
  const existing = await sql`SELECT * FROM orders WHERE pos_card_key = ${input.key} LIMIT 1`;
  if (existing.length) return result(existing[0] as CardRow, fingerprint);
  const event = (await getStoreConfig()).events.find((entry) => entry.id === input.eventId);
  if (!event) return NextResponse.json({ ok: false, error: "Unknown POS event" }, { status: 400 });
  if (!(await getPaymentConfig(event.id)).cardEnabled) return NextResponse.json({ ok: false, error: "Card payment disabled" }, { status: 400 });
  const sections = await getResolvedMenuSections(event.id);
  const catalog = new Map(sections.flatMap((section) => section.items.map((item) => [item.id, { item, kind: section.id === "dips" ? "dip" as const : "regular" as const }] as const)));
  const items: PricedItem[] = [];
  const seen = new Set<string>();
  for (const item of input.items) {
    const product = catalog.get(item.id);
    if (!product?.item.visible || seen.has(item.id) || !Number.isSafeInteger(item.qty) || item.qty <= 0) return NextResponse.json({ ok: false, error: "Invalid POS card item" }, { status: 400 });
    seen.add(item.id);
    items.push({ id: item.id, qty: item.qty, name: product.item.name.de, price: product.item.price, pricingKind: product.kind });
  }
  const amount = calculateOrderTotalCents(items);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 2147483647) return NextResponse.json({ ok: false, error: "Invalid card amount" }, { status: 400 });
  let id = "";
  let claimed = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    id = await makeNextOrderId();
    const rows = await sql`
      INSERT INTO orders (id, event_id, event_name, payment, amount_cents, currency, status, items, pos_card_key, pos_card_fingerprint, pos_card_state, pos_card_user_id, pos_card_username)
      VALUES (${id}, ${event.id}, ${event.name}, 'card', ${amount}, 'eur', 'PENDING_PAYMENT', ${JSON.stringify(items)}::jsonb, ${input.key}, ${fingerprint}, 'creating', ${input.userId}, ${input.username.trim().toLowerCase()})
      ON CONFLICT DO NOTHING RETURNING *
    `;
    if (rows.length) { claimed = true; break; }
    const existing = await sql`SELECT * FROM orders WHERE pos_card_key = ${input.key} LIMIT 1`;
    if (existing.length) return result(existing[0] as CardRow, fingerprint);
  }
  if (!claimed) return NextResponse.json({ ok: false, error: "Bestellnummer nicht reserviert. Dieselbe Zahlung prüfen." }, { status: 409 });
  try {
    // Only the durable claim winner touches stock. Ambiguous writes remain
    // 'creating' for investigation rather than risking a second consumption.
    await consumeItemAvailability(items, event.id);
  } catch (error) {
    if (error instanceof Error && /^Item (unavailable|limited):/.test(error.message)) {
      await sql`UPDATE orders SET pos_card_state = 'failed', status = 'CANCELED' WHERE id = ${id}`;
      return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
    }
    throw error;
  }
  const ready = await sql`UPDATE orders SET pos_card_state = 'ready' WHERE id = ${id} RETURNING *`;
  publishOrderEvent({ type: "ORDER_CREATED", orderId: id, status: "PENDING_PAYMENT", at: Date.now() });
  return result(ready[0] as CardRow, fingerprint);
}
