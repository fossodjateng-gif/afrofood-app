import { NextResponse } from "next/server";
import { ensureOrdersSchema } from "@/lib/orders-schema";

export async function GET() {
  await ensureOrdersSchema();

  return NextResponse.json({ ok: true, message: "orders table ready" });
}
