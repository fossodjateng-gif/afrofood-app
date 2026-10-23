import { NextResponse } from "next/server";
import { requireStaffAdmin, saveWorkstation } from "@/lib/staff-admin-server";
import { getWorkstations } from "@/lib/workstations-server";
import { getStoreConfig } from "@/lib/menu-settings";
import { StaffAuthError } from "@/lib/staff-session-server";
function failure(error: unknown) { return NextResponse.json({ ok: false, error: error instanceof StaffAuthError ? error.code : "workstation_management_unavailable" }, { status: error instanceof StaffAuthError ? error.status : 503 }); }
export async function GET(req: Request) {
  try {
    await requireStaffAdmin(req);
    const events = (await getStoreConfig()).events;
    const entries = await Promise.all(events.map(async event => [event.id, await getWorkstations(event.id)]));
    return NextResponse.json({ ok: true, events, workstations: Object.fromEntries(entries) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
async function save(req: Request, create: boolean) {
  try { await saveWorkstation(req, await req.json(), create); return NextResponse.json({ ok: true }); } catch (error) { return failure(error); }
}
export const POST = (req: Request) => save(req, true);
export const PATCH = (req: Request) => save(req, false);
