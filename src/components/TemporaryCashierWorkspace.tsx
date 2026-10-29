"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { startCashierLifecycle } from "@/lib/cashier-lifecycle";
import type { openCashierLease } from "@/lib/cashier-lease-client";
import { refreshCashierSession, quitTemporaryCashier, type CashierSession } from "@/lib/temporary-cashier-client";

const WorkspaceContext = createContext<{ quit: () => Promise<void> } | null>(null);
export const useTemporaryCashierWorkspace = () => useContext(WorkspaceContext);

// Non-sale pages need the same lease lifecycle as the two existing POS pages.
// POS pages keep their own lifecycle; never mount two owners in one document.
export function TemporaryCashierWorkspace({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<CashierSession | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const closingRef = useRef(false);
  const suspendedRef = useRef(false);
  const suspendCashierRef = useRef<(() => Promise<void>) | null>(null);
  const cashierLeaseRef = useRef<Awaited<ReturnType<typeof openCashierLease>> | null>(null);
  useEffect(() => {
    let stopped = false;
    void refreshCashierSession().then(current => {
      if (stopped) return;
      if (!current?.temporaryContextId || !current.temporaryInstanceId || current.role !== "admin" || !current.cashierEventId) throw new Error("cashier_context_invalid");
      const requestedEvent = new URLSearchParams(window.location.search).get("adminEventId");
      if (requestedEvent !== null && requestedEvent !== current.cashierEventId) throw new Error("cashier_event_context_mismatch");
      setSession(current);
    }).catch(() => { if (!stopped) setAccessError("cashier_context_invalid"); });
    return () => { stopped = true; };
  }, []);
  useEffect(() => {
    if (!session?.cashierEventId) return;
    const lifecycle = startCashierLifecycle({ session, eventId: session.cashierEventId,
      lockError: "Caisse temporaire indisponible", unknownError: "cashier_context_invalid",
      closingRef, suspendedRef, suspendCashierRef, cashierLeaseRef, setIsUnlocked, setAccessError });
    return () => lifecycle.dispose();
  }, [session]);

  async function quit() {
    if (leaving) return;
    closingRef.current = true;
    setLeaving(true);
    setIsUnlocked(false);
    try {
      const destination = await quitTemporaryCashier(async () => { await suspendCashierRef.current?.(); });
      window.location.assign(destination);
    } catch {
      setAccessError("La fermeture de la caisse a échoué. Réessayez pour revenir à Admin.");
      setLeaving(false);
    }
  }
  const exit = <button type="button" className="af-link-btn" disabled={leaving} onClick={() => void quit()}>Quitter la caisse / Admin</button>;
  return <WorkspaceContext.Provider value={{ quit }}>
    {accessError || !isUnlocked ? <div className="af-panel">
      <p role={accessError ? "alert" : "status"}>{accessError ? "Caisse temporaire indisponible. Fermez ce contexte puis ouvrez à nouveau la caisse depuis Admin." : "Validation de la caisse temporaire…"}</p>
      {exit}
    </div> : children}
  </WorkspaceContext.Provider>;
}
