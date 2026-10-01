import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { publishOrderEvent } from "@/lib/order-events";
import { consumeItemAvailability, getPaymentConfig } from "@/lib/menu-settings";
import { calculateOrderTotalCents } from "@/lib/pricing";
import { ensureOrdersSchema } from "@/lib/orders-schema";

type PaymentMethod = "cash" | "card" | "cashless";
type OrderStatus = "PENDING_PAYMENT" | "NEW" | "IN_PROGRESS" | "READY" | "DONE" | "CANCELED";

const VALID_PAYMENTS = new Set<PaymentMethod>(["cash", "card", "cashless"]);
const VALID_STATUSES = new Set<OrderStatus>([
  "PENDING_PAYMENT",
  "NEW",
  "IN_PROGRESS",
  "READY",
  "DONE",
  "CANCELED",
]);

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Server error";
}

function formatDayKey(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const part = (type: string) => parts.find((it) => it.type === type)?.value || "";
  return `${part("year")}${part("month")}${part("day")}`;
}

async function makeNextOrderId() {
  const dayKey = formatDayKey();
  const prefix = `${dayKey}-`;
  const rows = await sql`
    SELECT id
    FROM orders
    WHERE id LIKE ${`${prefix}%`}
    ORDER BY id DESC
    LIMIT 1
  `;

  let next = 1;
  if (rows.length > 0) {
    const parts = String((rows[0] as { id: string }).id).split("-");
    const lastSeq = Number(parts[1] || "0");
    if (Number.isFinite(lastSeq) && lastSeq >= 1) {
      next = lastSeq + 1;
    }
  }

  return `${dayKey}-${String(next).padStart(3, "0")}`;
}

