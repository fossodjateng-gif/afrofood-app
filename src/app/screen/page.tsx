"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { OrderRow } from "@/lib/schema";
import { subscribeOrderSync } from "@/lib/order-sync";
import { getSavedLang, saveLang, type Lang } from "@/lib/translations";
import { getSession, getStaffRoleLabel, type StaffRole } from "@/lib/staff-auth";
import { goBackOr } from "@/lib/client-nav";
import { StaffPageFrame } from "@/components/StaffPageFrame";


const UI_TEXT: Record<
  Lang,
  {
    title: string;
    subtitle: string;
    back: string;
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
    back: "Zuruck",
    refreshing: "Aktualisierung...",
    refreshed: "Aktualisiert",
    refresh: "Aktualisieren",
    preparing: "In Vorbereitung",
    ready: "Abholbereit",
    none: "Keine Bestellung",
    unnamed: "Ohne Name",
  },
  fr: {
    title: "Commandes",
    subtitle: "Suivi des commandes en cours",
    back: "Retour",
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
    back: "Back",
    refreshing: "Refreshing...",
    refreshed: "Refreshed",
    refresh: "Refresh",
    preparing: "Preparing",
    ready: "Ready for pickup",
    none: "No orders",
    unnamed: "No name",
  },
};

function ScreenPageContent() {
  const searchParams = useSearchParams();
  const [lang, setLang] = useState<Lang>("de");
  const [orderResult, setOrderResult] = useState<{ eventId: string; preparing: OrderRow[]; ready: OrderRow[] } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [justRefreshed, setJustRefreshed] = useState(false);
  const [staffRole, setStaffRole] = useState<StaffRole | null>(null);
  const [assignedEventId, setAssignedEventId] = useState("");
  const [eventLabel, setEventLabel] = useState<{ eventId: string; name: string } | null>(null);
  const [eventContextReady, setEventContextReady] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const refreshRequestRef = useRef<AbortController | null>(null);
  const t = UI_TEXT[lang];
  const fromCaisse = String(searchParams.get("from") || "").toLowerCase() === "caisse";
  const adminEventId = searchParams.get("adminEventId") || "";
  const workspaceHref = getSession()?.role === "admin" && adminEventId ? `/staff/admin/events?eventId=${encodeURIComponent(adminEventId)}` : "";
  const backHref = fromCaisse ? "/staff/cuisine?from=caisse" : "/staff/cuisine";

  // Display-only event name; this does not gate or filter order loading.
  useEffect(() => {
    if (!assignedEventId) return;
    const controller = new AbortController();
    void fetch("/api/menu-config", { cache: "no-store", signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (controller.signal.aborted) return;
        const events: Array<{ id: string; name: string }> = Array.isArray(data?.storeConfig?.events) ? data.storeConfig.events : [];
        const event = events.find(event => event.id === assignedEventId);
        if (event?.name) setEventLabel({ eventId: assignedEventId, name: event.name });
      }).catch(() => { /* Keep the assigned event ID as a display fallback. */ });
    return () => controller.abort();
  }, [assignedEventId]);

  const preparing = orderResult?.eventId === assignedEventId ? orderResult.preparing : [];
  const ready = orderResult?.eventId === assignedEventId ? orderResult.ready : [];

  const refresh = useCallback(async () => {
    if (!eventContextReady || staffRole === null) return;
    if (!assignedEventId && (staffRole !== "admin" || fromCaisse)) return;

    refreshRequestRef.current?.abort();
    const controller = new AbortController();
    refreshRequestRef.current = controller;
    try {
      setIsRefreshing(true);
      const eventFilter = assignedEventId ? `&eventId=${encodeURIComponent(assignedEventId)}` : "";
      const [preparingRes, readyRes] = await Promise.all([
        fetch(`/api/staff/orders?status=NEW${eventFilter}`, { cache: "no-store", signal: controller.signal }),
        fetch(`/api/staff/orders?status=READY${eventFilter}`, { cache: "no-store", signal: controller.signal }),
      ]);

      const preparingData = await preparingRes.json();
      const readyData = await readyRes.json();
      if (!preparingRes.ok || !readyRes.ok) throw new Error(preparingData?.error || readyData?.error || "staff_orders_unavailable");

      if (controller.signal.aborted) return;
      setOrderResult({
        eventId: assignedEventId,
        preparing: Array.isArray(preparingData) ? preparingData : [],
        ready: Array.isArray(readyData) ? readyData : [],
      });
      setJustRefreshed(true);
      window.setTimeout(() => setJustRefreshed(false), 1200);
    } catch (error) {
      if (!controller.signal.aborted) { setOrderResult(null); setAccessError(error instanceof Error ? error.message : "staff_orders_unavailable"); }
    } finally {
      if (!controller.signal.aborted) {
        setIsRefreshing(false);
      }
    }
  }, [assignedEventId, eventContextReady, staffRole, fromCaisse]);

  useEffect(() => {
    let alive = true;

    async function boot() {
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
      setLang(getSavedLang());

      if (s.role === "admin" && !fromCaisse && !s.cashierEventId) return;

      const nextEventId = String(s.cashierEventId || "").trim();
      if (!nextEventId || !s.workstationId) throw new Error("workstation_assignment_required");

      if (!alive) return;
      setAssignedEventId(nextEventId);
    }

    void boot().then(() => {
      if (alive) setEventContextReady(true);
    }).catch((error: unknown) => { if (alive) setAccessError(error instanceof Error ? error.message : "workstation_assignment_invalid"); });
    return () => {
      alive = false;
    };
  }, [fromCaisse]);

  useEffect(() => {
    void refresh();
    return () => refreshRequestRef.current?.abort();
  }, [refresh]);

  useEffect(() => {
    return subscribeOrderSync((message) => {
      if (
        message.reason === "PAYMENT_VALIDATED" ||
        message.reason === "ORDER_READY" ||
        message.reason === "ORDER_DONE"
      ) {
        refresh();
      }
    }, true);
  }, [refresh]);

  return (
    <StaffPageFrame title={t.title} subtitle={t.subtitle} lang={lang} wide
      context={{ name: getSession()?.username || "", role: staffRole ? getStaffRoleLabel(staffRole, lang) : "",
        eventName: eventLabel?.eventId === assignedEventId ? eventLabel.name : assignedEventId,
        workstationName: getSession()?.workstationName,
        globalAdministration: staffRole === "admin" && !getSession()?.cashierEventId }}
      back={<button type="button" onClick={() => { if (workspaceHref) window.location.href = workspaceHref; else goBackOr(backHref); }} className="af-link-btn">{t.back}</button>}
      onLangChange={language => { setLang(language); saveLang(language); }}
    >
      {accessError ? <p role="alert">{accessError}</p> : null}
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginTop: 16 }}>
        <section style={{ borderRadius: 14, border: "1px solid #fb923c", background: "rgba(249,115,22,0.16)", padding: 14 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "#9a3412" }}>{t.preparing}</h2>
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {preparing.length === 0 ? <div style={{ opacity: 0.75 }}>{t.none}</div> : null}
            {preparing.map((o) => (
              <div key={o.id} className="af-order-card" style={{ borderRadius: 10, border: "1px solid #fb923c", padding: 10, background: "rgba(249,115,22,0.24)" }}>
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
              <div key={o.id} className="af-order-card" style={{ borderRadius: 10, border: "1px solid #22c55e", padding: 10, background: "rgba(22,163,74,0.24)" }}>
                <div style={{ fontWeight: 900, fontSize: 22 }}>{o.id}</div>
                <div style={{ marginTop: 2, opacity: 0.9 }}>{o.customer_name || t.unnamed}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </StaffPageFrame>
  );
}

export default function ScreenPage() {
  return (
    <Suspense fallback={null}>
      <ScreenPageContent />
    </Suspense>
  );
}
