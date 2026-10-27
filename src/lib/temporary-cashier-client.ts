"use client";

import { getSession, refreshStaffSession, staffFetch, type StaffSession } from "@/lib/staff-auth";
const STORAGE_KEY = "af_admin_cashier_context_v1";
type TemporaryContext = { userId: string; contextId: string; eventId: string; workstationId: string; instanceId: string; expiresAt: string; blocked?: boolean };
export type CashierSession = StaffSession & { temporaryContextId?: string; temporaryInstanceId?: string };
let verified: CashierSession | null = null;
const blockedIds = new Set<string>();

export function hasTemporaryCashierContext() {
  if (typeof window === "undefined") return false;
  try { return sessionStorage.getItem(STORAGE_KEY) !== null; } catch { return true; }
}
export function readTemporaryCashierContext(): TemporaryContext | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (raw === null) return null;
  const value = JSON.parse(raw) as TemporaryContext;
  if (!value || !/^[a-f0-9]{64}$/.test(value.contextId) || !value.userId || !value.eventId || !value.workstationId || !/^[a-f0-9-]{36}$/.test(value.instanceId)) throw new Error("cashier_context_invalid");
  return value;
}
export function temporaryCashierWorkspace() {
  try { const context = readTemporaryCashierContext(); return context ? `/staff/admin/events?eventId=${encodeURIComponent(context.eventId)}` : "/staff/admin"; }
  catch { return "/staff/admin"; }
}
export function blockTemporaryCashierContext(contextId: string) {
  blockedIds.add(contextId);
  if (verified?.temporaryContextId === contextId) verified = null;
  try { const saved = readTemporaryCashierContext(); if (saved?.contextId === contextId) sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...saved, blocked: true })); }
  catch { /* The in-memory block remains effective if storage is unavailable. */ }
}
export function forgetTemporaryCashierContext(contextId: string) {
  const saved = readTemporaryCashierContext();
  if (saved?.contextId !== contextId) return; // A stale close never clears a replacement.
  sessionStorage.removeItem(STORAGE_KEY);
  const key = `af_cashier_instance_v3:${JSON.stringify([saved.eventId, saved.workstationId])}`;
  if (sessionStorage.getItem(key) === saved.instanceId) sessionStorage.removeItem(key);
  verified = null;
}

// Only cashier call sites use this transport. Common staffFetch/session identity
// never receives a temporary assignment. Storage is a hint, not authorization.
export async function cashierFetch(input: RequestInfo | URL, init?: RequestInit) {
  if (!hasTemporaryCashierContext()) return staffFetch(input, init);
  const context = readTemporaryCashierContext();
  const session = getSession();
  if (!context || context.blocked || blockedIds.has(context.contextId) || Date.parse(context.expiresAt) <= Date.now() || !Number.isFinite(Date.parse(context.expiresAt))) throw new Error("cashier_context_invalid");
  if (!session || session.role !== "admin" || session.userId !== context.userId) throw new Error("cashier_context_identity_changed");
  if (typeof input !== "string" || !input.startsWith("/api/")) throw new Error("cashier_context_request_invalid");
  const headers = new Headers(init?.headers);
  headers.set("x-af-staff-read", "1"); headers.set("x-staff-user-id", session.userId);
  headers.set("x-cashier-context-id", context.contextId); headers.set("x-cashier-instance-id", context.instanceId);
  headers.set("x-workstation-id", context.workstationId);
  const response = await fetch(input, { ...init, headers });
  if (response.status === 401 || response.status === 423) blockTemporaryCashierContext(context.contextId);
  return response;
}
export function getCashierSession(): CashierSession | null {
  const session = getSession();
  if (!hasTemporaryCashierContext()) return session;
  const context = readTemporaryCashierContext();
  if (!context || context.blocked || blockedIds.has(context.contextId) || verified?.temporaryContextId !== context.contextId ||
    session?.role !== "admin" || verified.userId !== session.userId) return null;
  return { ...verified, username: session.username, role: session.role };
}
export async function refreshCashierSession(): Promise<CashierSession | null> {
  verified = null;
  const session = await refreshStaffSession();
  if (!hasTemporaryCashierContext()) return session;
  const saved = readTemporaryCashierContext();
  if (!saved) throw new Error("cashier_context_invalid");
  try {
    const response = await cashierFetch("/api/staff/cashier-context", { cache: "no-store" });
    const data = await response.json();
    const c = data.context;
    if (!response.ok || !data.ok || !session || session.role !== "admin" || c?.role !== "admin" || c.userId !== session.userId ||
      c.contextId !== saved.contextId || c.eventId !== saved.eventId || c.workstationId !== saved.workstationId || c.instanceId !== saved.instanceId) throw new Error("cashier_context_invalid");
    verified = { ...session, cashierEventId: c.eventId, workstationId: c.workstationId, workstationName: c.workstationName,
      workstationType: "cashier", temporaryContextId: c.contextId, temporaryInstanceId: c.instanceId };
    return verified;
  } catch (error) { blockTemporaryCashierContext(saved.contextId); throw error; }
}
export async function openTemporaryCashierContext(eventId: string, workstationId: string, instanceId: string) {
  const session = getSession();
  if (!session || session.role !== "admin") throw new Error("admin_required");
  const response = await staffFetch("/api/staff/cashier-context", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId, workstationId, instanceId }) });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || "cashier_context_unavailable");
  const context = data.context;
  try {
    if (!context || context.eventId !== eventId || context.workstationId !== workstationId || context.instanceId !== instanceId || !/^[a-f0-9]{64}$/.test(context.contextId)) throw new Error("cashier_context_invalid");
    if (getSession()?.userId !== session.userId || getSession()?.role !== "admin") throw new Error("cashier_context_identity_changed");
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...context, userId: session.userId }));
    verified = null;
    return context;
  } catch (error) {
    // If tab storage fails, do not leave an opened server context behind.
    if (context?.contextId) await staffFetch("/api/staff/cashier-context", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contextId: context.contextId }) }).catch(() => undefined);
    throw error;
  }
}
export async function quitTemporaryCashier(suspend: () => Promise<void>) {
  const saved = readTemporaryCashierContext();
  if (!saved) throw new Error("cashier_context_invalid");
  const destination = `/staff/admin/events?eventId=${encodeURIComponent(saved.eventId)}`;
  blockTemporaryCashierContext(saved.contextId);
  await suspend();
  const response = await staffFetch("/api/staff/cashier-context", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contextId: saved.contextId }), keepalive: true });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error("cashier_context_close_failed");
  forgetTemporaryCashierContext(saved.contextId);
  return destination;
}
