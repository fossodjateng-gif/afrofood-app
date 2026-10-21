"use client";

import type { Lang } from "@/lib/translations";

export type StaffRole = "admin" | "cashier" | "kitchen";

export type StaffUser = {
  id: string;
  username: string;
  password: string;
  role: StaffRole;
  cashierEventId?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StaffSession = {
  userId: string;
  username: string;
  role: StaffRole;
  cashierEventId?: string;
  loggedAt: string;
};

const USERS_KEY = "af_staff_users_v1";
const DELETED_USERS_KEY = "af_staff_deleted_usernames_v1";
const SESSION_KEY = "af_staff_session_v1";
const TAP_SETUP_PROGRESS_PREFIX = "af_ttp_setup_progress_";

function nowIso() {
  return new Date().toISOString();
}

function defaultUsers(): StaffUser[] { return []; }

function hasWindow() {
  return typeof window !== "undefined";
}

function getDeletedUsernames() {
  if (!hasWindow()) return new Set<string>();
  try {
    const parsed = JSON.parse(localStorage.getItem(DELETED_USERS_KEY) || "[]") as string[];
    return new Set(parsed.map((username) => String(username || "").toLowerCase()).filter(Boolean));
  } catch {
    return new Set<string>();
  }
}

function saveDeletedUsernames(next: Set<string>) {
  if (!hasWindow()) return;
  localStorage.setItem(DELETED_USERS_KEY, JSON.stringify([...next]));
}

export function getUsers(): StaffUser[] {
  if (!hasWindow()) return defaultUsers();
  const raw = localStorage.getItem(USERS_KEY);
  if (!raw) {
    const defaults = defaultUsers();
    localStorage.setItem(USERS_KEY, JSON.stringify(defaults));
    return defaults;
  }
  try {
    const parsed = (JSON.parse(raw) as StaffUser[]).map((user) => ({ ...user, password: "" }));
    localStorage.setItem(USERS_KEY, JSON.stringify(parsed));
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("invalid");
    const deletedUsernames = getDeletedUsernames();
    const defaults = defaultUsers();
    const existingUsernames = new Set(parsed.map((user) => user.username.toLowerCase()));
    const missingDefaults = defaults.filter(
      (user) =>
        !existingUsernames.has(user.username.toLowerCase()) &&
        !deletedUsernames.has(user.username.toLowerCase())
    );
    if (missingDefaults.length === 0) return parsed;
    const merged = [...parsed, ...missingDefaults];
    localStorage.setItem(USERS_KEY, JSON.stringify(merged));
    return merged;
  } catch {
    const defaults = defaultUsers();
    localStorage.setItem(USERS_KEY, JSON.stringify(defaults));
    return defaults;
  }
}

function saveUsers(next: StaffUser[]) {
  if (!hasWindow()) return;
  localStorage.setItem(USERS_KEY, JSON.stringify(next.map((user) => ({ ...user, password: "" }))));
}

function normalizeCashierEventId(role: StaffRole, cashierEventId?: string) {
  if (role !== "cashier" && role !== "kitchen") return "";
  return String(cashierEventId || "").trim();
}

function resetTapSetupProgress(userId: string) {
  if (!hasWindow()) return;
  localStorage.removeItem(`${TAP_SETUP_PROGRESS_PREFIX}${userId}`);
}

// Display cache only. Every sensitive API authenticates the HttpOnly cookie.
let verifiedSession: StaffSession | null = null;
function sessionFromUser(user: { id: string; username: string; role: StaffRole; cashierEventId?: string | null }): StaffSession {
  return { userId: user.id, username: user.username, role: user.role, cashierEventId: user.cashierEventId || undefined, loggedAt: nowIso() };
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
  if (verifiedSession) headers.set("x-staff-user-id", verifiedSession.userId);
  return fetch(input, { ...init, headers });
}
export async function clearSession() {
  const response = await fetch("/api/staff/session", { method: "DELETE" });
  if (!response.ok) throw new Error("Logout could not be confirmed. Please retry.");
  verifiedSession = null;
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
  if (hasWindow()) {
    localStorage.removeItem(SESSION_KEY);
    // Old account records are never accepted as credentials by the server.
  }
  return { ok: true, session: verifiedSession };
}

export function createUser(input: { username: string; password: string; role: StaffRole; cashierEventId?: string }) {
  const username = String(input.username || "").trim();
  const password = String(input.password || "").trim();
  if (!username) throw new Error("Missing username");
  if (!password) throw new Error("Missing password");
  const users = getUsers();
  if (users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
    throw new Error("Username already exists");
  }
  const now = nowIso();
  const nextUser: StaffUser = {
    id: `u-${Date.now()}`,
    username,
    password,
    role: input.role,
    cashierEventId: normalizeCashierEventId(input.role, input.cashierEventId) || undefined,
    active: true,
    createdAt: now,
    updatedAt: now,
  };
  const next = [...users, nextUser];
  const deletedUsernames = getDeletedUsernames();
  deletedUsernames.delete(username.toLowerCase());
  saveDeletedUsernames(deletedUsernames);
  saveUsers(next);
  resetTapSetupProgress(nextUser.id);
  return nextUser;
}

export function updateUser(
  userId: string,
  patch: Partial<Pick<StaffUser, "role" | "active" | "password" | "cashierEventId">>
) {
  const users = getUsers();
  const next = users.map((u) =>
    u.id === userId
      ? (() => {
          const nextRole = patch.role ?? u.role;
          return {
            ...u,
            role: nextRole,
            active: patch.active ?? u.active,
            password: patch.password ?? u.password,
            cashierEventId: normalizeCashierEventId(
              nextRole,
              patch.cashierEventId !== undefined ? patch.cashierEventId : u.cashierEventId
            ) || undefined,
            updatedAt: nowIso(),
          };
        })()
      : u
  );
  saveUsers(next);

}

export async function deleteUser(userId: string) {
  const users = getUsers();
  const deleted = users.find((u) => u.id === userId);
  const next = users.filter((u) => u.id !== userId);
  if (deleted) {
    const deletedUsernames = getDeletedUsernames();
    deletedUsernames.add(deleted.username.toLowerCase());
    saveDeletedUsernames(deletedUsernames);
  }
  saveUsers(next);
  const s = getSession();
  if (s?.userId === userId) await clearSession();
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
