import { NextResponse } from "next/server";
import { cancelCardPayment, CardCancellationError } from "@/lib/pos-card-cancel-server";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const body = await req.json().catch(() => ({}));
    const { id } = await context.params;
    const result = await cancelCardPayment(String(id || "").trim(), {
      role: String(req.headers.get("x-staff-role") || "").trim().toLowerCase(),
      userId: String(body?.userId || "").trim(), username: String(body?.username || "").trim(), eventId: String(body?.eventId || "").trim(),
    });
    return NextResponse.json({ ok: true, ...result }, { status: ["cancellation_pending", "requires_review"].includes(result.outcome) ? 202 : 200 });
  } catch (error) {
    if (error instanceof CardCancellationError) return NextResponse.json({ ok: false, error: error.code }, { status: error.status });
    return NextResponse.json({ ok: false, error: "cancellation_unavailable" }, { status: 500 });
  }
}
