import { NextResponse } from "next/server";
import { getOrderRefund, refundSummary, RefundError } from "@/lib/refund-server";
import { requireAssignedCashRegister, requireStaffOrigin, StaffAuthError } from "@/lib/staff-session-server";
import { requireCashierWrite } from "@/lib/cashier-write-context";

export const runtime = "nodejs";
async function run(req: Request, context: { params: Promise<{ id: string }> }, create: boolean) {
  try {
    if (create || req.headers.has("origin") || req.headers.get("sec-fetch-site") === "cross-site") requireStaffOrigin(req);
    const user = await requireAssignedCashRegister(req);
    const displayedActor = req.headers.get("x-staff-user-id");
    if (displayedActor && displayedActor !== user.id) throw new StaffAuthError("cashier_changed", 409);
    const { id } = await context.params;
    const body = create ? await req.json().catch(() => ({})) : {};
    const cashier = create ? await requireCashierWrite(req, user.cashierEventId || "") : undefined;
    const row = await getOrderRefund(String(id || "").trim(), user, create, cashier, body?.amountCents);
    return NextResponse.json({ ok: true, refund: refundSummary(row) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const known = error instanceof StaffAuthError || error instanceof RefundError;
    return NextResponse.json({ ok: false, error: known ? error.code : "refund_unavailable" }, { status: known ? error.status : 503, headers: { "Cache-Control": "no-store" } });
  }
}
export const GET = (req: Request, context: { params: Promise<{ id: string }> }) => run(req, context, false);
export const POST = (req: Request, context: { params: Promise<{ id: string }> }) => run(req, context, true);
