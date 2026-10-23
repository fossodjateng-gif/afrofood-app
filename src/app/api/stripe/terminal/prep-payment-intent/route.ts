import { requireAssignedCashRegister, requireStaffOrigin, StaffAuthError } from "@/lib/staff-session-server";
import { NextResponse } from "next/server";
import { stripePost } from "@/lib/stripe-server";

type PaymentIntentResponse = {
  id: string;
  client_secret: string;
  amount: number;
  currency: string;
  status: string;
};

const PREP_AMOUNT_CENTS = 50;

export async function POST(req: Request) {
  try {
    requireStaffOrigin(req);
    await requireAssignedCashRegister(req);
    const pi = await stripePost<PaymentIntentResponse>("/payment_intents", {
      amount: PREP_AMOUNT_CENTS,
      currency: "eur",
      "payment_method_types[0]": "card_present",
      capture_method: "automatic",
      "metadata[purpose]": "tap_to_pay_preparation_demo",
      "metadata[source]": "afrofood_terminal",
    });

    return NextResponse.json({
      ok: true,
      paymentIntentId: pi.id,
      clientSecret: pi.client_secret,
      amount: pi.amount,
      currency: pi.currency,
      status: pi.status,
    });
  } catch (e: unknown) {
    if (e instanceof StaffAuthError) return NextResponse.json({ ok: false, error: e.code }, { status: e.status });
    const error = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
