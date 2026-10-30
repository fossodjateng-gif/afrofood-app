import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { CONFIRMED_SALE_STATUSES, salesHistoryEvents } from "@/lib/sales-history-server";
import { requireStaffAdmin } from "@/lib/staff-admin-server";
import { StaffAuthError } from "@/lib/staff-session-server";

type KpiRow = {
  today_cents: string | number | null;
  today_tx: string | number | null;
  week_cents: string | number | null;
  week_tx: string | number | null;
  month_cents: string | number | null;
  month_tx: string | number | null;
};

type TopProductRow = {
  name: string | null;
  qty: string | number | null;
};

type HourRow = {
  hour: string | number | null;
  tx: string | number | null;
  cents: string | number | null;
};

type PaymentRow = {
  method: string | null;
  tx: string | number | null;
  cents: string | number | null;
};

type EventRow = {
  event_name: string | null;
  tx: string | number | null;
  cents: string | number | null;
};

type CanceledRow = {
  canceled_tx: string | number | null;
};

type SummaryRow = {
  cents: string | number | null;
  tx: string | number | null;
  gross_cash: string | number | null;
  gross_card: string | number | null;
  refunded_cash: string | number | null;
  refunded_card: string | number | null;
  refunded_total: string | number | null;
};

type Period = "today" | "week" | "month" | "all";

function toNumber(value: string | number | null | undefined) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) return Number(value);
  return 0;
}

function parsePeriod(input: string | null): Period {
  if (input === "today" || input === "week" || input === "month" || input === "all") return input;
  return "all";
}

