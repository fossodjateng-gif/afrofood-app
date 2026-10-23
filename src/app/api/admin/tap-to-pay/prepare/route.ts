import { requireAssignedCashRegister, requireStaffOrigin, StaffAuthError } from "@/lib/staff-session-server";
import { NextResponse } from "next/server";
import { stripePost } from "@/lib/stripe-server";
import { upsertTapToPayConfig } from "@/lib/menu-settings";

export async function POST(req: Request) {
  try {
    requireStaffOrigin(req);
    await requireAssignedCashRegister(req);

    await upsertTapToPayConfig({ readinessStatus: "preparing" });

    // Generates a Stripe Terminal connection token to validate readiness.
    // No order and no amount are created at this step.
    await stripePost<{ secret: string }>("/terminal/connection_tokens", {});
    await upsertTapToPayConfig({ readinessStatus: "ready" });

    return NextResponse.json({
      ok: true,
      preparedAt: new Date().toISOString(),
      message: "Tap to Pay prepared (no PaymentIntent created).",
    });
  } catch (e: unknown) {
    if (e instanceof StaffAuthError) return NextResponse.json({ ok: false, error: e.code }, { status: e.status });
    await upsertTapToPayConfig({ readinessStatus: "not_prepared" });
    const error = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
