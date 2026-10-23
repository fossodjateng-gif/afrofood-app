"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { refreshStaffSession, type StaffSession } from "@/lib/staff-auth";
import { startCashierLifecycle } from "@/lib/cashier-lifecycle";
import type { openCashierLease } from "@/lib/cashier-lease-client";

export function AssignedCashierGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StaffSession | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const closingRef = useRef(false), suspendedRef = useRef(false);
  const suspendCashierRef = useRef<(() => Promise<void>) | null>(null);
  const cashierLeaseRef = useRef<Awaited<ReturnType<typeof openCashierLease>> | null>(null);
  useEffect(() => {
    let stopped = false;
    void refreshStaffSession().then(value => {
      if (stopped) return;
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
  if (!isUnlocked || accessError) return <main role="status"><p>{accessError || "Vérification de la caisse…"}</p><a href="/staff">Retour</a></main>;
  return <div onClickCapture={event => {
    const link = (event.target as Element).closest("a[href]");
    if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || link.getAttribute("target") === "_blank") return;
    const href = link.getAttribute("href");
    if (!href || href.startsWith("#")) return;
    event.preventDefault();
    void suspendCashierRef.current?.().then(() => { window.location.href = href; });
  }}>{children}</div>;
}
