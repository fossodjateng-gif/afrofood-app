"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { refreshStaffSession, type StaffSession } from "@/lib/staff-auth";
import { StaffAccessState } from "@/components/StaffAccessState";
import { TemporaryCashierWorkspace } from "@/components/TemporaryCashierWorkspace";
import { hasTemporaryCashierContext } from "@/lib/temporary-cashier-client";

export function StaffSessionBoundary({ children }: { children: ReactNode }) {
  const path = usePathname();
  const staffPath = /^\/(staff|caisse|kitchen|screen|commande|stats|admin)(\/|$)/.test(path || "");
  const [snapshot, setSnapshot] = useState<{ path: string; session: StaffSession } | null>(null);
  const [failed, setFailed] = useState(false);
  const [absent, setAbsent] = useState(false);
  useEffect(() => {
    if (!staffPath) return;
    let stopped = false;
    const check = async () => {
      try {
        const session = await refreshStaffSession();
        if (stopped) return;
        if (!session) { setAbsent(true); setSnapshot(null); window.location.replace("/team/login"); return; }
        setSnapshot({ path, session });setFailed(false);setAbsent(false);
      } catch { if (!stopped) { setSnapshot(null);setFailed(true); } }
    };
    void check();
    window.addEventListener("focus", check);
    const interval = window.setInterval(check, 60000);
    return () => { stopped = true; window.removeEventListener("focus", check); window.clearInterval(interval); };
  }, [path, staffPath]);
  if (!staffPath) return children;
  if (!snapshot || snapshot.path !== path) return <StaffAccessState kind="session" error={failed ? "session_unavailable" : null} absent={absent} />;
  const temporaryTools = hasTemporaryCashierContext() &&
    (path === "/staff/caisse" || path === "/admin/menu" || /^\/staff\/cuisine(\/|$)/.test(path) || path === "/kitchen" || path === "/screen");
  return <div key={`${snapshot.session.userId}:${snapshot.session.role}:${snapshot.session.cashierEventId || ""}:${snapshot.session.workstationId || ""}`}>
    {temporaryTools ? <TemporaryCashierWorkspace key={path}>{children}</TemporaryCashierWorkspace> : children}
  </div>;
}
