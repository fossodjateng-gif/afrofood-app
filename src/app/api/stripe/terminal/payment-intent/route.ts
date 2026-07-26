import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { calculateOrderTotalCents } from "@/lib/pricing";
import { stripeGet, stripePost } from "@/lib/stripe-server";
import { ensureOrdersSchema } from "@/lib/orders-schema";

type PaymentIntentResponse = {
  id: string;
  client_secret: string;
  amount: number;
  currency: string;
  status: string;
  metadata?: Record<string, string>;
};

type OrderLike = {
  id: string;
  payment: string;
  status: string;
  items: Array<{ id?: string; name: string; qty: number; price?: number }>;
  stripe_payment_intent_id: string | null;
  amount_cents: number | null;
};

export async function POST(req: Request) {
  try {
    await ensureOrdersSchema();
    const body = await req.json().catch(() => ({}));
    const orderId = String(body?.orderId || "").trim();

    if (!orderId) {
      return NextResponse.json({ ok: false, error: "Missing orderId" }, { status: 400 });
    }

    const rows = await sql`
      SELECT id, payment, UPPER(status) AS status, items, stripe_payment_intent_id, amount_cents
      FROM orders
      WHERE id = ${orderId}
      LIMIT 1
    `;
    if (!rows || rows.length === 0) {
      return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });
    }

    const order = rows[0] as unknown as OrderLike;
    if (order.payment !== "card") {
      return NextResponse.json(
        { ok: false, error: "Order payment is not card" },
        { status: 400 }
      );
    }
    if (order.status !== "PENDING_PAYMENT") {
      return NextResponse.json(
        { ok: false, error: "Order is not waiting for payment" },
        { status: 400 }
      );
    }

    const storedAmountCents = Number(order.amount_cents || 0);
    const calculatedAmountCents = calculateOrderTotalCents(
      Array.isArray(order.items) ? order.items : []
    );
    const amountCents =
      Number.isFinite(storedAmountCents) && storedAmountCents > 0
        ? storedAmountCents
        : calculatedAmountCents;
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid amount" }, { status: 400 });
    }

    const existingPiId = String(order.stripe_payment_intent_id || "").trim();
    if (existingPiId) {
      const existingPi = await stripeGet<PaymentIntentResponse>(
        `/payment_intents/${encodeURIComponent(existingPiId)}`
      );
      const metadataOrderId = String(existingPi.metadata?.order_id || "").trim();
      if (metadataOrderId && metadataOrderId !== order.id) {
        return NextResponse.json(
          { ok: false, error: `PaymentIntent is linked to another order (${metadataOrderId})` },
          { status: 400 }
        );
      }
      if (!existingPi.client_secret) {
        return NextResponse.json(
          { ok: false, error: "Existing PaymentIntent has no client secret" },
          { status: 400 }
        );
      }
      if (Number(existingPi.amount) !== amountCents) {
        return NextResponse.json(
          { ok: false, error: `Amount mismatch: PI=${existingPi.amount} order=${amountCents}` },
          { status: 400 }
        );
      }

      await sql`
        UPDATE orders
        SET
          payment_provider = 'stripe',
          amount_cents = ${amountCents},
          currency = 'eur',
          payment_error = NULL
        WHERE id = ${order.id}
      `;

      return NextResponse.json({
        ok: true,
        reused: true,
        orderId: order.id,
        paymentIntentId: existingPi.id,
        clientSecret: existingPi.client_secret,
        amount: existingPi.amount,
        currency: existingPi.currency,
        status: existingPi.status,
      });
    }

    const pi = await stripePost<PaymentIntentResponse>("/payment_intents", {
      amount: amountCents,
      currency: "eur",
      "payment_method_types[0]": "card_present",
      capture_method: "automatic",
      "metadata[order_id]": order.id,
    });

    await sql`
      UPDATE orders
      SET
        payment_provider = 'stripe',
        stripe_payment_intent_id = ${pi.id},
        amount_cents = ${amountCents},
        currency = 'eur',
        payment_error = NULL
      WHERE id = ${order.id}
    `;

    return NextResponse.json({
      ok: true,
      reused: false,
      orderId: order.id,
      paymentIntentId: pi.id,
      clientSecret: pi.client_secret,
      amount: pi.amount,
      currency: pi.currency,
      status: pi.status,
    });
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
