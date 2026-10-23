import { requireCashierWrite } from "@/lib/cashier-write-context";
import { ensureOrdersSchema } from "@/lib/orders-schema";
import { NextResponse } from "next/server";
import { requireStaffWorkstation, requireStaffOrigin, staffSessionHash, StaffAuthError } from "@/lib/staff-session-server";
import { canAccessStaffEvent, canUseCashRegister } from "@/lib/staff-permissions";
import { recordCashRegisterRequest } from "@/lib/staff-action-server";
import { sql } from "@/lib/db";
import { publishOrderEvent } from "@/lib/order-events";
import { finalizeSale } from "@/lib/finalize-sale";

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

    requireStaffOrigin(req);
    const actor = await requireStaffWorkstation(req);
    const displayedActor = req.headers.get("x-staff-user-id");
    if (displayedActor && displayedActor !== actor.id) throw new StaffAuthError("cashier_changed", 409);
    await ensureOrdersSchema();
    const beforeRows = await sql`
      SELECT payment, UPPER(status) AS status, event_id, items, amount_cents, cash_received_cents, change_given_cents, pos_cash_key, pos_cash_state, pos_card_key
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
      pos_card_key?: string | null;
      payment?: string;
      status?: string;
      event_id?: string | null;
      items?: Array<{ id?: string; qty?: number }>;
    };
    const paymentContext = status === "NEW" ? await requireCashierWrite(req, previousRow.event_id || "", body.workstationId) : undefined;
    const previousStatus = String(previousRow.status || "");
    const payment = String(previousRow.payment || "").toLowerCase();
    if (!canAccessStaffEvent(actor, previousRow.event_id || "") || ((status === "NEW" || status === "CANCELED") && !canUseCashRegister(actor))) throw new StaffAuthError("cash_register_forbidden", 403);
    await recordCashRegisterRequest(actor.id, `order_status_requested:${status}`, previousRow.event_id || "", id);



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
      const finalized = await finalizeSale(id, { payment: "cash", received }, paymentContext);
      if (!finalized.changed) {
        if (finalized.order?.cash_received_cents != null) return NextResponse.json({ ok: true, order: finalized.order });
        return NextResponse.json({ ok: false, error: "Order changed during confirmation" }, { status: 409 });
      }
      publishOrderEvent({ type: "ORDER_STATUS_CHANGED", orderId: id, at: Date.now(), status: "NEW", previousStatus });
      publishOrderEvent({ type: "PAYMENT_VALIDATED", orderId: id, at: Date.now(), status: "NEW", previousStatus });
      return NextResponse.json({ ok: true, order: finalized.order });
    }

    if (payment === "card" && ((previousStatus === "PENDING_PAYMENT" && ["NEW", "IN_PROGRESS", "READY", "DONE"].includes(status)) || (previousRow.pos_card_key && status === "CANCELED"))) {
      return NextResponse.json(
        {
          ok: false,
          error: "Card orders must be validated by Stripe Terminal webhook",
        },
        { status: 403 }
      );
    }

    if (status === "NEW" && (payment === "cash" || payment === "cashless")) {
      const finalized = await finalizeSale(id, { payment }, paymentContext);
      if (finalized.changed) {
        publishOrderEvent({ type: "ORDER_STATUS_CHANGED", orderId: id, at: Date.now(), status: "NEW", previousStatus });
        publishOrderEvent({ type: "PAYMENT_VALIDATED", orderId: id, at: Date.now(), status: "NEW", previousStatus });
      }
      if (!finalized.changed && (!finalized.order || !["NEW", "IN_PROGRESS", "READY", "DONE"].includes(finalized.order.status))) {
        return NextResponse.json({ ok: false, error: "Order is not awaiting payment" }, { status: 409 });
      }
      return NextResponse.json({ ok: true, order: finalized.order });
    }
    // Payment transitions are one-way; kitchen/status actions cannot reopen a sale.
    if (status === "PENDING_PAYMENT" || (previousStatus === "PENDING_PAYMENT" && status !== "CANCELED") || (previousStatus === "CANCELED" && status !== "CANCELED")) {
      return NextResponse.json({ ok: false, error: "Invalid order transition" }, { status: 409 });
    }

    const transition = await sql.transaction([
      sql`SELECT af_assert_staff_assignment(${staffSessionHash(req)}, ${actor.id}, ${previousRow.event_id || ""}, ${actor.workstationId || null})`,
      sql`
      UPDATE orders
      SET status = ${status}
      WHERE id = ${id} AND UPPER(status) = ${previousStatus}
      RETURNING id, created_at, customer_name, payment, UPPER(status) AS status, items
    `], { isolationLevel: "ReadCommitted" });
    const rows = transition[1];

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

    // Cancellation/refund never automatically increases an informative counter.

    return NextResponse.json({ ok: true, order: rows[0] });
  } catch (e: unknown) {
    if (e instanceof StaffAuthError) return NextResponse.json({ ok: false, error: e.code }, { status: e.status });
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
