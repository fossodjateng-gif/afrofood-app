"use client";

import { useEffect } from "react";
import { getSession } from "@/lib/staff-auth";

export default function StaffCaissePage() {
  useEffect(() => {
    const s = getSession();
    if (!s) {
      window.location.href = "/team/login";
      return;
    }
    if (s.role !== "cashier" && s.role !== "admin") {
      window.location.href = "/staff";
      return;
    }
    // Cashier flow starts from the Tap to Pay setup screen.
    window.location.href = "/caisse/setup";
  }, []);

  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>Redirection Tap to Pay...</main>;
}
