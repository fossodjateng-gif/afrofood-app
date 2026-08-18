import { NextResponse } from "next/server";
import { stripePost } from "@/lib/stripe-server";
import { upsertTapToPayConfig } from "@/lib/menu-settings";

function getAdminPin() {
  return process.env.ADMIN_MENU_PIN || process.env.NEXT_PUBLIC_CAISSE_PIN || "1955";
}

function isAuthorized(req: Request) {
  const provided = String(req.headers.get("x-admin-pin") || "").trim();
  if (Boolean(provided) && provided === getAdminPin()) return true;
  const staffRole = String(req.headers.get("x-staff-role") || "").trim().toLowerCase();
  return staffRole === "admin" || staffRole === "cashier";
}

export async function POST(req: Request) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

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
    await upsertTapToPayConfig({ readinessStatus: "not_prepared" });
    const error = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
