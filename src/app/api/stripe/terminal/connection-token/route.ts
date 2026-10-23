import { requireAssignedCashRegister, requireStaffOrigin, StaffAuthError } from "@/lib/staff-session-server";
import { NextResponse } from "next/server";
import { stripePost } from "@/lib/stripe-server";

export async function POST(req: Request) {
  try {
    requireStaffOrigin(req);
    await requireAssignedCashRegister(req);
    const token = await stripePost<{ secret: string }>("/terminal/connection_tokens", {});
    return NextResponse.json({ ok: true, secret: token.secret });
  } catch (e: unknown) {
    if (e instanceof StaffAuthError) return NextResponse.json({ ok: false, error: e.code }, { status: e.status });
    const error = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
