"use client";

import { staffFetch } from "@/lib/staff-auth";

const HANDOFF_KEY = "af_cashier_lease_handoff_v1";
const INSTANCE_ID = /^[a-f0-9-]{36}$/;

export function createCashierLease(eventId: string, instanceId = crypto.randomUUID()) {
  let stopped = false;
  let pending: Promise<unknown> = Promise.resolve();
  let releasePromise: Promise<void> | null = null;

  async function send(action: "acquire" | "heartbeat" | "release") {
    const response = await staffFetch("/api/cashier-lock", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, eventId, instanceId }), keepalive: action === "release",
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) {
      const holder = String(data?.lock?.username || "");
      throw new Error(holder ? `cashier_locked: ${holder}` : data?.error || "cashier_lock_unavailable");
    }
  }
  function request(action: "acquire" | "heartbeat") {
    const result = pending.catch(() => undefined).then(() => {
      if (stopped) throw new Error("cashier_lock_closed");
      return send(action);
    });
    pending = result;
    return result;
  }
  return {
    instanceId,
    acquire: () => request("acquire"),
    heartbeat: () => request("heartbeat"),
    suspend() {
      stopped = true; // Cancel queued requests without releasing the server lease.
    },
    release() {
      stopped = true; // Synchronous: no new heartbeat can start while leaving.
      if (!releasePromise) {
        releasePromise = pending.catch(() => undefined).then(() => send("release"));
        pending = releasePromise;
      }
      return releasePromise;
    },
    handoff() {
      sessionStorage.setItem(HANDOFF_KEY, JSON.stringify({ eventId, instanceId }));
    },
  };
}

export function takeCashierLeaseHandoff(eventId: string): string | undefined {
  try {
    const raw = sessionStorage.getItem(HANDOFF_KEY);
    sessionStorage.removeItem(HANDOFF_KEY); // One navigation only, never a reusable tab identity.
    const saved = raw ? JSON.parse(raw) : null;
    if (saved?.eventId === eventId && typeof saved.instanceId === "string" && INSTANCE_ID.test(saved.instanceId)) return saved.instanceId;
  } catch { /* No handoff when tab storage is unavailable. */ }
}

// Tab-local persistence is only a lease hint. Web Locks prevent a copied
// sessionStorage (duplicate tab/window) from joining an already active instance.
export async function openCashierLease(eventId: string) {
  if (!navigator.locks) throw new Error("cashier_tab_isolation_unavailable");
  const key = `af_cashier_instance_v1:${eventId}`;
  const handoff = takeCashierLeaseHandoff(eventId);
  const saved = sessionStorage.getItem(key);
  const candidate = handoff || (saved && INSTANCE_ID.test(saved) ? saved : crypto.randomUUID());

  async function claim(instanceId: string) {
    let unlock = () => {};
    let task: Promise<unknown> = Promise.resolve();
    const granted = await new Promise<boolean>((resolve, reject) => {
      task = navigator.locks.request(`af_cashier_document_v1:${instanceId}`, { ifAvailable: true }, lock => {
        if (!lock) { resolve(false); return; }
        return new Promise<void>(done => { unlock = done; resolve(true); });
      }).catch(reject);
    });
    return granted ? async () => { unlock(); await task; } : null;
  }

  let instanceId = candidate;
  let detach = await claim(instanceId);
  if (!detach) {
    instanceId = crypto.randomUUID();
    detach = await claim(instanceId);
  }
  if (!detach) throw new Error("cashier_tab_isolation_unavailable");
  try { sessionStorage.setItem(key, instanceId); }
  catch (error) { await detach(); throw error; }
  const lease = createCashierLease(eventId, instanceId);
  const detachDocument = detach;
  return {
    ...lease,
    handedOff: handoff === instanceId,
    // On refresh/pagehide detach only the local document. Keep the server lease
    // and its tab-local ID: the new document must resume without racing release.
    detach() {
      lease.suspend();
      return detachDocument();
    },
    release() {
      try { if (sessionStorage.getItem(key) === instanceId) sessionStorage.removeItem(key); }
      catch { /* Storage failure must not prevent server revocation on logout. */ }
      const released = lease.release();
      void released.then(detachDocument, detachDocument);
      return released;
    },
  };
}
