"use client";

import type { Lang } from "@/lib/translations";

export type StaffRole = "admin" | "cashier" | "kitchen";

export type StaffSession = {
  userId: string;
  username: string;
  role: StaffRole;
  cashierEventId?: string;
  workstationId?: string;
  workstationName?: string;
  workstationType?: "cashier" | "kitchen";
  loggedAt: string;
};

const SESSION_KEY = "af_staff_session_v1";
function nowIso() { return new Date().toISOString(); }
function hasWindow() { return typeof window !== "undefined"; }
function clearTemporaryCashierHint() {
  // A confirmed logout/new login ends the previous operational journey.
  // This removes only a tab-local hint; server session revocation is unchanged.
  if (hasWindow()) try { sessionStorage.removeItem("af_admin_cashier_context_v1"); } catch { /* Storage can be unavailable. */ }
}

// Display cache only. Every sensitive API authenticates the HttpOnly cookie.
let verifiedSession: StaffSession | null = null;
function sessionFromUser(user: { id: string; username: string; role: StaffRole; cashierEventId?: string | null; workstationId?: string | null; workstationName?: string | null; workstationType?: "cashier" | "kitchen" | null }): StaffSession {
  return { userId: user.id, username: user.username, role: user.role, cashierEventId: user.cashierEventId || undefined, workstationId: user.workstationId || undefined, workstationName: user.workstationName || undefined, workstationType: user.workstationType || undefined, loggedAt: nowIso() };
}
export async function refreshStaffSession(): Promise<StaffSession | null> {
  const response = await fetch("/api/staff/session", { cache: "no-store" });
  if (response.status === 401) { verifiedSession = null; return null; }
  const data = await response.json();
  if (!response.ok || !data.ok || !data.user) { verifiedSession = null; throw new Error("Staff session unavailable"); }
  verifiedSession = sessionFromUser(data.user);
  return verifiedSession;
}
export function getSession(): StaffSession | null { return verifiedSession; }
export function staffFetch(input: RequestInfo | URL, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set("x-af-staff-read", "1");
  if (verifiedSession) headers.set("x-staff-user-id", verifiedSession.userId);
  if (verifiedSession?.workstationId) {
    headers.set("x-workstation-id", verifiedSession.workstationId);
    try {
      const instance = sessionStorage.getItem(`af_cashier_instance_v3:${JSON.stringify([verifiedSession.cashierEventId, verifiedSession.workstationId])}`);
      if (instance) headers.set("x-cashier-instance-id", instance);
    } catch { /* Missing tab storage fails closed at the server. */ }
  }
  return fetch(input, { ...init, headers });
}
export async function clearSession() {
  const response = await fetch("/api/staff/session", { method: "DELETE" });
  if (!response.ok) throw new Error("Logout could not be confirmed. Please retry.");
  verifiedSession = null;
  clearTemporaryCashierHint();
  if (hasWindow()) localStorage.removeItem(SESSION_KEY);
}
export function updateSessionCashierEventId(cashierEventId: string) {
  // Legacy kitchen display hint only; it cannot grant any server permission.
  if (verifiedSession?.role === "kitchen") verifiedSession = { ...verifiedSession, cashierEventId };
}
export function resolveCashierEventId(session: StaffSession): string {
  return session.role === "cashier" ? session.cashierEventId || "" : "";
}
export async function login(username: string, password: string): Promise<{ ok: true; session: StaffSession } | { ok: false; error: string }> {
  verifiedSession = null;
  const response = await fetch("/api/staff/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
  const data = await response.json();
  if (!response.ok || !data.ok || !data.user) return { ok: false, error: "Invalid credentials or session unavailable" };
  verifiedSession = sessionFromUser(data.user);
  clearTemporaryCashierHint();
  if (hasWindow()) {
    localStorage.removeItem(SESSION_KEY);
    // Old account records are never accepted as credentials by the server.
  }
  return { ok: true, session: verifiedSession };
}

export function roleLandingPath(role: StaffRole) {
  if (role === "admin") return "/staff/admin";
  if (role === "cashier") return "/staff/caisse";
  return "/staff/cuisine";
}

export function getStaffRoleLabel(role: StaffRole, lang: Lang) {
  if (lang === "de") {
    if (role === "admin") return "Admin";
    if (role === "cashier") return "Kasse";
    return "Kuche";
  }
  if (lang === "en") {
    if (role === "admin") return "Admin";
    if (role === "cashier") return "Cashier";
    return "Kitchen";
  }
  if (role === "admin") return "Admin";
  if (role === "cashier") return "Caisse";
  return "Cuisine";
}
