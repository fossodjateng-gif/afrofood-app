import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { ensureOrdersSchema } from "@/lib/orders-schema";

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

type DistinctEventRow = {
  event_name: string | null;
};

type CanceledRow = {
  canceled_tx: string | number | null;
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
    await ensureOrdersSchema();
    const { searchParams } = new URL(req.url);
    const period = parsePeriod(searchParams.get("period"));
    const eventFilterRaw = String(searchParams.get("event") || "").trim();
    const eventFilter = !eventFilterRaw || eventFilterRaw.toLowerCase() === "all" ? "" : eventFilterRaw;

    const kpiRows = (await sql`
      SELECT
        COALESCE(SUM(CASE WHEN created_at >= date_trunc('day', now()) THEN amount_cents END), 0) AS today_cents,
        COALESCE(COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now())), 0) AS today_tx,
        COALESCE(SUM(CASE WHEN created_at >= date_trunc('week', now()) THEN amount_cents END), 0) AS week_cents,
        COALESCE(COUNT(*) FILTER (WHERE created_at >= date_trunc('week', now())), 0) AS week_tx,
        COALESCE(SUM(CASE WHEN created_at >= date_trunc('month', now()) THEN amount_cents END), 0) AS month_cents,
        COALESCE(COUNT(*) FILTER (WHERE created_at >= date_trunc('month', now())), 0) AS month_tx
      FROM orders
      WHERE UPPER(status) IN ('NEW', 'IN_PROGRESS', 'READY', 'DONE')
        AND amount_cents IS NOT NULL
        AND (
          ${eventFilter} = ''
          OR LOWER(COALESCE(NULLIF(TRIM(event_name), ''), '')) = LOWER(${eventFilter})
        )
    `) as KpiRow[];

    const summaryRows = (await sql`
      SELECT
        COALESCE(SUM(amount_cents), 0) AS cents,
        COUNT(*) AS tx
      FROM orders
      WHERE UPPER(status) IN ('NEW', 'IN_PROGRESS', 'READY', 'DONE')
        AND amount_cents IS NOT NULL
        AND (
          ${period} = 'all'
          OR (${period} = 'today' AND created_at >= date_trunc('day', now()))
          OR (${period} = 'week' AND created_at >= date_trunc('week', now()))
          OR (${period} = 'month' AND created_at >= date_trunc('month', now()))
        )
        AND (
          ${eventFilter} = ''
          OR LOWER(COALESCE(NULLIF(TRIM(event_name), ''), '')) = LOWER(${eventFilter})
        )
    `) as Array<{ cents: string | number | null; tx: string | number | null }>;

    const topRows = (await sql`
      SELECT
        NULLIF(TRIM(item->>'name'), '') AS name,
        COALESCE(SUM(GREATEST(COALESCE((item->>'qty')::int, 0), 0)), 0) AS qty
      FROM orders o
      CROSS JOIN LATERAL jsonb_array_elements(o.items) AS item
      WHERE UPPER(o.status) IN ('NEW', 'IN_PROGRESS', 'READY', 'DONE')
        AND o.amount_cents IS NOT NULL
        AND (
          ${period} = 'all'
          OR (${period} = 'today' AND o.created_at >= date_trunc('day', now()))
          OR (${period} = 'week' AND o.created_at >= date_trunc('week', now()))
          OR (${period} = 'month' AND o.created_at >= date_trunc('month', now()))
        )
        AND (
          ${eventFilter} = ''
          OR LOWER(COALESCE(NULLIF(TRIM(o.event_name), ''), '')) = LOWER(${eventFilter})
        )
      GROUP BY 1
      HAVING NULLIF(TRIM(item->>'name'), '') IS NOT NULL
      ORDER BY qty DESC, name ASC
      LIMIT 8
    `) as TopProductRow[];

    const hourRows = (await sql`
      SELECT
        EXTRACT(HOUR FROM created_at)::int AS hour,
        COUNT(*) AS tx,
        COALESCE(SUM(amount_cents), 0) AS cents
      FROM orders
      WHERE UPPER(status) IN ('NEW', 'IN_PROGRESS', 'READY', 'DONE')
        AND amount_cents IS NOT NULL
        AND (
          ${period} = 'all'
          OR (${period} = 'today' AND created_at >= date_trunc('day', now()))
          OR (${period} = 'week' AND created_at >= date_trunc('week', now()))
          OR (${period} = 'month' AND created_at >= date_trunc('month', now()))
        )
        AND (
          ${eventFilter} = ''
          OR LOWER(COALESCE(NULLIF(TRIM(event_name), ''), '')) = LOWER(${eventFilter})
        )
      GROUP BY 1
      ORDER BY 1 ASC
    `) as HourRow[];

    const paymentRows = (await sql`
      SELECT
        COALESCE(NULLIF(payment_provider, ''), NULLIF(payment, ''), 'other') AS method,
        COUNT(*) AS tx,
        COALESCE(SUM(amount_cents), 0) AS cents
      FROM orders
      WHERE UPPER(status) IN ('NEW', 'IN_PROGRESS', 'READY', 'DONE')
        AND amount_cents IS NOT NULL
        AND (
          ${period} = 'all'
          OR (${period} = 'today' AND created_at >= date_trunc('day', now()))
          OR (${period} = 'week' AND created_at >= date_trunc('week', now()))
          OR (${period} = 'month' AND created_at >= date_trunc('month', now()))
        )
        AND (
          ${eventFilter} = ''
          OR LOWER(COALESCE(NULLIF(TRIM(event_name), ''), '')) = LOWER(${eventFilter})
        )
      GROUP BY 1
      ORDER BY tx DESC, method ASC
    `) as PaymentRow[];

    const eventRows = (await sql`
      SELECT
        event_name,
        COUNT(*) AS tx,
        COALESCE(SUM(amount_cents), 0) AS cents
      FROM orders
      WHERE UPPER(status) IN ('NEW', 'IN_PROGRESS', 'READY', 'DONE')
        AND amount_cents IS NOT NULL
        AND (
          ${period} = 'all'
          OR (${period} = 'today' AND created_at >= date_trunc('day', now()))
          OR (${period} = 'week' AND created_at >= date_trunc('week', now()))
          OR (${period} = 'month' AND created_at >= date_trunc('month', now()))
        )
        AND NULLIF(TRIM(event_name), '') IS NOT NULL
        AND (
          ${eventFilter} = ''
          OR LOWER(COALESCE(NULLIF(TRIM(event_name), ''), '')) = LOWER(${eventFilter})
        )
      GROUP BY event_name
      ORDER BY cents DESC, event_name ASC
      LIMIT 12
    `) as EventRow[];

    const eventOptionsRows = (await sql`
      SELECT DISTINCT event_name
      FROM orders
      WHERE UPPER(status) IN ('NEW', 'IN_PROGRESS', 'READY', 'DONE')
        AND amount_cents IS NOT NULL
        AND NULLIF(TRIM(event_name), '') IS NOT NULL
      ORDER BY event_name ASC
      LIMIT 50
    `) as DistinctEventRow[];

    const canceledRows = (await sql`
      SELECT
        COUNT(*) AS canceled_tx
      FROM orders
      WHERE UPPER(status) = 'CANCELED'
        AND (
          ${period} = 'all'
          OR (${period} = 'today' AND created_at >= date_trunc('day', now()))
          OR (${period} = 'week' AND created_at >= date_trunc('week', now()))
          OR (${period} = 'month' AND created_at >= date_trunc('month', now()))
        )
        AND (
          ${eventFilter} = ''
          OR LOWER(COALESCE(NULLIF(TRIM(event_name), ''), '')) = LOWER(${eventFilter})
        )
    `) as CanceledRow[];

    const k = kpiRows[0] || ({} as KpiRow);

    const todayRevenueCents = toNumber(k.today_cents);
    const todayTransactions = toNumber(k.today_tx);
    const weekRevenueCents = toNumber(k.week_cents);
    const weekTransactions = toNumber(k.week_tx);
    const monthRevenueCents = toNumber(k.month_cents);
    const monthTransactions = toNumber(k.month_tx);

    const totalPaymentTx = paymentRows.reduce((sum, row) => sum + toNumber(row.tx), 0);
    const s = summaryRows[0] || { cents: 0, tx: 0 };
    const summaryRevenueCents = toNumber(s.cents);
    const summaryTransactions = toNumber(s.tx);
    const canceledTransactions = toNumber(canceledRows[0]?.canceled_tx);

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      filters: {
        period,
        event: eventFilter || "all",
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
      availableEvents: eventOptionsRows
        .map((row) => String(row.event_name || "").trim())
        .filter(Boolean),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
