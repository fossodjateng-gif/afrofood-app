"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { refreshCashierSession, hasTemporaryCashierContext, quitTemporaryCashier, temporaryCashierWorkspace, type CashierSession } from "@/lib/temporary-cashier-client";
import { getSavedLang } from "@/lib/translations";
import { startCashierLifecycle } from "@/lib/cashier-lifecycle";
import type { openCashierLease } from "@/lib/cashier-lease-client";
import { StaffAccessState } from "@/components/StaffAccessState";

export function AssignedCashierGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<CashierSession | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const closingRef = useRef(false), suspendedRef = useRef(false);
  const suspendCashierRef = useRef<(() => Promise<void>) | null>(null);
  const cashierLeaseRef = useRef<Awaited<ReturnType<typeof openCashierLease>> | null>(null);
  useEffect(() => {
    let stopped = false;
    void refreshCashierSession().then(value => {
      if (stopped) return;
      if (!value) throw new Error("session_required");
      if (!value?.cashierEventId || !value.workstationId || value.workstationType !== "cashier") throw new Error("workstation_assignment_required");
      setSession(value);
    }).catch(error => { if (!stopped) setAccessError(error instanceof Error ? error.message : "Session unavailable"); });
    return () => { stopped = true; };
  }, []);
  useEffect(() => {
    if (!session) return;
    return startCashierLifecycle({ session, eventId: session.cashierEventId!, lockError: "Caisse", unknownError: "Unavailable",
      closingRef, suspendedRef, suspendCashierRef, cashierLeaseRef, setIsUnlocked, setAccessError }).dispose;
  }, [session]);
  const temporary = hasTemporaryCashierContext();
  const lang = getSavedLang();
  const quitLabel = lang === "fr" ? "Quitter la caisse" : lang === "de" ? "Kasse verlassen" : "Leave register";
  const closeError = lang === "fr" ? "Fermeture non confirmée. Réessayez ou reconnectez-vous." : lang === "de" ? "Schließen nicht bestätigt. Erneut versuchen oder anmelden." : "Closure not confirmed. Retry or sign in again.";
  async function quit() {
    closingRef.current = true; setIsUnlocked(false);
    try { window.location.href = await quitTemporaryCashier(async () => { await suspendCashierRef.current?.(); }); }
    catch { setAccessError(closeError); }
  }
  const exit = temporary ? <div className="af-panel"><button className="af-btn af-primary" type="button" onClick={() => void quit()}>{quitLabel}</button>
    {accessError ? <a className="af-link-btn" href={temporaryCashierWorkspace()}>{lang === "fr" ? "Retour Admin" : lang === "de" ? "Zur Administration" : "Back to Admin"}</a> : null}</div> : null;
  if (!isUnlocked || accessError) return <>{exit}<StaffAccessState kind="cashier" error={accessError} /></>;
  return <div onClickCapture={event => {
    const link = (event.target as Element).closest("a[href]");
    if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || link.getAttribute("target") === "_blank") return;
    const href = link.getAttribute("href");
    if (!href || href.startsWith("#")) return;
    event.preventDefault();
    void suspendCashierRef.current?.().then(() => { window.location.href = href; });
  }}>{exit}{children}</div>;
}
