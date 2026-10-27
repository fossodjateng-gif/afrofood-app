"use client";
import { useEffect, useState } from "react";
import { refreshCashierSession, hasTemporaryCashierContext, temporaryCashierWorkspace } from "@/lib/temporary-cashier-client";
export default function StaffCaissePage() {
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    void (async () => {
      const session = await refreshCashierSession();
      if (!session) { window.location.href = "/team/login"; return; }
      if (session.role !== "cashier" && session.role !== "admin") { window.location.href = "/staff"; return; }
      if (!session.cashierEventId || !session.workstationId || session.workstationType !== "cashier") {
        queueMicrotask(() => setBlocked(true)); return;
      }
      window.location.href = "/caisse";
    })().catch(() => setBlocked(true));
  }, []);
  return <main role="status" style={{ padding: 24 }}><p>{blocked ? "Une affectation serveur valide est requise pour ouvrir cette caisse." : "Ouverture de votre caisse..."}</p>{blocked ? <a href={hasTemporaryCashierContext() ? temporaryCashierWorkspace() : "/staff"}>Retour</a> : null}</main>;
}
