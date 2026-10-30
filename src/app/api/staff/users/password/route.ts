import { NextResponse } from "next/server";
import { changeStaffPassword } from "@/lib/staff-admin-server";
import { StaffAuthError } from "@/lib/staff-session-server";

export async function POST(req: Request) {
  try {
    await changeStaffPassword(req, await req.json());
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof StaffAuthError ? error.code : "staff_management_unavailable" }, {
      status: error instanceof StaffAuthError ? error.status : 503, headers: { "Cache-Control": "no-store" },
    });
  }
}
