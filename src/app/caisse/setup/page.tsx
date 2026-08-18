"use client";

import { useEffect } from "react";
import { getSession } from "@/lib/staff-auth";

export default function CaisseSetupPage() {
  useEffect(() => {
    const session = getSession();
    if (!session) {
      window.location.href = "/team/login";
      return;
    }
    if (session.role !== "admin" && session.role !== "cashier") {
      window.location.href = "/staff";
      return;
    }
    window.location.href = "/caisse";
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        fontFamily: "system-ui",
        backgroundColor: "#FFF3E6",
        backgroundImage:
          "linear-gradient(180deg, rgba(255,243,230,0.82) 0%, rgba(255,243,230,0.9) 100%), url('/logo-afrofood.png')",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        backgroundSize: "cover, min(64vw, 420px)",
        color: "#111",
      }}
    >
      <div
        style={{
          maxWidth: 420,
          background: "rgba(255,255,255,0.94)",
          border: "1px solid #F1D7C8",
          borderRadius: 16,
          padding: 18,
          textAlign: "center",
          boxShadow: "0 12px 30px rgba(242,140,40,0.18)",
        }}
      >
        Redirection vers la caisse...
      </div>
    </main>
  );
}
