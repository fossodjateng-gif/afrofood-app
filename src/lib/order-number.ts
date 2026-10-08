import { sql } from "@/lib/db";

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

export async function makeNextOrderId() {
  const dayKey = formatDayKey();
  const configuredPrefix = process.env.AFROFOOD_ORDER_ID_PREFIX?.trim() || "";
  // Keep LIKE wildcards and separators out of the configured namespace.
  if (configuredPrefix && !/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(configuredPrefix)) {
    throw new Error("Invalid AFROFOOD_ORDER_ID_PREFIX");
  }
  const prefix = `${configuredPrefix ? `${configuredPrefix}-` : ""}${dayKey}-`;
  const rows = await sql`
    SELECT id
    FROM orders
    WHERE id LIKE ${`${prefix}%`}
    ORDER BY id DESC
    LIMIT 1
  `;

  let next = 1;
  if (rows.length > 0) {
    const lastSeq = Number(String((rows[0] as { id: string }).id).slice(prefix.length) || "0");
    if (Number.isFinite(lastSeq) && lastSeq >= 1) {
      next = lastSeq + 1;
    }
  }

  return `${prefix}${String(next).padStart(3, "0")}`;
}
