import { finalizeSale } from "@/lib/finalize-sale";
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
    if (process.env.AFROFOOD_ENABLE_STRIPE_CONFIRM_FALLBACK !== "true") {
      return NextResponse.json(
        {
          ok: false,
          error: "Manual Stripe confirmation is disabled. Use Tap to Pay Terminal.",
        },
        { status: 403 }
      );
    }

    await ensureOrdersSchema();
    const { id: rawId } = await context.params;
    const orderId = String(rawId || "").trim();
    const body = await req.json().catch(() => ({}));
    const inputPi = String(body?.paymentIntentId || "").trim();

    if (!orderId) {
      return NextResponse.json({ ok: false, error: "Missing order id" }, { status: 400 });
    }

    const rows = await sql`
      SELECT id, payment, UPPER(status) AS status, amount_cents, stripe_payment_intent_id, pos_card_key, currency
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
      currency: string;
      pos_card_key?: string | null;
    };

    if (row.pos_card_key) {
      return NextResponse.json({ ok: false, error: "POS card payments require the Stripe webhook" }, { status: 403 });
    }
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

    const existingPiRows = await sql`
      SELECT id
      FROM orders
      WHERE stripe_payment_intent_id = ${piId}
      LIMIT 1
    `;
    if (existingPiRows && existingPiRows.length > 0) {
      const linkedOrderId = String((existingPiRows[0] as { id: string }).id || "");
      if (linkedOrderId && linkedOrderId !== orderId) {
        return NextResponse.json(
          { ok: false, error: `PaymentIntent already linked to order ${linkedOrderId}` },
          { status: 400 }
        );
      }
    }

    const pi = await stripeGet<StripePaymentIntent>(`/payment_intents/${encodeURIComponent(piId)}`);
    if (String(pi.status || "") !== "succeeded") {
      return NextResponse.json(
        { ok: false, error: `PaymentIntent ${piId} is not succeeded (${pi.status || "unknown"})` },
        { status: 400 }
      );
    }

    const metadataOrderId = String(pi.metadata?.order_id || "").trim();
    if (metadataOrderId !== orderId || pi.currency !== row.currency || row.stripe_payment_intent_id !== piId) {
      return NextResponse.json(
        { ok: false, error: `PaymentIntent is linked to another order (${metadataOrderId})` },
        { status: 400 }
      );
    }

    const amountReceived = Number(pi.amount_received ?? pi.amount ?? 0);
    if (!Number.isSafeInteger(amountReceived) || amountReceived <= 0 || amountReceived !== row.amount_cents) {
      return NextResponse.json({ ok: false, error: "Amount mismatch" }, { status: 400 });
    }

    const finalized = await finalizeSale(orderId, { payment: "card", paymentIntentId: piId, amountReceived, currency: pi.currency! });
    if (!finalized.changed) return NextResponse.json({ ok: false, error: "Order changed during confirmation" }, { status: 409 });

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
      order: finalized.order || null,
      paymentIntentId: piId,
      paymentStatus: pi.status || null,
    });
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
