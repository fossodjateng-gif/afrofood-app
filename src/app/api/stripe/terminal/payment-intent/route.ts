import { requireCashierWrite, reserveCardCashier } from "@/lib/cashier-write-context";
import { requireAssignedCashRegister, StaffAuthError } from "@/lib/staff-session-server";
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
  event_id: string; paid_by: string | null; paid_register_id: string | null;
  pos_card_key: string | null;
  pos_card_state: string | null;
};

export async function POST(req: Request) {
  try {
    await ensureOrdersSchema();
    const body = await req.json().catch(() => ({}));
    const orderId = String(body?.orderId || "").trim();
    const actor = await requireAssignedCashRegister(req);
    // Reading an existing client secret on the authenticated native terminal
    // cannot replace the already reserved cashier identity.
    const nativeRead = body?.includeClientSecret !== false;


    if (!orderId) {
      return NextResponse.json({ ok: false, error: "Missing orderId" }, { status: 400 });
    }

    const rows = await sql`
      SELECT id, payment, UPPER(status) AS status, items, stripe_payment_intent_id, amount_cents, pos_card_key, pos_card_state, event_id, paid_by, paid_register_id
      FROM orders
      WHERE id = ${orderId}
      LIMIT 1
    `;
    if (!rows || rows.length === 0) {
      return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });
    }

    const order = rows[0] as unknown as OrderLike;
    if (body.workstationId !== undefined && body.workstationId !== actor.workstationId) throw new StaffAuthError("workstation_context_mismatch", 403);
    if (nativeRead && order.stripe_payment_intent_id && (!order.paid_by || order.paid_by !== actor.id || order.paid_register_id !== actor.workstationId)) throw new StaffAuthError("payment_cashier_context_mismatch", 403);
    if (order.event_id !== actor.cashierEventId || order.paid_by && order.paid_by !== actor.id || order.paid_register_id && order.paid_register_id !== actor.workstationId) throw new StaffAuthError("payment_cashier_context_mismatch", 403);
    if (!nativeRead || !order.stripe_payment_intent_id) {
      const context = await requireCashierWrite(req, order.event_id, body.workstationId);
      await reserveCardCashier(orderId, context);
    }
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
    if (order.pos_card_key && order.pos_card_state !== "ready") {
      return NextResponse.json({ ok: false, error: "POS order creation not confirmed" }, { status: 409 });
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
      if (metadataOrderId !== order.id || existingPi.currency !== "eur" || existingPi.status === "canceled") {
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

      const reusable = await sql`
        UPDATE orders
        SET
          payment_provider = 'stripe',
          amount_cents = ${amountCents},
          currency = 'eur',
          payment_error = NULL
        WHERE id = ${order.id} AND UPPER(status) = 'PENDING_PAYMENT' AND paid_at IS NULL
          AND stripe_payment_intent_id = ${existingPiId} AND (pos_card_key IS NULL OR pos_card_state = 'ready')
        RETURNING id
      `;
      if (!reusable.length) return NextResponse.json({ ok: false, error: "Payment blocked: order changed" }, { status: 409 });

      return NextResponse.json({
        ok: true,
        reused: true,
        orderId: order.id,
        paymentIntentId: existingPi.id,
        clientSecret: body?.includeClientSecret === false ? undefined : existingPi.client_secret,
        amount: existingPi.amount,
        currency: existingPi.currency,
        status: existingPi.status,
      });
    }

    // Persist the first request time before Stripe. Its key may be pruned after
    // 24h: never blindly create again outside this conservative retry window.
    const started = await sql`
      UPDATE orders SET stripe_pi_started_at = COALESCE(stripe_pi_started_at, NOW())
      WHERE id = ${order.id} AND UPPER(status) = 'PENDING_PAYMENT' AND paid_at IS NULL
        AND (pos_card_key IS NULL OR pos_card_state = 'ready')
      RETURNING stripe_pi_started_at
    `;
    const firstRequest = new Date(String(started[0]?.stripe_pi_started_at || "")).getTime();
    if (!Number.isFinite(firstRequest) || Date.now() - firstRequest > 23 * 60 * 60 * 1000) {
      return NextResponse.json({ ok: false, error: "PaymentIntent result requires verification; no new payment created" }, { status: 409 });
    }
    const pi = await stripePost<PaymentIntentResponse>("/payment_intents", {
      amount: amountCents,
      currency: "eur",
      "payment_method_types[0]": "card_present",
      capture_method: "automatic",
      "metadata[order_id]": order.id,
    }, `afrofood-terminal:${order.id}:v1`);

    if (pi.metadata?.order_id !== order.id || pi.currency !== "eur" || pi.amount !== amountCents || !pi.id) {
      return NextResponse.json({ ok: false, error: "PaymentIntent creation result requires verification" }, { status: 409 });
    }
    // Even after cancel_requested the in-flight result must be linked, so the
    // cancellation can resolve this exact PI. Never release its secret then.
    const linked = await sql`
      UPDATE orders
      SET
        payment_provider = 'stripe',
        stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, ${pi.id}),
        amount_cents = ${amountCents},
        currency = 'eur',
        payment_error = CASE WHEN pos_card_state = 'cancel_requested' THEN payment_error ELSE NULL END
      WHERE id = ${order.id} AND (stripe_payment_intent_id IS NULL OR stripe_payment_intent_id = ${pi.id})
        AND UPPER(status) = 'PENDING_PAYMENT' AND paid_at IS NULL
        AND (pos_card_key IS NULL OR pos_card_state IN ('ready', 'cancel_requested'))
      RETURNING stripe_payment_intent_id, status, pos_card_state
    `;
    if (!linked.length || linked[0].stripe_payment_intent_id !== pi.id) {
      return NextResponse.json({ ok: false, error: "PaymentIntent link changed; verify the existing payment" }, { status: 409 });
    }

    if (order.pos_card_key && linked[0].pos_card_state !== "ready") {
      return NextResponse.json({ ok: false, error: "Payment blocked: cancellation requested" }, { status: 409 });
    }
    return NextResponse.json({
      ok: true,
      reused: false,
      orderId: order.id,
      paymentIntentId: pi.id,
      clientSecret: body?.includeClientSecret === false ? undefined : pi.client_secret,
      amount: pi.amount,
      currency: pi.currency,
      status: pi.status,
    });
  } catch (e: unknown) {
    if (e instanceof StaffAuthError) return NextResponse.json({ ok: false, error: e.code }, { status: e.status });
    const error = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
