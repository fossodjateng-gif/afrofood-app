import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { reconcileRefund, type RefundRow } from "@/lib/refund-server";
import type { OrderRow } from "@/lib/schema";

export const runtime = "nodejs";
export async function POST(req: Request) {
  // Isolated from payment webhooks and disabled until separately enabled.
  if (process.env.REFUND_WEBHOOK_ENABLED !== "1") return NextResponse.json({ ok: false, error: "refund_webhook_disabled" }, { status: 503 });
  try {
    const secret = process.env.STRIPE_REFUND_WEBHOOK_SECRET;
    if (!secret) return NextResponse.json({ ok: false }, { status: 503 });
    const payload = await req.text();
    const parts = (req.headers.get("stripe-signature") || "").split(",");
    const time = parts.find(value => value.startsWith("t="))?.slice(2) || "";
    const expected = createHmac("sha256", secret).update(`${time}.${payload}`).digest();
    const valid = Number.isFinite(Number(time)) && Math.abs(Date.now() / 1000 - Number(time)) <= 300
      && parts.filter(value => value.startsWith("v1=")).some(value => {
        if (!/^v1=[a-f0-9]{64}$/i.test(value)) return false;
        const signature = Buffer.from(value.slice(3), "hex");
        return signature.length === expected.length && timingSafeEqual(signature, expected);
      });
    if (!valid) return NextResponse.json({ ok: false }, { status: 400 });
    const event = JSON.parse(payload);
    // Signed snapshot events only trigger a read of current Stripe state.
    if (!["refund.created", "refund.updated", "refund.failed"].includes(event.type)) return NextResponse.json({ ok: true, ignored: true });
    const refund = event.data?.object;
    const pi = refund?.payment_intent;
    if (refund?.object !== "refund" || !/^re_[A-Za-z0-9_]+$/.test(String(refund?.id || "")) || typeof pi !== "string") return NextResponse.json({ ok: false }, { status: 400 });
    const row = (await sql`SELECT * FROM order_refunds WHERE stripe_payment_intent_id = ${pi} LIMIT 1`)[0] as RefundRow | undefined;
    if (!row) return NextResponse.json({ ok: true, ignored: true });
    if (row.stripe_refund_id && row.stripe_refund_id !== refund.id) return NextResponse.json({ ok: true, ignored: true });
    const order = (await sql`SELECT * FROM orders WHERE id = ${row.order_id} LIMIT 1`)[0] as OrderRow | undefined;
    if (!order) return NextResponse.json({ ok: false }, { status: 503 });
    const result = await reconcileRefund(row, order, false);
    if (result.refund_error === "STRIPE_READ_UNCERTAIN") return NextResponse.json({ ok: false }, { status: 503 });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ ok: false }, { status: 503 }); }
}
