"use client";

import { useEffect, useMemo, useState } from "react";
import type { OrderRow } from "@/lib/schema";
import { subscribeOrderSync } from "@/lib/order-sync";
import { getSavedLang, saveLang, type Lang } from "@/lib/translations";

const UI_TEXT: Record<
  Lang,
  {
    title: string;
    subtitle: string;
    refreshing: string;
    refreshed: string;
    refresh: string;
    loading: string;
    noOrders: string;
    name: string;
    unnamed: string;
    ready: string;
    done: string;
    noItems: string;
  }
> = {
  de: {
    title: "Kuche - Bestellungen",
    subtitle: "Orange: in Vorbereitung, Grun: abholbereit",
    refreshing: "Aktualisierung...",
    refreshed: "Aktualisiert",
    refresh: "Aktualisieren",
    loading: "Laden...",
    noOrders: "Keine Kuchenbestellung.",
    name: "Name",
    unnamed: "Ohne Name",
    ready: "Fertig",
    done: "Guten Appetit",
    noItems: "Keine Artikeldetails",
  },
  fr: {
    title: "Cuisine - Commandes",
    subtitle: "Orange: en preparation, Vert: pret a retirer",
    refreshing: "Actualisation...",
    refreshed: "Actualise",
    refresh: "Actualiser",
    loading: "Chargement...",
    noOrders: "Aucune commande cuisine.",
    name: "Nom",
    unnamed: "Sans nom",
    ready: "Pret",
    done: "Bon appetit",
    noItems: "Aucun detail article",
  },
  en: {
    title: "Kitchen - Orders",
    subtitle: "Orange: preparing, Green: ready for pickup",
    refreshing: "Refreshing...",
    refreshed: "Refreshed",
    refresh: "Refresh",
    loading: "Loading...",
    noOrders: "No kitchen orders.",
    name: "Name",
    unnamed: "No name",
    ready: "Ready",
    done: "Done",
    noItems: "No item details",
  },
};

export default function KitchenPage() {
  const [lang, setLang] = useState<Lang>("de");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [justRefreshed, setJustRefreshed] = useState(false);
  const t = UI_TEXT[lang];

  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) => {
      const aRank = a.status === "NEW" ? 0 : 1;
      const bRank = b.status === "NEW" ? 0 : 1;
      if (aRank !== bRank) return aRank - bRank;
      return String(a.created_at).localeCompare(String(b.created_at));
    });
  }, [orders]);

  async function refresh() {
    try {
      setIsRefreshing(true);

      const [newRes, readyRes] = await Promise.all([
        fetch("/api/orders?status=NEW", { cache: "no-store" }),
        fetch("/api/orders?status=READY", { cache: "no-store" }),
      ]);

      const newData = await newRes.json();
      const readyData = await readyRes.json();

      setOrders([
        ...(Array.isArray(newData) ? newData : []),
        ...(Array.isArray(readyData) ? readyData : []),
      ]);

      setJustRefreshed(true);
      window.setTimeout(() => setJustRefreshed(false), 1200);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  }

  useEffect(() => {
    setLang(getSavedLang());
    refresh();
  }, []);

  useEffect(() => {
    return subscribeOrderSync((message) => {
      if (
        message.reason === "PAYMENT_VALIDATED" ||
        message.reason === "ORDER_READY" ||
        message.reason === "ORDER_DONE"
      ) {
        refresh();
      }
    });
  }, []);

  async function updateStatus(id: string, status: "READY" | "DONE") {
    await fetch(`/api/orders/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    refresh();
  }

  return (
    <main
      style={{
        padding: 24,
        fontFamily: "system-ui",
        backgroundColor: "#FFF3E6",
        backgroundImage:
          "linear-gradient(180deg, rgba(255,243,230,0.82) 0%, rgba(255,243,230,0.9) 100%), url('/logo-afrofood.png')",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center, center",
        backgroundSize: "cover, min(64vw, 420px)",
        minHeight: "100vh",
        color: "#111",
      }}
    >
      <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
        {(["de", "fr", "en"] as Lang[]).map((L) => (
          <button
            key={L}
            type="button"
            onClick={() => {
              setLang(L);
              saveLang(L);
            }}
            style={{
              padding: "6px 10px",
              borderRadius: 10,
              border: "1px solid #111",
              background: lang === L ? "#111" : "white",
              color: lang === L ? "white" : "#111",
              cursor: "pointer",
              fontWeight: 800,
            }}
          >
            {L.toUpperCase()}
          </button>
        ))}
      </div>
      <h1 style={{ margin: "10px 0 0 0", fontSize: 28, fontWeight: 900 }}>{t.title}</h1>
      <p style={{ opacity: 0.75 }}>{t.subtitle}</p>
      <button
        onClick={refresh}
        disabled={isRefreshing}
        style={{
          marginTop: 10,
          padding: "10px 14px",
          borderRadius: 12,
          border: "none",
          background: isRefreshing
            ? "linear-gradient(135deg,#f59e0b,#d97706)"
            : justRefreshed
            ? "linear-gradient(135deg,#16a34a,#15803d)"
            : "linear-gradient(135deg,#2563eb,#1d4ed8)",
          color: "white",
          fontWeight: 900,
          cursor: isRefreshing ? "not-allowed" : "pointer",
          opacity: isRefreshing ? 0.85 : 1,
        }}
      >
        {isRefreshing ? t.refreshing : justRefreshed ? t.refreshed : t.refresh}
      </button>

      {loading ? <p style={{ marginTop: 12 }}>{t.loading}</p> : null}
      {sortedOrders.length === 0 ? <p style={{ opacity: 0.8, marginTop: 12 }}>{t.noOrders}</p> : null}

      <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
        {sortedOrders.map((o) => {
          const isPreparing = o.status === "NEW";

          return (
            <div
              key={o.id}
              style={{
                background: isPreparing ? "rgba(249,115,22,0.22)" : "rgba(22,163,74,0.22)",
                borderRadius: 16,
                padding: 16,
                border: isPreparing ? "1px solid #fb923c" : "1px solid #22c55e",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 900 }}>{o.id}</div>
                  <div style={{ opacity: 0.9, marginTop: 2 }}>
                    {o.customer_name ? `${t.name}: ${o.customer_name}` : t.unnamed}
                  </div>
                </div>

                {isPreparing ? (
                  <button
                    onClick={() => updateStatus(o.id, "READY")}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 12,
                      border: "none",
                      background: "linear-gradient(135deg,#16a34a,#15803d)",
                      color: "white",
                      fontWeight: 900,
                      cursor: "pointer",
                    }}
                  >
                    {t.ready}
                  </button>
                ) : (
                  <button
                    onClick={() => updateStatus(o.id, "DONE")}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 12,
                      border: "none",
                      background: "linear-gradient(135deg,#111827,#1f2937)",
                      color: "white",
                      fontWeight: 900,
                      cursor: "pointer",
                    }}
                  >
                    {t.done}
                  </button>
                )}
              </div>

              <div style={{ marginTop: 12, borderTop: "1px dashed rgba(255,255,255,0.25)", paddingTop: 10 }}>
                {Array.isArray(o.items) && o.items.length > 0 ? (
                  o.items.map((it, idx) => (
                    <div key={idx} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
                      <div style={{ fontWeight: 800 }}>{it.name}</div>
                      <div style={{ fontWeight: 900 }}>x{it.qty}</div>
                    </div>
                  ))
                ) : (
                  <div style={{ opacity: 0.75 }}>{t.noItems}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
