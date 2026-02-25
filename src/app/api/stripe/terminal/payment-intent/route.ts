import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { calculateOrderTotalCents } from "@/lib/pricing";
import { stripePost } from "@/lib/stripe-server";

type PaymentIntentResponse = {
  id: string;
  client_secret: string;
  amount: number;
  currency: string;
  status: string;
};

type OrderLike = {
  id: string;
  payment: string;
  status: string;
  items: Array<{ id?: string; name: string; qty: number; price?: number }>;
};

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const orderId = String(body?.orderId || "").trim();

    if (!orderId) {
      return NextResponse.json({ ok: false, error: "Missing orderId" }, { status: 400 });
    }

    const rows = await sql`
      SELECT id, payment, UPPER(status) AS status, items
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

    const amountCents = calculateOrderTotalCents(Array.isArray(order.items) ? order.items : []);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid amount" }, { status: 400 });
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
