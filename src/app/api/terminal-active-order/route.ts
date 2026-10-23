import { sql } from "@/lib/db";
import { requireCashierWrite } from "@/lib/cashier-write-context";
import { requireAssignedCashRegister, requireStaffOrigin, StaffAuthError } from "@/lib/staff-session-server";
import { getStoreConfig } from "@/lib/menu-settings";
import { NextResponse } from "next/server";
import {
  clearTerminalActiveOrder,
  getTerminalActiveOrder,
  setTerminalActiveOrder,
} from "@/lib/terminal-active-orders";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const actor = await requireAssignedCashRegister(req);
    const username = actor.username;
    if (searchParams.has("username") && searchParams.get("username") !== username) throw new StaffAuthError("cashier_context_mismatch", 403);
    const activeOrder = await getTerminalActiveOrder(username);
    if (activeOrder) {
      const target = (await sql`SELECT event_id, paid_by, paid_register_id FROM orders WHERE id = ${activeOrder.orderId} LIMIT 1`)[0];
      if (!target || target.event_id !== actor.cashierEventId || target.paid_by !== actor.id || target.paid_register_id !== actor.workstationId) return NextResponse.json({ ok: true, activeOrder: null });
    }
    return NextResponse.json({ ok: true, activeOrder });
  } catch (e: unknown) {
    if (e instanceof StaffAuthError) return NextResponse.json({ ok: false, error: e.code }, { status: e.status });
    const error = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    requireStaffOrigin(req);
    const actor = await requireAssignedCashRegister(req);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "").trim();
    const username = actor.username;
    if (body.username && body.username !== username || body.userId && body.userId !== actor.id) throw new StaffAuthError("cashier_context_mismatch", 403);
    const target = (await sql`SELECT event_id, paid_by, paid_register_id FROM orders WHERE id = ${String(body.orderId || "")} LIMIT 1`)[0];
    if (!target || target.event_id !== actor.cashierEventId || target.paid_by !== actor.id || target.paid_register_id !== actor.workstationId) throw new StaffAuthError("cashier_context_mismatch", 403);

    if (action === "clear") {
      await clearTerminalActiveOrder({
        username,
        orderId: body?.orderId ? String(body.orderId).trim() : null,
      });
      return NextResponse.json({ ok: true });
    }

    await requireCashierWrite(req, target.event_id, body.workstationId);
    const event = (await getStoreConfig()).events.find(event => event.id === actor.cashierEventId);
    const activeOrder = await setTerminalActiveOrder({
      username,
      userId: actor.id,
      eventName: event?.name || "",
      orderId: String(body?.orderId || "").trim(),
      paymentIntentId: body?.paymentIntentId ? String(body.paymentIntentId).trim() : null,
    });

    return NextResponse.json({ ok: true, activeOrder });
  } catch (e: unknown) {
    if (e instanceof StaffAuthError) return NextResponse.json({ ok: false, error: e.code }, { status: e.status });
    const error = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error }, { status: 409 });
  }
}
