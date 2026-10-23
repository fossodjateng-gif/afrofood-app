import { NextResponse } from "next/server";
import { acquireCashierLock, heartbeatCashierLock, releaseCashierLock } from "@/lib/cashier-locks";
import { requireCashRegisterPermission, requireStaffOrigin, staffSessionHash, StaffAuthError } from "@/lib/staff-session-server";
import { getStoreConfig } from "@/lib/menu-settings";

export async function POST(req: Request) {
  try {
    requireStaffOrigin(req);
    const user = await requireCashRegisterPermission(req);
    const body = await req.json().catch(() => null);
    const action = body?.action;
    if (!["acquire", "heartbeat", "release"].includes(action)) throw new StaffAuthError("invalid_lock_action", 400);
    const instanceId = body?.instanceId;
    if (typeof instanceId !== "string" || !/^[a-f0-9-]{36}$/.test(instanceId)) throw new StaffAuthError("invalid_lock_instance", 400);
    const eventId = user.role === "cashier" ? user.cashierEventId : body?.eventId;
    if (typeof eventId !== "string" || !eventId || (body?.eventId !== undefined && body.eventId !== eventId)) throw new StaffAuthError("cash_register_forbidden", 403);
    // Release stays owner-bound even if an event was removed from configuration.
    if (action !== "release") {
      const config = await getStoreConfig();
      if (!config.events.some(event => event.id === eventId)) throw new StaffAuthError("invalid_lock_event", 403);
    }
    const lease = { eventId, instanceId, userId: user.id, username: user.username, sessionHash: staffSessionHash(req) };
    if (action === "release") {
      await releaseCashierLock(lease);
      return NextResponse.json({ ok: true });
    }
    const result = action === "acquire" ? await acquireCashierLock(lease) : await heartbeatCashierLock(lease);
    if (!result.ok) return NextResponse.json({ ok: false, error: result.reason === "locked" ? "cashier_locked" : "cashier_lock_lost", lock: result.lock }, { status: result.reason === "locked" ? 423 : 409 });
    return NextResponse.json({ ok: true, lock: result.lock });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof StaffAuthError ? error.code : "cashier_lock_unavailable" }, { status: error instanceof StaffAuthError ? error.status : 503 });
  }
}
