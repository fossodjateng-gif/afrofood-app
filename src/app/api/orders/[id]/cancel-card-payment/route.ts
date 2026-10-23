import { NextResponse } from "next/server";
import { cancelCardPayment, CardCancellationError } from "@/lib/pos-card-cancel-server";
import { cashRegisterActor, recordCashRegisterRequest } from "@/lib/staff-action-server";
import { StaffAuthError } from "@/lib/staff-session-server";
import { requireCashierWrite } from "@/lib/cashier-write-context";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const body = await req.json().catch(() => ({}));
    const { id } = await context.params;
    const actor = await cashRegisterActor(req, String(body?.eventId || "").trim());
    await requireCashierWrite(req, actor.cashierEventId || "", body.workstationId);
    await recordCashRegisterRequest(actor.id, "card_cancel_requested", String(body?.eventId || "").trim(), id);
    const result = await cancelCardPayment(String(id || "").trim(), {
      role: actor.role,
      userId: actor.id, username: actor.username, eventId: String(body?.eventId || "").trim(),
    });
    return NextResponse.json({ ok: true, ...result }, { status: ["cancellation_pending", "requires_review"].includes(result.outcome) ? 202 : 200 });
  } catch (error) {
    if (error instanceof StaffAuthError) return NextResponse.json({ ok: false, error: error.code }, { status: error.status });
    if (error instanceof CardCancellationError) return NextResponse.json({ ok: false, error: error.code }, { status: error.status });
    return NextResponse.json({ ok: false, error: "cancellation_unavailable" }, { status: 500 });
  }
}
