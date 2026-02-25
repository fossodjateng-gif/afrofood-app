import { NextResponse } from "next/server";
import { stripePost } from "@/lib/stripe-server";

export async function POST() {
  try {
    const token = await stripePost<{ secret: string }>("/terminal/connection_tokens", {});
    return NextResponse.json({ ok: true, secret: token.secret });
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
