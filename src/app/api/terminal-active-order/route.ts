import { NextResponse } from "next/server";
import {
  clearTerminalActiveOrder,
  getTerminalActiveOrder,
  setTerminalActiveOrder,
} from "@/lib/terminal-active-orders";

function isCashierAuthorized(req: Request) {
  const role = String(req.headers.get("x-staff-role") || "").trim().toLowerCase();
  return role === "admin" || role === "cashier";
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const username = String(searchParams.get("username") || "").trim();
    const activeOrder = await getTerminalActiveOrder(username);
    return NextResponse.json({ ok: true, activeOrder });
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    if (!isCashierAuthorized(req)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "").trim();
    const username = String(body?.username || "").trim();

    if (action === "clear") {
      await clearTerminalActiveOrder({
        username,
        orderId: body?.orderId ? String(body.orderId).trim() : null,
      });
      return NextResponse.json({ ok: true });
    }

    const activeOrder = await setTerminalActiveOrder({
      username,
      userId: body?.userId ? String(body.userId).trim() : null,
      eventName: String(body?.eventName || "").trim(),
      orderId: String(body?.orderId || "").trim(),
      paymentIntentId: body?.paymentIntentId ? String(body.paymentIntentId).trim() : null,
    });

    return NextResponse.json({ ok: true, activeOrder });
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
