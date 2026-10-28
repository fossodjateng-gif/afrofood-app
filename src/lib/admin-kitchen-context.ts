import { getStoreConfig } from "@/lib/menu-settings";
import type { AuthenticatedStaff } from "@/lib/staff-permissions";
import { StaffAuthError } from "@/lib/staff-session-server";

// Call only after authenticating the server session; browser role headers are not authority.
export async function validateAdminKitchenEvent(actor: AuthenticatedStaff, value: unknown) {
  if (actor.role !== "admin") throw new StaffAuthError("admin_required", 403);
  const eventId = typeof value === "string" ? value.trim() : "";
  if (!eventId) throw new StaffAuthError("admin_event_required", 400);
  const event = (await getStoreConfig()).events.find(event => event.id === eventId);
  if (!event) throw new StaffAuthError("invalid_admin_event", 400);
  return { id: event.id, name: event.name };
}