export async function GET(req: Request) {
  try {
    await requireStaffAdmin(req);
    const { searchParams } = new URL(req.url);
    const period = parsePeriod(searchParams.get("period"));
    const events = await salesHistoryEvents();
    if (searchParams.get("catalog") === "1") return NextResponse.json({ ok: true, events }, { headers: { "Cache-Control": "no-store" } });
    const eventId = (searchParams.get("eventId") || "").trim();
    if (!eventId || !events.some(event => event.id === eventId)) throw new StaffAuthError("invalid_staff_event", 400);


    const kpiRows = (await sql`
      SELECT
        COALESCE(SUM(CASE WHEN (COALESCE(paid_at, created_at) AT TIME ZONE 'UTC') >= date_trunc('day', now() AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin' THEN amount_cents END), 0) AS today_cents,
        COALESCE(COUNT(*) FILTER (WHERE (COALESCE(paid_at, created_at) AT TIME ZONE 'UTC') >= date_trunc('day', now() AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin'), 0) AS today_tx,
        COALESCE(SUM(CASE WHEN (COALESCE(paid_at, created_at) AT TIME ZONE 'UTC') >= date_trunc('week', now() AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin' THEN amount_cents END), 0) AS week_cents,
        COALESCE(COUNT(*) FILTER (WHERE (COALESCE(paid_at, created_at) AT TIME ZONE 'UTC') >= date_trunc('week', now() AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin'), 0) AS week_tx,
        COALESCE(SUM(CASE WHEN (COALESCE(paid_at, created_at) AT TIME ZONE 'UTC') >= date_trunc('month', now() AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin' THEN amount_cents END), 0) AS month_cents,
        COALESCE(COUNT(*) FILTER (WHERE (COALESCE(paid_at, created_at) AT TIME ZONE 'UTC') >= date_trunc('month', now() AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin'), 0) AS month_tx
      FROM orders
      WHERE UPPER(status) = ANY(${CONFIRMED_SALE_STATUSES}::text[])
        AND amount_cents IS NOT NULL
        AND event_id = ${eventId}
    `) as KpiRow[];

    const summaryRows = (await sql`
      WITH sales AS (
      SELECT
        id, amount_cents,
        LOWER(COALESCE(NULLIF(payment_provider, ''), NULLIF(payment, ''), 'other')) AS method
      FROM orders
      WHERE UPPER(status) = ANY(${CONFIRMED_SALE_STATUSES}::text[])
        AND amount_cents IS NOT NULL
        AND (
          ${period} = 'all'
          OR (${period} = 'today' AND (COALESCE(paid_at, created_at) AT TIME ZONE 'UTC') >= date_trunc('day', now() AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin')
          OR (${period} = 'week' AND (COALESCE(paid_at, created_at) AT TIME ZONE 'UTC') >= date_trunc('week', now() AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin')
          OR (${period} = 'month' AND (COALESCE(paid_at, created_at) AT TIME ZONE 'UTC') >= date_trunc('month', now() AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin')
        )
        AND event_id = ${eventId}
      )
      SELECT
        COALESCE(SUM(s.amount_cents), 0) AS cents,
        COUNT(*) AS tx,
        COALESCE(SUM(s.amount_cents) FILTER (WHERE s.method = 'cash'), 0) AS gross_cash,
        COALESCE(SUM(s.amount_cents) FILTER (WHERE s.method IN ('card', 'stripe')), 0) AS gross_card,
        COALESCE(SUM(r.refund_amount_cents) FILTER (WHERE r.payment_method = 'cash'), 0) AS refunded_cash,
        COALESCE(SUM(r.refund_amount_cents) FILTER (WHERE r.payment_method IN ('card', 'stripe')), 0) AS refunded_card,
        COALESCE(SUM(r.refund_amount_cents), 0) AS refunded_total
      FROM sales s
      -- One refund row per order (PRIMARY KEY order_id); never join the items.
      LEFT JOIN order_refunds r ON r.order_id = s.id AND r.refund_state = 'refunded'
    `) as SummaryRow[];

    const topRows = (await sql`
      SELECT
        NULLIF(TRIM(item->>'name'), '') AS name,
        COALESCE(SUM(GREATEST(COALESCE((item->>'qty')::int, 0), 0)), 0) AS qty
      FROM orders o
      CROSS JOIN LATERAL jsonb_array_elements(o.items) AS item
      WHERE UPPER(o.status) = ANY(${CONFIRMED_SALE_STATUSES}::text[])
        AND o.amount_cents IS NOT NULL
        AND (
          ${period} = 'all'
          OR (${period} = 'today' AND (COALESCE(o.paid_at, o.created_at) AT TIME ZONE 'UTC') >= date_trunc('day', now() AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin')
          OR (${period} = 'week' AND (COALESCE(o.paid_at, o.created_at) AT TIME ZONE 'UTC') >= date_trunc('week', now() AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin')
          OR (${period} = 'month' AND (COALESCE(o.paid_at, o.created_at) AT TIME ZONE 'UTC') >= date_trunc('month', now() AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin')
        )
        AND o.event_id = ${eventId}
      GROUP BY 1
      HAVING NULLIF(TRIM(item->>'name'), '') IS NOT NULL
      ORDER BY qty DESC, name ASC
      LIMIT 8
    `) as TopProductRow[];

    const hourRows = (await sql`
      SELECT
        EXTRACT(HOUR FROM (COALESCE(paid_at, created_at) AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Berlin')::int AS hour,
        COUNT(*) AS tx,
        COALESCE(SUM(amount_cents), 0) AS cents
      FROM orders
      WHERE UPPER(status) = ANY(${CONFIRMED_SALE_STATUSES}::text[])
        AND amount_cents IS NOT NULL
        AND (
          ${period} = 'all'
          OR (${period} = 'today' AND (COALESCE(paid_at, created_at) AT TIME ZONE 'UTC') >= date_trunc('day', now() AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin')
          OR (${period} = 'week' AND (COALESCE(paid_at, created_at) AT TIME ZONE 'UTC') >= date_trunc('week', now() AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin')
          OR (${period} = 'month' AND (COALESCE(paid_at, created_at) AT TIME ZONE 'UTC') >= date_trunc('month', now() AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin')
        )
        AND event_id = ${eventId}
      GROUP BY 1
      ORDER BY 1 ASC
    `) as HourRow[];

    const paymentRows = (await sql`
      SELECT
        COALESCE(NULLIF(payment_provider, ''), NULLIF(payment, ''), 'other') AS method,
        COUNT(*) AS tx,
        COALESCE(SUM(amount_cents), 0) AS cents
      FROM orders
      WHERE UPPER(status) = ANY(${CONFIRMED_SALE_STATUSES}::text[])
        AND amount_cents IS NOT NULL
        AND (
          ${period} = 'all'
          OR (${period} = 'today' AND (COALESCE(paid_at, created_at) AT TIME ZONE 'UTC') >= date_trunc('day', now() AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin')
          OR (${period} = 'week' AND (COALESCE(paid_at, created_at) AT TIME ZONE 'UTC') >= date_trunc('week', now() AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin')
          OR (${period} = 'month' AND (COALESCE(paid_at, created_at) AT TIME ZONE 'UTC') >= date_trunc('month', now() AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin')
        )
        AND event_id = ${eventId}
      GROUP BY 1
      ORDER BY tx DESC, method ASC
    `) as PaymentRow[];

    const eventRows = (await sql`
      SELECT
        event_name,
        COUNT(*) AS tx,
        COALESCE(SUM(amount_cents), 0) AS cents
      FROM orders
      WHERE UPPER(status) = ANY(${CONFIRMED_SALE_STATUSES}::text[])
        AND amount_cents IS NOT NULL
        AND (
          ${period} = 'all'
          OR (${period} = 'today' AND (COALESCE(paid_at, created_at) AT TIME ZONE 'UTC') >= date_trunc('day', now() AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin')
          OR (${period} = 'week' AND (COALESCE(paid_at, created_at) AT TIME ZONE 'UTC') >= date_trunc('week', now() AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin')
          OR (${period} = 'month' AND (COALESCE(paid_at, created_at) AT TIME ZONE 'UTC') >= date_trunc('month', now() AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin')
        )
        AND NULLIF(TRIM(event_name), '') IS NOT NULL
        AND event_id = ${eventId}
      GROUP BY event_name
      ORDER BY cents DESC, event_name ASC
      LIMIT 12
    `) as EventRow[];

    const canceledRows = (await sql`
      SELECT
        COUNT(*) AS canceled_tx
      FROM orders
      WHERE UPPER(status) = 'CANCELED'
        AND (
          ${period} = 'all'
          OR (${period} = 'today' AND (COALESCE(paid_at, created_at) AT TIME ZONE 'UTC') >= date_trunc('day', now() AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin')
          OR (${period} = 'week' AND (COALESCE(paid_at, created_at) AT TIME ZONE 'UTC') >= date_trunc('week', now() AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin')
          OR (${period} = 'month' AND (COALESCE(paid_at, created_at) AT TIME ZONE 'UTC') >= date_trunc('month', now() AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin')
        )
        AND event_id = ${eventId}
    `) as CanceledRow[];

    const k = kpiRows[0] || ({} as KpiRow);

    const todayRevenueCents = toNumber(k.today_cents);
    const todayTransactions = toNumber(k.today_tx);
    const weekRevenueCents = toNumber(k.week_cents);
    const weekTransactions = toNumber(k.week_tx);
    const monthRevenueCents = toNumber(k.month_cents);
    const monthTransactions = toNumber(k.month_tx);

    const totalPaymentTx = paymentRows.reduce((sum, row) => sum + toNumber(row.tx), 0);
    const s = summaryRows[0];
    const summaryRevenueCents = toNumber(s?.cents);
    const summaryTransactions = toNumber(s?.tx);
    const canceledTransactions = toNumber(canceledRows[0]?.canceled_tx);
    const gross = {
      cashCents: toNumber(s?.gross_cash),
      cardCents: toNumber(s?.gross_card),
      totalCents: summaryRevenueCents,
    };
    const refunded = {
      cashCents: toNumber(s?.refunded_cash),
      cardCents: toNumber(s?.refunded_card),
      totalCents: toNumber(s?.refunded_total),
    };

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      filters: {
        period,
        eventId,
      },
      financials: {
        gross,
        refunded,
        net: {
          cashCents: gross.cashCents - refunded.cashCents,
          cardCents: gross.cardCents - refunded.cardCents,
          totalCents: gross.totalCents - refunded.totalCents,
        },
      },
      summary: {
        revenueCents: summaryRevenueCents,
        transactions: summaryTransactions,
        canceledTransactions,
        avgBasketCents:
          summaryTransactions > 0 ? Math.round(summaryRevenueCents / summaryTransactions) : 0,
      },
      kpis: {
        today: {
          revenueCents: todayRevenueCents,
          transactions: todayTransactions,
          avgBasketCents:
            todayTransactions > 0 ? Math.round(todayRevenueCents / todayTransactions) : 0,
        },
        week: {
          revenueCents: weekRevenueCents,
          transactions: weekTransactions,
          avgBasketCents:
            weekTransactions > 0 ? Math.round(weekRevenueCents / weekTransactions) : 0,
        },
        month: {
          revenueCents: monthRevenueCents,
          transactions: monthTransactions,
          avgBasketCents:
            monthTransactions > 0 ? Math.round(monthRevenueCents / monthTransactions) : 0,
        },
      },
      topProducts: topRows.map((row) => ({
        name: String(row.name || ""),
        qty: toNumber(row.qty),
      })),
      salesByHour: hourRows.map((row) => ({
        hour: toNumber(row.hour),
        transactions: toNumber(row.tx),
        revenueCents: toNumber(row.cents),
      })),
      paymentMethods: paymentRows.map((row) => {
        const tx = toNumber(row.tx);
        return {
          method: String(row.method || "other"),
          transactions: tx,
          revenueCents: toNumber(row.cents),
          sharePct: totalPaymentTx > 0 ? Math.round((tx / totalPaymentTx) * 1000) / 10 : 0,
        };
      }),
      salesByEvent: eventRows.map((row) => ({
        eventName: String(row.event_name || ""),
        transactions: toNumber(row.tx),
        revenueCents: toNumber(row.cents),
      })),
      availableEvents: events,

    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    return NextResponse.json({ ok: false, error: error instanceof StaffAuthError ? error.code : "stats_unavailable" }, { status: error instanceof StaffAuthError ? error.status : 503 });
  }
}
