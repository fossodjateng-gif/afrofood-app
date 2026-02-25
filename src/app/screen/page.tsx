"use client";

import { useEffect, useState } from "react";
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
    preparing: string;
    ready: string;
    none: string;
    unnamed: string;
  }
> = {
  de: {
    title: "Bestellungen",
    subtitle: "Live-Status der laufenden Bestellungen",
    refreshing: "Aktualisierung...",
    refreshed: "Aktualisiert",
    refresh: "Aktualisieren",
    preparing: "In Vorbereitung",
    ready: "Abholbereit",
    none: "Keine Bestellung",
    unnamed: "Ohne Name",
  },
  fr: {
    title: "Commande",
    subtitle: "Suivi des commandes en cours",
    refreshing: "Actualisation...",
    refreshed: "Actualise",
    refresh: "Actualiser",
    preparing: "En preparation",
    ready: "Pret a retirer",
    none: "Aucune commande",
    unnamed: "Sans nom",
  },
  en: {
    title: "Orders",
    subtitle: "Live order tracking",
    refreshing: "Refreshing...",
    refreshed: "Refreshed",
    refresh: "Refresh",
    preparing: "Preparing",
    ready: "Ready for pickup",
    none: "No orders",
    unnamed: "No name",
  },
};

export default function ScreenPage() {
  const [lang, setLang] = useState<Lang>("de");
  const [preparing, setPreparing] = useState<OrderRow[]>([]);
  const [ready, setReady] = useState<OrderRow[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [justRefreshed, setJustRefreshed] = useState(false);
  const t = UI_TEXT[lang];

  async function refresh() {
    try {
      setIsRefreshing(true);
      const [preparingRes, readyRes] = await Promise.all([
        fetch("/api/orders?status=NEW", { cache: "no-store" }),
        fetch("/api/orders?status=READY", { cache: "no-store" }),
      ]);

      const preparingData = await preparingRes.json();
      const readyData = await readyRes.json();

      setPreparing(Array.isArray(preparingData) ? preparingData : []);
      setReady(Array.isArray(readyData) ? readyData : []);
      setJustRefreshed(true);
      window.setTimeout(() => setJustRefreshed(false), 1200);
    } finally {
      setIsRefreshing(false);
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
      <div style={{ marginTop: 2, display: "flex", gap: 8 }}>
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
      <h1 style={{ margin: "10px 0 0 0", fontSize: 32, fontWeight: 900 }}>{t.title}</h1>
      <p style={{ marginTop: 6, opacity: 0.8 }}>{t.subtitle}</p>

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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginTop: 16 }}>
        <section style={{ borderRadius: 14, border: "1px solid #fb923c", background: "rgba(249,115,22,0.16)", padding: 14 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "#9a3412" }}>{t.preparing}</h2>
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {preparing.length === 0 ? <div style={{ opacity: 0.75 }}>{t.none}</div> : null}
            {preparing.map((o) => (
              <div key={o.id} style={{ borderRadius: 10, border: "1px solid #fb923c", padding: 10, background: "rgba(249,115,22,0.24)" }}>
                <div style={{ fontWeight: 900, fontSize: 22 }}>{o.id}</div>
                <div style={{ marginTop: 2, opacity: 0.9 }}>{o.customer_name || t.unnamed}</div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ borderRadius: 14, border: "1px solid #22c55e", background: "rgba(22,163,74,0.16)", padding: 14 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "#166534" }}>{t.ready}</h2>
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {ready.length === 0 ? <div style={{ opacity: 0.75 }}>{t.none}</div> : null}
            {ready.map((o) => (
              <div key={o.id} style={{ borderRadius: 10, border: "1px solid #22c55e", padding: 10, background: "rgba(22,163,74,0.24)" }}>
                <div style={{ fontWeight: 900, fontSize: 22 }}>{o.id}</div>
                <div style={{ marginTop: 2, opacity: 0.9 }}>{o.customer_name || t.unnamed}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
