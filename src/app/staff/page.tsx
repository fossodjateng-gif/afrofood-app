"use client";

import { useEffect } from "react";
import { getSession, roleLandingPath } from "@/lib/staff-auth";

export default function StaffPage() {
  useEffect(() => {
    const s = getSession();
    if (!s) {
      window.location.href = "/team/login";
      return;
    }
    window.location.href = roleLandingPath(s.role);
  }, []);

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: "system-ui" }}>
      <p>Redirection...</p>
    </main>
  );
}

