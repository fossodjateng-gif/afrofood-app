import { sql } from "@/lib/db";
import { findWorkstation, parseWorkstations, type Workstation } from "@/lib/workstations";

export async function getWorkstations(eventId: string) {
  const rows = await sql`SELECT setting_value FROM app_settings WHERE setting_key = ${`workstations:${eventId}`} LIMIT 1`;
  return parseWorkstations(rows[0]?.setting_value);
}
export async function assignedWorkstation(role: string, eventId: string | null, workstationId: string | null): Promise<Workstation | null> {
  if (role === "admin" && !workstationId) return null;
  if (!eventId || !workstationId) throw new Error("workstation_assignment_required");
  const events = await sql`SELECT setting_value FROM app_settings WHERE setting_key = 'store_config' LIMIT 1`;
  if (!events[0]?.setting_value?.events?.some((event: { id: string }) => event.id === eventId)) throw new Error("workstation_event_invalid");
  const station = findWorkstation(await getWorkstations(eventId), workstationId);
  if (!station?.active || (role !== "admin" && station.type !== role)) throw new Error("workstation_assignment_invalid");
  return station;
}
