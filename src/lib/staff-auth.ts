"use client";

import type { Lang } from "@/lib/translations";

export type StaffRole = "admin" | "cashier" | "kitchen";

export type StaffUser = {
  id: string;
  username: string;
  password: string;
  role: StaffRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StaffSession = {
  userId: string;
  username: string;
  role: StaffRole;
  loggedAt: string;
};

const USERS_KEY = "af_staff_users_v1";
const SESSION_KEY = "af_staff_session_v1";
const TAP_SETUP_PROGRESS_PREFIX = "af_ttp_setup_progress_";

function nowIso() {
  return new Date().toISOString();
}

function defaultUsers(): StaffUser[] {
  const now = nowIso();
  return [
    {
      id: "u-admin-1",
      username: "admin",
      password: "0603",
      role: "admin",
      active: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "u-cashier-1",
      username: "existinguser",
      password: "0603",
      role: "cashier",
      active: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "u-kitchen-1",
      username: "newuser",
      password: "0603",
      role: "kitchen",
      active: true,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function hasWindow() {
  return typeof window !== "undefined";
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
    const parsed = JSON.parse(raw) as StaffUser[];
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("invalid");
    return parsed;
  } catch {
    const defaults = defaultUsers();
    localStorage.setItem(USERS_KEY, JSON.stringify(defaults));
    return defaults;
  }
}

function saveUsers(next: StaffUser[]) {
  if (!hasWindow()) return;
  localStorage.setItem(USERS_KEY, JSON.stringify(next));
}

function resetTapSetupProgress(userId: string) {
  if (!hasWindow()) return;
  localStorage.removeItem(`${TAP_SETUP_PROGRESS_PREFIX}${userId}`);
}

export function getSession(): StaffSession | null {
  if (!hasWindow()) return null;
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StaffSession;
  } catch {
    return null;
  }
}

export function clearSession() {
  if (!hasWindow()) return;
  localStorage.removeItem(SESSION_KEY);
}

export function login(username: string, password: string): { ok: true; session: StaffSession } | { ok: false; error: string } {
  const users = getUsers();
  const u = users.find(
    (it) => it.username.toLowerCase() === String(username || "").trim().toLowerCase()
  );
  if (!u || !u.active) return { ok: false, error: "User not found or inactive" };
  if (u.password !== password) return { ok: false, error: "Invalid credentials" };
  const session: StaffSession = {
    userId: u.id,
    username: u.username,
    role: u.role,
    loggedAt: nowIso(),
  };
  if (hasWindow()) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return { ok: true, session };
}

export function createUser(input: { username: string; password: string; role: StaffRole }) {
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
    active: true,
    createdAt: now,
    updatedAt: now,
  };
  const next = [...users, nextUser];
  saveUsers(next);
  resetTapSetupProgress(nextUser.id);
  return nextUser;
}

export function updateUser(userId: string, patch: Partial<Pick<StaffUser, "role" | "active" | "password">>) {
  const users = getUsers();
  const next = users.map((u) =>
    u.id === userId
      ? {
          ...u,
          role: patch.role ?? u.role,
          active: patch.active ?? u.active,
          password: patch.password ?? u.password,
          updatedAt: nowIso(),
        }
      : u
  );
  saveUsers(next);
}

export function deleteUser(userId: string) {
  const users = getUsers();
  const next = users.filter((u) => u.id !== userId);
  saveUsers(next);
  const s = getSession();
  if (s?.userId === userId) clearSession();
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
