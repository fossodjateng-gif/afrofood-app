"use client";
import { useEffect, useState } from "react";
import { getSession } from "@/lib/staff-auth";
export default function StaffCaissePage() {
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const session = getSession();
    if (!session) { window.location.href = "/team/login"; return; }
    if (session.role !== "cashier" && session.role !== "admin") { window.location.href = "/staff"; return; }
    if (!session.cashierEventId || !session.workstationId || session.workstationType !== "cashier") {
      queueMicrotask(() => setBlocked(true)); return;
    }
    window.location.href = "/caisse";
  }, []);
  return <main role="status" style={{ padding: 24 }}><p>{blocked ? "Une affectation serveur valide est requise pour ouvrir cette caisse." : "Ouverture de votre caisse..."}</p>{blocked ? <a href="/staff">Retour</a> : null}</main>;
}
