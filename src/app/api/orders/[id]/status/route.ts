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

    const beforeRows = await sql`
      SELECT payment, UPPER(status) AS status, event_id, items
      FROM orders
      WHERE id = ${id}
      LIMIT 1
    `;

    if (!beforeRows || beforeRows.length === 0) {
      return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });
    }

    const previousRow = beforeRows[0] as {
      payment?: string;
      status?: string;
      event_id?: string | null;
      items?: Array<{ id?: string; qty?: number }>;
    };
    const previousStatus = String(previousRow.status || "");
    const payment = String(previousRow.payment || "").toLowerCase();
    const previousEventId = String(previousRow.event_id || "").trim();
    const previousItems = Array.isArray(previousRow.items) ? previousRow.items : [];

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
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
