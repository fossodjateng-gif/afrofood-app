import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { publishOrderEvent } from "@/lib/order-events";
import { ensureOrdersSchema } from "@/lib/orders-schema";
import { stripeGet } from "@/lib/stripe-server";

type StripePaymentIntent = {
  id?: string;
  status?: string;
  amount_received?: number;
  amount?: number;
  currency?: string;
  metadata?: Record<string, string>;
};

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await ensureOrdersSchema();
    const { id: rawId } = await context.params;
    const orderId = String(rawId || "").trim();
    const body = await req.json().catch(() => ({}));
    const inputPi = String(body?.paymentIntentId || "").trim();

    if (!orderId) {
      return NextResponse.json({ ok: false, error: "Missing order id" }, { status: 400 });
    }

    const rows = await sql`
      SELECT id, payment, UPPER(status) AS status, amount_cents, stripe_payment_intent_id
      FROM orders
      WHERE id = ${orderId}
      LIMIT 1
    `;
    if (!rows || rows.length === 0) {
      return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });
    }

    const row = rows[0] as {
      id: string;
      payment: string;
      status: string;
      amount_cents: number | null;
      stripe_payment_intent_id: string | null;
    };

    if (row.payment !== "card") {
      return NextResponse.json(
        { ok: false, error: "Order payment is not card" },
        { status: 400 }
      );
    }
    if (row.status !== "PENDING_PAYMENT") {
      return NextResponse.json(
        { ok: false, error: "Order is not waiting for payment" },
        { status: 400 }
      );
    }

    const piId = inputPi || String(row.stripe_payment_intent_id || "").trim();
    if (!piId) {
      return NextResponse.json(
        { ok: false, error: "Missing payment intent id" },
        { status: 400 }
      );
    }

    const pi = await stripeGet<StripePaymentIntent>(`/payment_intents/${encodeURIComponent(piId)}`);
    if (String(pi.status || "") !== "succeeded") {
      return NextResponse.json(
        { ok: false, error: `PaymentIntent ${piId} is not succeeded (${pi.status || "unknown"})` },
        { status: 400 }
      );
    }

    const metadataOrderId = String(pi.metadata?.order_id || "").trim();
    if (metadataOrderId && metadataOrderId !== orderId) {
      return NextResponse.json(
        { ok: false, error: `PaymentIntent is linked to another order (${metadataOrderId})` },
        { status: 400 }
      );
    }

    const amountReceived = Number(pi.amount_received ?? pi.amount ?? 0);
    if (
      Number.isFinite(amountReceived) &&
      amountReceived > 0 &&
      Number.isFinite(Number(row.amount_cents)) &&
      Number(row.amount_cents) > 0 &&
      amountReceived !== Number(row.amount_cents)
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: `Amount mismatch: PI=${amountReceived} order=${Number(row.amount_cents)}`,
        },
        { status: 400 }
      );
    }

    const updated = await sql`
      UPDATE orders
      SET
        payment_provider = 'stripe',
        stripe_payment_intent_id = ${piId},
        paid_at = COALESCE(paid_at, NOW()),
        payment_error = NULL,
        status = 'NEW'
      WHERE id = ${orderId}
      RETURNING id, created_at, customer_name, payment, UPPER(status) AS status, items
    `;

    publishOrderEvent({
      type: "ORDER_STATUS_CHANGED",
      orderId,
      at: Date.now(),
      status: "NEW",
      previousStatus: "PENDING_PAYMENT",
    });
    publishOrderEvent({
      type: "PAYMENT_VALIDATED",
      orderId,
      at: Date.now(),
      status: "NEW",
      previousStatus: "PENDING_PAYMENT",
    });

    return NextResponse.json({
      ok: true,
      order: updated?.[0] || null,
      paymentIntentId: piId,
      paymentStatus: pi.status || null,
    });
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}