export async function GET(req: Request) {
  try {
    await ensureOrdersSchema();
    const { searchParams } = new URL(req.url);
    const statusParam = (searchParams.get("status") || "").toUpperCase();
    const idParam = String(searchParams.get("id") || "").trim();

    let rows;
    if (idParam && statusParam) {
      if (!VALID_STATUSES.has(statusParam as OrderStatus)) {
        return NextResponse.json({ ok: false, error: "Invalid status" }, { status: 400 });
      }

      rows = await sql`
        SELECT id, created_at, customer_name, event_id, event_name, reservation_requested, reservation_time, payment, payment_provider, stripe_payment_intent_id, amount_cents, currency, paid_at, payment_error, UPPER(status) AS status, items
        FROM orders
        WHERE id = ${idParam} AND UPPER(status) = ${statusParam}
        ORDER BY created_at DESC
      `;
    } else if (idParam) {
      rows = await sql`
        SELECT id, created_at, customer_name, event_id, event_name, reservation_requested, reservation_time, payment, payment_provider, stripe_payment_intent_id, amount_cents, currency, paid_at, payment_error, UPPER(status) AS status, items
        FROM orders
        WHERE id = ${idParam}
        ORDER BY created_at DESC
      `;
    } else if (statusParam) {
      if (!VALID_STATUSES.has(statusParam as OrderStatus)) {
        return NextResponse.json({ ok: false, error: "Invalid status" }, { status: 400 });
      }

      const eventIdParam = String(searchParams.get("eventId") || "").trim();
      rows = eventIdParam
        ? await sql`
            SELECT id, created_at, customer_name, event_id, event_name, reservation_requested, reservation_time, payment, payment_provider, stripe_payment_intent_id, amount_cents, currency, paid_at, payment_error, UPPER(status) AS status, items
            FROM orders
            WHERE UPPER(status) = ${statusParam}
              AND event_id = ${eventIdParam}
            ORDER BY created_at DESC
          `
        : await sql`
            SELECT id, created_at, customer_name, event_id, event_name, reservation_requested, reservation_time, payment, payment_provider, stripe_payment_intent_id, amount_cents, currency, paid_at, payment_error, UPPER(status) AS status, items
            FROM orders
            WHERE UPPER(status) = ${statusParam}
            ORDER BY created_at DESC
          `;
    } else {
      const eventIdParam = String(searchParams.get("eventId") || "").trim();
      rows = eventIdParam
        ? await sql`
            SELECT id, created_at, customer_name, event_id, event_name, reservation_requested, reservation_time, payment, payment_provider, stripe_payment_intent_id, amount_cents, currency, paid_at, payment_error, UPPER(status) AS status, items
            FROM orders
            WHERE event_id = ${eventIdParam}
            ORDER BY created_at DESC
          `
        : await sql`
            SELECT id, created_at, customer_name, event_id, event_name, reservation_requested, reservation_time, payment, payment_provider, stripe_payment_intent_id, amount_cents, currency, paid_at, payment_error, UPPER(status) AS status, items
            FROM orders
            ORDER BY created_at DESC
          `;
    }

    return NextResponse.json(rows);
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: getErrorMessage(e) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    await ensureOrdersSchema();
    const body = await req.json();

    const createdAt = String(body.createdAt || new Date().toISOString());
    const customerName =
      body.customerName && String(body.customerName).trim()
        ? String(body.customerName).trim()
        : null;
    const eventId =
      body.eventId && String(body.eventId).trim()
        ? String(body.eventId).trim()
        : null;
    const eventName =
      body.eventName && String(body.eventName).trim()
        ? String(body.eventName).trim()
        : null;
    const reservationRequested = body.reservationRequested === true;
    const reservationTime =
      reservationRequested && body.reservationTime && String(body.reservationTime).trim()
        ? String(body.reservationTime).trim()
        : null;

    const payment = String(body.payment || "") as PaymentMethod;
    const items = body.items;

    if (!VALID_PAYMENTS.has(payment)) {
      return NextResponse.json({ ok: false, error: "Invalid payment" }, { status: 400 });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ ok: false, error: "Missing items" }, { status: 400 });
    }
    if (reservationRequested && !eventName) {
      return NextResponse.json({ ok: false, error: "Missing event for reservation" }, { status: 400 });
    }
    if (reservationRequested && !reservationTime) {
      return NextResponse.json({ ok: false, error: "Missing reservation time" }, { status: 400 });
    }

    const paymentConfig = await getPaymentConfig(eventId || undefined);
    if (payment === "cash" && !paymentConfig.cashEnabled) {
      return NextResponse.json({ ok: false, error: "Cash payment disabled" }, { status: 400 });
    }
    if (payment === "card" && !paymentConfig.cardEnabled) {
      return NextResponse.json({ ok: false, error: "Card payment disabled" }, { status: 400 });
    }
    if (payment === "cashless" && !paymentConfig.cashlessEnabled) {
      return NextResponse.json({ ok: false, error: "Cashless payment disabled" }, { status: 400 });
    }

    await consumeItemAvailability(items, eventId || undefined);

    const id = await makeNextOrderId();
    const amountCents = calculateOrderTotalCents(items);

    await sql`
      INSERT INTO orders (id, created_at, customer_name, event_id, event_name, reservation_requested, reservation_time, payment, payment_provider, amount_cents, currency, status, items)
      VALUES (${id}, ${createdAt}::timestamptz, ${customerName}, ${eventId}, ${eventName}, ${reservationRequested}, ${reservationTime}::timestamp, ${payment}, NULL, ${amountCents}, 'eur', 'PENDING_PAYMENT', ${JSON.stringify(items)}::jsonb)
    `;

    publishOrderEvent({
      type: "ORDER_CREATED",
      orderId: id,
      at: Date.now(),
      status: "PENDING_PAYMENT",
    });

    return NextResponse.json({
      ok: true,
      order: {
        id,
        createdAt,
        customerName: customerName ?? undefined,
        eventId: eventId ?? undefined,
        eventName: eventName ?? undefined,
        reservationRequested,
        reservationTime: reservationTime ?? undefined,
        payment,
        items,
      },
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: getErrorMessage(e) },
      { status: 500 }
    );
  }
}
