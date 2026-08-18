import { NextResponse } from "next/server";
import {
  acquireCashierLock,
  heartbeatCashierLock,
  releaseCashierLock,
} from "@/lib/cashier-locks";

function isCashierAuthorized(req: Request) {
  const role = String(req.headers.get("x-staff-role") || "").trim().toLowerCase();
  return role === "admin" || role === "cashier";
}

export async function POST(req: Request) {
  try {
    if (!isCashierAuthorized(req)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "").trim();
    const eventName = String(body?.eventName || "").trim();
    const userId = String(body?.userId || "").trim();
    const username = String(body?.username || "").trim();

    if (!userId) {
      return NextResponse.json({ ok: false, error: "Missing userId" }, { status: 400 });
    }

    if (action === "release") {
      await releaseCashierLock({ eventName, userId });
      return NextResponse.json({ ok: true });
    }

    const result =
      action === "heartbeat"
        ? await heartbeatCashierLock({ eventName, userId, username })
        : await acquireCashierLock({ eventName, userId, username });

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "cashier_locked",
          lock: result.lock,
        },
        { status: 423 }
      );
    }

    return NextResponse.json({ ok: true, lock: result.lock });
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
