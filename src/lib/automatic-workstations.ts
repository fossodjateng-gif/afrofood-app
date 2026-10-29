import { randomUUID } from "node:crypto";
import { StaffAuthError } from "@/lib/staff-session-server";
import { WORKSTATION_ID, type WorkstationConfig, type WorkstationType } from "@/lib/workstations";

export type StaffAssignment = {
  id: string; username: string; role: string; active: boolean;
  cashier_event_id: string | null; workstation_id: string | null;
};

// Names are presentation only. Neither adoption nor reuse ever compares names.
export function resolveAutomaticWorkstation(config: WorkstationConfig, user: StaffAssignment,
  eventId: string, type: WorkstationType, users: StaffAssignment[], create: boolean) {
  const all = [...config.cashier, ...config.kitchen];
  const owned = all.filter(station => station.ownerUserId === user.id && station.type === type);
  if (owned.length > 1) throw new StaffAuthError("workstation_owner_ambiguous", 409);
  const currentId = user.cashier_event_id === eventId && user.role === type ? user.workstation_id : null;
  const currentMatches = currentId ? all.filter(station => station.id === currentId) : [];
  if (currentMatches.length > 1) throw new StaffAuthError("workstation_owner_ambiguous", 409);
  const current = currentMatches[0];
  if (current?.type === type && current.ownerUserId !== undefined && current.ownerUserId !== user.id) {
    throw new StaffAuthError("workstation_owner_conflict", 409);
  }
  const compatible = current?.type === type ? current : undefined;
  if (owned[0] && compatible && owned[0].id !== compatible.id) throw new StaffAuthError("workstation_owner_ambiguous", 409);
  const station = owned[0] || compatible;
  if (station) {
    if (!station.active) throw new StaffAuthError("workstation_inactive", 409);
    if (!WORKSTATION_ID.test(station.id) || config[type].filter(item => item.id === station.id).length !== 1 ||
      all.filter(item => item.id === station.id).length !== 1) throw new StaffAuthError("workstation_assignment_invalid", 409);
    if (users.some(other => other.id !== user.id && other.cashier_event_id === eventId && other.workstation_id === station.id)) {
      throw new StaffAuthError("workstation_shared_assignment", 409);
    }
    station.ownerUserId = user.id;
    return station;
  }
  if (!create) return null;
  const next = { id: randomUUID(), name: `${type === "cashier" ? "Caisse" : "Cuisine"} ${user.username}`, type, active: true, ownerUserId: user.id };
  config[type].push(next);
  return next;
}
