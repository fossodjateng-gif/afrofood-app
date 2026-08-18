"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { OrderRow } from "@/lib/schema";
import { subscribeOrderSync } from "@/lib/order-sync";
import { getSavedLang, saveLang, type Lang } from "@/lib/translations";
import { getSession, getStaffRoleLabel, type StaffRole, updateSessionCashierEventId } from "@/lib/staff-auth";
import { goBackOr } from "@/lib/client-nav";

const UI_TEXT: Record<
  Lang,
	  {
    title: string;
    subtitle: string;
    back: string;
    refreshing: string;
    refreshed: string;
    refresh: string;
    loading: string;
	    noOrders: string;
      eventAssigned: string;
      noEventAssigned: string;
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
    back: "Zuruck",
    refreshing: "Aktualisierung...",
    refreshed: "Aktualisiert",
    refresh: "Aktualisieren",
    loading: "Laden...",
	    noOrders: "Keine Kuchenbestellung.",
      eventAssigned: "Zugewiesenes Event",
      noEventAssigned: "Kein Event fur diese Kuche zugewiesen.",
	    name: "Name",
    unnamed: "Ohne Name",
    ready: "Fertig",
    done: "Guten Appetit",
    noItems: "Keine Artikeldetails",
  },
  fr: {
    title: "Cuisine - Commandes",
    subtitle: "Orange: en preparation, Vert: pret a retirer",
    back: "Retour",
    refreshing: "Actualisation...",
    refreshed: "Actualise",
    refresh: "Actualiser",
    loading: "Chargement...",
	    noOrders: "Aucune commande cuisine.",
      eventAssigned: "Evenement assigne",
      noEventAssigned: "Aucun evenement n'est assigne a cette cuisine.",
	    name: "Nom",
    unnamed: "Sans nom",
    ready: "Pret",
    done: "Bon appetit",
    noItems: "Aucun detail article",
  },
  en: {
    title: "Kitchen - Orders",
    subtitle: "Orange: preparing, Green: ready for pickup",
    back: "Back",
    refreshing: "Refreshing...",
    refreshed: "Refreshed",
    refresh: "Refresh",
    loading: "Loading...",
	    noOrders: "No kitchen orders.",
      eventAssigned: "Assigned event",
      noEventAssigned: "No event is assigned to this kitchen.",
	    name: "Name",
    unnamed: "No name",
    ready: "Ready",
    done: "Done",
    noItems: "No item details",
  },
};

function KitchenPageContent() {
  const searchParams = useSearchParams();
  const [lang, setLang] = useState<Lang>("de");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [justRefreshed, setJustRefreshed] = useState(false);
  const [staffRole, setStaffRole] = useState<StaffRole | null>(null);
  const [assignedEventId, setAssignedEventId] = useState("");
  const [assignedEventName, setAssignedEventName] = useState("");
  const [accessError, setAccessError] = useState<string | null>(null);
  const t = UI_TEXT[lang];
  const fromCaisse = String(searchParams.get("from") || "").toLowerCase() === "caisse";
  const backHref = fromCaisse ? "/staff/cuisine?from=caisse" : "/staff/cuisine";

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
      setAccessError(null);

      const eventFilter = assignedEventId ? `&eventId=${encodeURIComponent(assignedEventId)}` : "";

      const [newRes, readyRes] = await Promise.all([
        fetch(`/api/orders?status=NEW${eventFilter}`, { cache: "no-store" }),
        fetch(`/api/orders?status=READY${eventFilter}`, { cache: "no-store" }),
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
    let alive = true;

    async function boot() {
      setLang(getSavedLang());
      const s = getSession();
      if (!s) {
        window.location.href = "/team/login";
        return;
      }
      if (s.role !== "admin" && s.role !== "kitchen" && s.role !== "cashier") {
        window.location.href = "/staff";
        return;
      }
      setStaffRole(s.role);

      if (s.role === "admin") {
        if (fromCaisse) {
          const caisseEventId = localStorage.getItem("af_caisse_event_id") || "";
          let nextEventName = "";
          if (caisseEventId.trim()) {
            try {
              const res = await fetch("/api/menu-config", { cache: "no-store" });
              const data = await res.json().catch(() => null);
              const events = Array.isArray(data?.storeConfig?.events) ? data.storeConfig.events : [];
              nextEventName =
                String(events.find((event: { id?: string }) => String(event?.id || "").trim() === caisseEventId)?.name || "").trim();
            } catch {}
            if (!alive) return;
            setAssignedEventId(caisseEventId.trim());
            setAssignedEventName(nextEventName);
            return;
          }
        }
        if (!alive) return;
        void refresh();
        return;
      }

      let nextEventId = String(s.cashierEventId || "").trim();
      let nextEventName = "";
      try {
        const res = await fetch("/api/menu-config", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        const events = Array.isArray(data?.storeConfig?.events)
          ? data.storeConfig.events
          : [];
        if (!nextEventId) {
          nextEventId = String(data?.storeConfig?.activeEventId || "").trim() || String(events[0]?.id || "").trim();
          if (nextEventId) updateSessionCashierEventId(nextEventId);
        }
        nextEventName =
          String(events.find((event: { id?: string }) => String(event?.id || "").trim() === nextEventId)?.name || "").trim();
      } catch {
        nextEventId = nextEventId || "";
      }

      if (!nextEventId) {
        if (!alive) return;
        setAssignedEventId("");
        setAssignedEventName("");
        setAccessError(t.noEventAssigned);
        setLoading(false);
        return;
      }

      if (!alive) return;
      setAssignedEventId(nextEventId);
      setAssignedEventName(nextEventName);
    }

    void boot();
    return () => {
      alive = false;
    };
  }, [t.noEventAssigned]);

  useEffect(() => {
    if (staffRole === null) return;
    if (staffRole !== "admin" && !assignedEventId) return;
    void refresh();
  }, [assignedEventId, staffRole]);

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
      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button
          type="button"
          onClick={() => goBackOr(backHref)}
          className="af-link-btn"
          style={{
            padding: "6px 10px",
            borderRadius: 10,
            border: "1px solid #111",
            background: "white",
            color: "#111",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          {t.back}
        </button>
        {(["de", "fr", "en"] as Lang[]).map((L) => (
          <button
            key={L}
            type="button"
            onClick={() => {
              setLang(L);
              saveLang(L);
            }}
            className={`af-lang-btn ${lang === L ? "is-active" : ""}`}
          >
            {L.toUpperCase()}
          </button>
        ))}
        {staffRole ? <span className="af-role-badge">Role: {getStaffRoleLabel(staffRole, lang)}</span> : null}
      </div>
      <h1 style={{ margin: "10px 0 0 0", fontSize: 28, fontWeight: 900 }}>{t.title}</h1>
      <p style={{ opacity: 0.75 }}>{t.subtitle}</p>
      {assignedEventName ? (
        <div
          style={{
            marginTop: 10,
            display: "inline-flex",
            gap: 8,
            alignItems: "center",
            padding: "8px 12px",
            borderRadius: 999,
            background: "rgba(255,255,255,0.9)",
            border: "1px solid #F1D7C8",
            fontWeight: 800,
          }}
        >
          <span>{t.eventAssigned}:</span>
          <span>{assignedEventName}</span>
        </div>
      ) : null}
      <button
        className="af-btn"
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
      {accessError ? <p style={{ marginTop: 12, color: "#b91c1c", fontWeight: 800 }}>{accessError}</p> : null}
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

export default function KitchenPage() {
  return (
    <Suspense fallback={null}>
      <KitchenPageContent />
    </Suspense>
  );
}
