import { ensureOrdersSchema } from "@/lib/orders-schema";
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { publishOrderEvent } from "@/lib/order-events";
import { restoreItemAvailability } from "@/lib/menu-settings";

type OrderStatus = "PENDING_PAYMENT" | "NEW" | "IN_PROGRESS" | "READY" | "DONE" | "CANCELED";

const VALID_STATUSES = new Set<OrderStatus>([
  "PENDING_PAYMENT",
  "NEW",
  "IN_PROGRESS",
  "READY",
  "DONE",
  "CANCELED",
]);

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await context.params;
    const id = String(rawId || "").trim();
    const body = await req.json();
    const status = String(body?.status || "").toUpperCase() as OrderStatus;

    if (!id) {
      return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
    }
    if (!VALID_STATUSES.has(status)) {
      return NextResponse.json({ ok: false, error: "Invalid status" }, { status: 400 });
    }

    await ensureOrdersSchema();
    const beforeRows = await sql`
      SELECT payment, UPPER(status) AS status, event_id, items, amount_cents, cash_received_cents, change_given_cents, pos_cash_key, pos_cash_state
      FROM orders
      WHERE id = ${id}
      LIMIT 1
    `;

    if (!beforeRows || beforeRows.length === 0) {
      return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });
    }

    const previousRow = beforeRows[0] as {
      amount_cents?: number | null;
      cash_received_cents?: number | null;
      change_given_cents?: number | null;
      pos_cash_key?: string | null;
      pos_cash_state?: string | null;
      payment?: string;
      status?: string;
      event_id?: string | null;
      items?: Array<{ id?: string; qty?: number }>;
    };
    const previousStatus = String(previousRow.status || "");
    const payment = String(previousRow.payment || "").toLowerCase();
    const previousEventId = String(previousRow.event_id || "").trim();
    const previousItems = Array.isArray(previousRow.items) ? previousRow.items : [];


    if (body.cashReceivedCents !== undefined || (previousRow.pos_cash_key && status === "NEW" && previousStatus === "PENDING_PAYMENT")) {
      const received = body.cashReceivedCents;
      const amount = previousRow.amount_cents;
      if (payment !== "cash" || status !== "NEW" || !Number.isSafeInteger(received) || received < 0 || received > 2147483647 || typeof amount !== "number" || received < amount) {
        return NextResponse.json({ ok: false, error: "Invalid or insufficient cash received" }, { status: 400 });
      }
      if (previousRow.pos_cash_key && previousRow.pos_cash_state !== "ready") {
        return NextResponse.json({ ok: false, error: "Order creation not yet confirmed" }, { status: 409 });
      }
      // An acknowledgement lost after payment must not move a kitchen order
      // back to NEW, change its receipt, or publish payment twice.
      if (previousRow.cash_received_cents != null) {
        const paid = await sql`SELECT * FROM orders WHERE id = ${id} LIMIT 1`;
        return NextResponse.json({ ok: true, order: paid[0] });
      }
      if (previousStatus !== "PENDING_PAYMENT") return NextResponse.json({ ok: false, error: "Order is not awaiting cash payment" }, { status: 409 });
      const paid = await sql`
        UPDATE orders SET status = 'NEW', cash_received_cents = ${received}, change_given_cents = ${received - amount}, paid_at = NOW()
        WHERE id = ${id} AND payment = 'cash' AND UPPER(status) = 'PENDING_PAYMENT' AND cash_received_cents IS NULL
        RETURNING *
      `;
      if (!paid.length) {
        const current = await sql`SELECT * FROM orders WHERE id = ${id} LIMIT 1`;
        if (current[0]?.cash_received_cents != null) return NextResponse.json({ ok: true, order: current[0] });
        return NextResponse.json({ ok: false, error: "Order changed during confirmation" }, { status: 409 });
      }
      publishOrderEvent({ type: "ORDER_STATUS_CHANGED", orderId: id, at: Date.now(), status: "NEW", previousStatus });
      publishOrderEvent({ type: "PAYMENT_VALIDATED", orderId: id, at: Date.now(), status: "NEW", previousStatus });
      return NextResponse.json({ ok: true, order: paid[0] });
    }

    if (payment === "card" && previousStatus === "PENDING_PAYMENT" && status === "NEW") {
      return NextResponse.json(
        {
          ok: false,
          error: "Card orders must be validated by Stripe Terminal webhook",
        },
        { status: 403 }
      );
    }

    const rows = await sql`
      UPDATE orders
      SET status = ${status}
      WHERE id = ${id}
      RETURNING id, created_at, customer_name, payment, UPPER(status) AS status, items
    `;

    if (!rows || rows.length === 0) {
      return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });
    }

    publishOrderEvent({
      type: "ORDER_STATUS_CHANGED",
      orderId: id,
      at: Date.now(),
      status,
      previousStatus,
    });

    if (previousStatus === "PENDING_PAYMENT" && status === "NEW") {
      publishOrderEvent({
        type: "PAYMENT_VALIDATED",
        orderId: id,
        at: Date.now(),
        status,
        previousStatus,
      });
    }
    if (status === "READY") {
      publishOrderEvent({
        type: "ORDER_READY",
        orderId: id,
        at: Date.now(),
        status,
        previousStatus,
      });
    }
    if (status === "DONE") {
      publishOrderEvent({
        type: "ORDER_DONE",
        orderId: id,
        at: Date.now(),
        status,
        previousStatus,
      });
    }

    if (status === "CANCELED" && previousStatus !== "CANCELED") {
      await restoreItemAvailability(previousItems, previousEventId || undefined);
    }

    return NextResponse.json({ ok: true, order: rows[0] });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
