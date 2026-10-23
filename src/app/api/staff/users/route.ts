import { NextResponse } from "next/server";
import { listStaff, saveStaff } from "@/lib/staff-admin-server";
import { StaffAuthError } from "@/lib/staff-session-server";
function failure(error: unknown) {
  return NextResponse.json({ ok: false, error: error instanceof StaffAuthError ? error.code : "staff_management_unavailable" }, { status: error instanceof StaffAuthError ? error.status : 503 });
}
export async function GET(req: Request) {
  try { return NextResponse.json({ ok: true, users: await listStaff(req) }, { headers: { "Cache-Control": "no-store" } }); } catch (error) { return failure(error); }
}
async function save(req: Request, create: boolean) {
  try { await saveStaff(req, await req.json(), create); return NextResponse.json({ ok: true }); } catch (error) { return failure(error); }
}
export const POST = (req: Request) => save(req, true);
export const PATCH = (req: Request) => save(req, false);
