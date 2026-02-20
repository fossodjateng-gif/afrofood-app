import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

type PaymentMethod = "cash" | "paypal" | "card";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const id = String(body.id || "");
    const createdAt = String(body.createdAt || new Date().toISOString());
    const customerName =
      body.customerName && String(body.customerName).trim()
        ? String(body.customerName).trim()
        : null;

    const payment = body.payment as PaymentMethod;
    const items = body.items; // [{name, qty}, ...]

    if (!id) {
      return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
    }
    if (!payment) {
      return NextResponse.json({ ok: false, error: "Missing payment" }, { status: 400 });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ ok: false, error: "Missing items" }, { status: 400 });
    }

    // status NEW par défaut
    await sql`
      INSERT INTO orders (id, created_at, customer_name, payment, status, items)
      VALUES (${id}, ${createdAt}::timestamptz, ${customerName}, ${payment}, 'NEW', ${JSON.stringify(items)}::jsonb)
    `;

    return NextResponse.json({
      ok: true,
      order: { id, createdAt, customerName: customerName ?? undefined, payment, items },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}