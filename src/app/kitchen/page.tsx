"use client";

import { useEffect, useState } from "react";
import type { OrderRow } from "@/lib/schema";

export default function KitchenPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const res = await fetch("/api/orders?status=NEW", { cache: "no-store" });
    const data = await res.json();
    setOrders(data);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 2000); // refresh auto
    return () => clearInterval(t);
  }, []);

  async function markReady(id: string) {
    await fetch(`/api/orders/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "READY" }),
    });
    refresh();
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", background: "#111", minHeight: "100vh", color: "white" }}>
      <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>🍳 Cuisine — Commandes</h1>
      <p style={{ opacity: 0.75 }}>Auto-refresh toutes les 2s</p>

      {loading ? <p>Chargement…</p> : null}
      {orders.length === 0 ? <p style={{ opacity: 0.8 }}>Aucune commande.</p> : null}

      <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
        {orders.map((o) => (
          <div key={o.id} style={{ background: "#1b1b1b", borderRadius: 16, padding: 16, border: "1px solid #333" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 900 }}>{o.id}</div>
                <div style={{ opacity: 0.75, marginTop: 2 }}>
                  {o.customer_name ? `Nom: ${o.customer_name} • ` : ""}
                  Paiement: {o.payment}
                </div>
              </div>

              <button
                onClick={() => markReady(o.id)}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "none",
                  background: "linear-gradient(135deg,#ff7a00,#ff3c00)",
                  color: "white",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                ✅ Prêt
              </button>
            </div>

            <div style={{ marginTop: 12, borderTop: "1px dashed #333", paddingTop: 10 }}>
              {Array.isArray(o.items) ? o.items.map((it, idx) => (
                <div key={idx} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
                  <div style={{ fontWeight: 800 }}>{it.name}</div>
                  <div style={{ fontWeight: 900 }}>x{it.qty}</div>
                </div>
              )) : null}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}