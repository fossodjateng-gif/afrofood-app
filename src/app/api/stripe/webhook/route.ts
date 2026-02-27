import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { publishOrderEvent } from "@/lib/order-events";
import { ensureOrdersSchema } from "@/lib/orders-schema";

type StripeEvent = {
  id: string;
  type: string;
  data?: {
    object?: {
      id?: string;
      metadata?: Record<string, string>;
      status?: string;
    };
  };
};

function ignored(reason: string, diagnostic?: Record<string, string | null>) {
  return NextResponse.json({
    ok: true,
    ignored: true,
    reason,
    diagnostic: diagnostic || {},
  });
}

function verifyStripeSignature(payload: string, signatureHeader: string, secret: string) {
  const parts = signatureHeader.split(",").map((p) => p.trim());
  const t = parts.find((p) => p.startsWith("t="))?.slice(2);
  const v1 = parts.find((p) => p.startsWith("v1="))?.slice(3);

  if (!t || !v1) return false;
  const signedPayload = `${t}.${payload}`;
  const expected = crypto.createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(v1, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

async function findOrderIdFromPaymentIntent(piId: string) {
  const rows = await sql`
    SELECT id
    FROM orders
    WHERE stripe_payment_intent_id = ${piId}
    LIMIT 1
  `;
  if (!rows || rows.length === 0) return null;
  return String((rows[0] as { id: string }).id);
}

export async function POST(req: Request) {
  try {
    await ensureOrdersSchema();
    const payload = await req.text();
    const signature = req.headers.get("stripe-signature") || "";
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

    if (webhookSecret) {
      const ok = verifyStripeSignature(payload, signature, webhookSecret);
      if (!ok) {
        return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 400 });
      }
    }

    const event = JSON.parse(payload) as StripeEvent;
    if (event.type !== "payment_intent.succeeded") {
      return ignored("unsupported_event_type", {
        eventId: String(event.id || "") || null,
        eventType: String(event.type || "") || null,
      });
    }

    const obj = event.data?.object || {};
    const piId = String(obj.id || "");
    const metadataOrderId = String(obj.metadata?.order_id || "").trim();
    const orderId = metadataOrderId || (piId ? await findOrderIdFromPaymentIntent(piId) : null);

    if (!orderId) {
      const reason = metadataOrderId
        ? "metadata_order_not_found"
        : piId
        ? "payment_intent_not_linked"
        : "missing_payment_intent_id";
      return ignored(reason, {
        eventId: String(event.id || "") || null,
        paymentIntentId: piId || null,
        metadataOrderId: metadataOrderId || null,
      });
    }

    const beforeRows = await sql`
      SELECT UPPER(status) AS status
      FROM orders
      WHERE id = ${orderId}
      LIMIT 1
    `;
    if (!beforeRows || beforeRows.length === 0) {
      return ignored("missing_order", {
        eventId: String(event.id || "") || null,
        paymentIntentId: piId || null,
        orderId,
      });
    }
    const previousStatus = String((beforeRows[0] as { status?: string }).status || "");

    await sql`
      UPDATE orders
      SET
        payment_provider = 'stripe',
        stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, ${piId}),
        paid_at = COALESCE(paid_at, NOW()),
        payment_error = NULL,
        status = CASE WHEN UPPER(status) = 'PENDING_PAYMENT' THEN 'NEW' ELSE status END
      WHERE id = ${orderId}
    `;

    const afterRows = await sql`
      SELECT UPPER(status) AS status
      FROM orders
      WHERE id = ${orderId}
      LIMIT 1
    `;
    const status = String((afterRows[0] as { status?: string }).status || "");

    if (status !== previousStatus) {
      publishOrderEvent({
        type: "ORDER_STATUS_CHANGED",
        orderId,
        at: Date.now(),
        status,
        previousStatus,
      });
    }
    if (previousStatus === "PENDING_PAYMENT" && status === "NEW") {
      publishOrderEvent({
        type: "PAYMENT_VALIDATED",
        orderId,
        at: Date.now(),
        status,
        previousStatus,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
