"use client";

import { useEffect, useState } from "react";
import { StaffPageFrame } from "@/components/StaffPageFrame";
import { AdminReportingLinks } from "@/components/AdminReportingLinks";
import { OrderHistory } from "@/components/pos/OrderHistory";
import { getSession, getStaffRoleLabel, staffFetch } from "@/lib/staff-auth";
import { getSavedLang, saveLang, type Lang } from "@/lib/translations";
import type { WorkstationConfig } from "@/lib/workstations";
import cuisine from "@/components/cuisine.module.css";

export default function AdminHistoryPage() {
  const [lang, setLang] = useState<Lang>(getSavedLang);
  const [catalog, setCatalog] = useState<{ events: Array<{ id: string; name: string }>; workstations: Record<string, WorkstationConfig> } | null>(null);
  const [selection, setSelection] = useState({ eventId: "", workstationId: "" });
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const session = getSession();
  const txt = (fr: string, de: string, en: string) => lang === "fr" ? fr : lang === "de" ? de : en;
  useEffect(() => {
    const controller = new AbortController();
    const initial = new URLSearchParams(window.location.search).get("eventId") || "";
    void staffFetch("/api/admin/sales-history/catalog", { cache: "no-store", signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok || !data.ok || !Array.isArray(data.events)) throw new Error("admin_required");
      if (controller.signal.aborted) return;
      setCatalog(data);
      setSelection({ eventId: data.events.some((event: { id: string }) => event.id === initial) ? initial : data.events[0]?.id || "", workstationId: "" });
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, []);
  const event = catalog?.events.find(event => event.id === selection.eventId);
  const registers = catalog?.workstations[selection.eventId]?.cashier.filter(station => station.type === "cashier") || [];
  const selectedRegister = !selection.workstationId || registers.some(station => station.id === selection.workstationId);
  const back = event ? `/staff/admin/events?eventId=${encodeURIComponent(event.id)}` : "/admin/menu?view=event&from=admin-events";
  return <div className={cuisine.workspace}><StaffPageFrame title={txt("Historique global des ventes", "Globale Verkaufshistorie", "Global sales history")} lang={lang}
    context={{ name: session?.username || "", role: session ? getStaffRoleLabel(session.role, lang) : "", eventName: event?.name, globalAdministration: !event }}
    back={<a href={back} className="af-link-btn">{txt("Retour / Administration", "Zurück / Administration", "Back / Administration")}</a>}
    onLangChange={language => { setLang(language); saveLang(language); }}>
    <AdminReportingLinks lang={lang} eventId={event?.id} />
    <p>{txt("Consultation Admin en lecture seule. Aucun remboursement depuis cet historique.", "Schreibgeschützte Admin-Ansicht. Keine Erstattungen aus dieser Historie.", "Read-only Admin view. No refunds from this history.")}</p>
    {failed ? <p role="alert">{txt("Historique indisponible. Vérifiez votre session Admin.", "Historie nicht verfügbar. Bitte Admin-Sitzung prüfen.", "History unavailable. Check your Admin session.")}</p> : !catalog ? <p role="status">{txt("Chargement…", "Laden…", "Loading…")}</p> : !catalog.events.length ? <p>{txt("Aucun événement disponible.", "Kein Event verfügbar.", "No events available.")}</p> : <>
      <label>{txt("Événement", "Event", "Event")} <select value={selection.eventId} onChange={event => { setSelectedOrderId(null); setSelection({ eventId: event.target.value, workstationId: "" }); }}>
        {catalog.events.map(event => <option key={event.id} value={event.id}>{event.name}</option>)}
      </select></label>{" "}
      <label>{txt("Caisse", "Kasse", "Register")} <select value={selection.workstationId} onChange={event => { setSelectedOrderId(null); setSelection({ ...selection, workstationId: event.target.value }); }}>
        <option value="">{txt("Toutes les caisses", "Alle Kassen", "All registers")}</option>
        {registers.map(station => <option key={station.id} value={station.id}>{station.name}</option>)}
      </select></label>
      {event && selectedRegister ? <OrderHistory key={`${event.id}:${selection.workstationId}`} scope="admin" eventId={event.id} workstationId={selection.workstationId || undefined}
        readOnly request={staffFetch} lang={lang} selectedOrderId={selectedOrderId} onSelect={setSelectedOrderId} /> : null}
    </>}
  </StaffPageFrame></div>;
}
