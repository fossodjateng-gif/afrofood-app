"use client";

import { useEffect, useState } from "react";
import type { OrderRow } from "@/lib/schema";

export default function ScreenPage() {
  const [ready, setReady] = useState<OrderRow[]>([]);

  async function refresh() {
    const res = await fetch("/api/orders?status=READY", { cache: "no-store" });
    const data = await res.json();
    setReady(data);
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, []);

  return (
    <main style={{ padding: 30, fontFamily: "system-ui", background: "#FFF3E6", minHeight: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 28 }}>🧡</div>
        <h1 style={{ margin: 0, fontSize: 34, fontWeight: 1000, color: "#111" }}>Prêt à retirer</h1>
      </div>
      <p style={{ marginTop: 6, opacity: 0.7 }}>Regarde ton numéro de commande</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginTop: 18 }}>
        {ready.slice(0, 12).map((o) => (
          <div
            key={o.id}
            style={{
              background: "white",
              border: "1px solid #F1D7C8",
              borderRadius: 18,
              padding: 18,
              boxShadow: "0 12px 30px rgba(242,140,40,0.12)",
            }}
          >
            <div style={{ fontSize: 28, fontWeight: 1000, color: "#111" }}>{o.id}</div>
            {o.customer_name ? (
              <div style={{ marginTop: 6, fontWeight: 900, color: "#ff4d00" }}>{o.customer_name}</div>
            ) : (
              <div style={{ marginTop: 6, opacity: 0.7 }}>—</div>
            )}
          </div>
        ))}
      </div>

      {ready.length === 0 ? (
        <div style={{ marginTop: 20, opacity: 0.7 }}>Aucune commande prête pour le moment.</div>
      ) : null}
    </main>
  );
}