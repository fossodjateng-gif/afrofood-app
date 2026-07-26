"use client";

import { useEffect } from "react";
import { getSession } from "@/lib/staff-auth";

export default function StaffReadyPage() {
  useEffect(() => {
    const s = getSession();
    if (!s) {
      window.location.href = "/team/login";
      return;
    }
    if (s.role !== "kitchen" && s.role !== "cashier" && s.role !== "admin") {
      window.location.href = "/staff";
      return;
    }
    window.location.href = "/screen";
  }, []);

  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>Redirection commandes pretes...</main>;
}

