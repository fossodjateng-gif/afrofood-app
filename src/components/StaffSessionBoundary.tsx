"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { refreshStaffSession, type StaffSession } from "@/lib/staff-auth";

export function StaffSessionBoundary({ children }: { children: ReactNode }) {
  const path = usePathname();
  const staffPath = /^\/(staff|caisse|kitchen|screen|commande|stats|admin)(\/|$)/.test(path || "");
  const [snapshot, setSnapshot] = useState<{ path: string; session: StaffSession } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!staffPath) return;
    let stopped = false;
    const check = async () => {
      try {
        const session = await refreshStaffSession();
        if (stopped) return;
        if (!session) { window.location.replace("/team/login"); return; }
        setSnapshot({ path, session });setFailed(false);
      } catch { if (!stopped) { setSnapshot(null);setFailed(true); } }
    };
    void check();
    window.addEventListener("focus", check);
    const interval = window.setInterval(check, 60000);
    return () => { stopped = true; window.removeEventListener("focus", check); window.clearInterval(interval); };
  }, [path, staffPath]);
  if (!staffPath) return children;
  if (!snapshot || snapshot.path !== path) return <main role="status">{failed ? "Staff session unavailable. Please reload." : "AfroFood…"}</main>;
  return <div key={`${snapshot.session.userId}:${snapshot.session.role}:${snapshot.session.cashierEventId || ""}`}>{children}</div>;
}
