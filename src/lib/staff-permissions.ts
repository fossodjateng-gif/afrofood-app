export type ServerStaffRole = "admin" | "cashier" | "kitchen";
export type AuthenticatedStaff = {
  id: string; username: string; role: ServerStaffRole; active: boolean;
  cashierEventId: string | null;
  workstationId?: string | null;
  workstationName?: string | null;
  workstationType?: "cashier" | "kitchen" | null;
};

export function canUseCashRegister(user: AuthenticatedStaff) {
  return user.active && (user.role === "cashier" || user.role === "admin");
}

export function canAccessStaffEvent(user: AuthenticatedStaff, eventId: string) {
  return user.active && !!eventId && (user.role === "admin" || user.cashierEventId === eventId);
}
