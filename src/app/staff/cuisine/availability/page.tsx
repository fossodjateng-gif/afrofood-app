"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { clearSession, getSession, getStaffRoleLabel, type StaffRole, updateSessionCashierEventId } from "@/lib/staff-auth";
import { getSavedLang, saveLang, type Lang } from "@/lib/translations";
import { goBackOr } from "@/lib/client-nav";

type AdminItem = {
  id: string;
  name: Record<Lang, string>;
  price: number;
  visible: boolean;
  availability?: {
    status?: "available" | "limited" | "blocked";
    remainingQty?: number | null;
    resumeAt?: string | null;
  };
};

type AdminSection = {
  id: string;
  title: Record<Lang, string>;
  items: AdminItem[];
};

type EventOption = { id: string; name: string };

function toLocalDateTimeValue(value?: string | null) {
  if (!value) return "";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

function addMinutesIso(minutes: number) {
  const dt = new Date();
  dt.setMinutes(dt.getMinutes() + minutes, 0, 0);
  return dt.toISOString();
}

function tomorrowMorningIso() {
  const dt = new Date();
  dt.setDate(dt.getDate() + 1);
  dt.setHours(10, 0, 0, 0);
  return dt.toISOString();
}

function AvailabilityPageContent() {
  const searchParams = useSearchParams();
  const fromCaisse = String(searchParams.get("from") || "").toLowerCase() === "caisse";
  const [lang, setLang] = useState<Lang>("fr");
  const [role, setRole] = useState<StaffRole | null>(null);
  const [eventId, setEventId] = useState("");
  const [eventName, setEventName] = useState("");
  const [sections, setSections] = useState<AdminSection[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ui = {
    title: lang === "fr" ? "Disponibilite cuisine" : lang === "de" ? "Kuchen-Verfugbarkeit" : "Kitchen availability",
    subtitle:
      lang === "fr"
        ? "Bloquer temporairement un produit ou limiter le nombre de portions restantes."
        : lang === "de"
        ? "Produkte vorubergehend sperren oder die verbleibenden Portionen begrenzen."
        : "Temporarily block a product or limit how many portions remain.",
    back: lang === "fr" ? "Retour" : lang === "de" ? "Zuruck" : "Back",
    home: lang === "fr" ? "Accueil" : lang === "de" ? "Start" : "Home",
    logout: lang === "fr" ? "Se deconnecter" : lang === "de" ? "Abmelden" : "Logout",
    assignedEvent: lang === "fr" ? "Evenement cuisine" : lang === "de" ? "Kuchen-Event" : "Kitchen event",
    available: lang === "fr" ? "Disponible" : lang === "de" ? "Verfugbar" : "Available",
    limited: lang === "fr" ? "Reste X portions" : lang === "de" ? "Noch X Portionen" : "Only X portions left",
    blocked: lang === "fr" ? "Indisponible jusqu'a" : lang === "de" ? "Nicht verfugbar bis" : "Unavailable until",
    portions: lang === "fr" ? "Portions restantes" : lang === "de" ? "Verbleibende Portionen" : "Remaining portions",
    quickPortions: lang === "fr" ? "Quantites rapides" : lang === "de" ? "Schnellmengen" : "Quick quantities",
    resumeAt: lang === "fr" ? "Reprise des commandes" : lang === "de" ? "Bestellungen wieder moglich" : "Orders available again",
    quickTimes: lang === "fr" ? "Raccourcis" : lang === "de" ? "Schnellwahl" : "Quick times",
    save: lang === "fr" ? "Enregistrer" : lang === "de" ? "Speichern" : "Save",
    saving: lang === "fr" ? "Enregistrement..." : lang === "de" ? "Speichert..." : "Saving...",
    noEvent:
      lang === "fr"
        ? "Aucun evenement n'est assigne a cette cuisine."
        : lang === "de"
        ? "Kein Event ist dieser Kuche zugewiesen."
        : "No event is assigned to this kitchen.",
  };

  useEffect(() => {
    let alive = true;
    async function boot() {
      setLang(getSavedLang());
      const session = getSession();
      if (!session) {
        window.location.href = "/team/login";
        return;
      }
      if (session.role !== "admin" && session.role !== "kitchen" && session.role !== "cashier") {
        window.location.href = "/staff";
        return;
      }
      setRole(session.role);

      let nextEventId = String(session.cashierEventId || "").trim();
      if (session.role === "admin" && fromCaisse) {
        nextEventId = localStorage.getItem("af_caisse_event_id") || "";
      }
      try {
        const res = await fetch("/api/menu-config", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        const events = Array.isArray(data?.storeConfig?.events) ? (data.storeConfig.events as EventOption[]) : [];
        if (!nextEventId) {
          nextEventId = String(data?.storeConfig?.activeEventId || "").trim() || String(events[0]?.id || "").trim();
          if (nextEventId) updateSessionCashierEventId(nextEventId);
        }
        const match = events.find((event) => String(event.id || "").trim() === nextEventId);
        if (!alive) return;
        setEventId(nextEventId);
        setEventName(String(match?.name || "").trim());
        if (!nextEventId) {
          setError(ui.noEvent);
        }
      } catch {
        if (!alive) return;
        setError(ui.noEvent);
      }
    }
    void boot();
    return () => {
      alive = false;
    };
  }, [fromCaisse, ui.noEvent]);

  useEffect(() => {
    if (!eventId) return;
    let alive = true;
    async function loadData() {
      const res = await fetch(`/api/admin/menu-config?eventId=${encodeURIComponent(eventId)}`, {
        headers: role ? { "x-staff-role": role } : undefined,
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (!alive) return;
      if (!res.ok || !data?.ok) {
        setError(data?.error || "Load failed");
        return;
      }
      setSections(Array.isArray(data.sections) ? (data.sections as AdminSection[]) : []);
    }
    void loadData();
    return () => {
      alive = false;
    };
  }, [eventId, role]);

  const items = useMemo(
    () =>
      sections
        .flatMap((section) => section.items.filter((item) => item.visible))
        .sort((a, b) => {
          const aStatus = a.availability?.status || "available";
          const bStatus = b.availability?.status || "available";
          const aQty = Number(a.availability?.remainingQty ?? Number.POSITIVE_INFINITY);
          const bQty = Number(b.availability?.remainingQty ?? Number.POSITIVE_INFINITY);
          const rank = (status: string, qty: number) => {
            if (status === "blocked") return 0;
            if (status === "limited" && qty <= 0) return 1;
            if (status === "limited") return 2;
            return 3;
          };
          const diff = rank(aStatus, aQty) - rank(bStatus, bQty);
          if (diff !== 0) return diff;
          return a.name[lang].localeCompare(b.name[lang]);
        }),
    [lang, sections]
  );

  function patchAvailability(itemId: string, patch: { status?: "available" | "limited" | "blocked"; remainingQty?: number | null; resumeAt?: string | null }) {
    setSections((prev) =>
      prev.map((section) => ({
        ...section,
        items: section.items.map((it) =>
          it.id === itemId
            ? {
                ...it,
                availability: {
                  status: patch.status ?? it.availability?.status ?? "available",
                  remainingQty:
                    patch.remainingQty !== undefined ? patch.remainingQty : (it.availability?.remainingQty ?? null),
                  resumeAt: patch.resumeAt !== undefined ? patch.resumeAt : (it.availability?.resumeAt ?? null),
                },
              }
            : it
        ),
      }))
    );
  }

  async function saveAvailability(item: AdminItem) {
    try {
      setError(null);
      setSavingId(item.id);
      const availability = item.availability || {};
      const res = await fetch("/api/admin/menu-config", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(role ? { "x-staff-role": role } : {}),
        },
        body: JSON.stringify({
          setting: "item_availability",
          itemId: item.id,
          eventId,
          status: availability.status || "available",
          remainingQty: availability.remainingQty ?? null,
          resumeAt: availability.resumeAt || null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Save failed");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <main style={{ minHeight: "100vh", padding: 24, fontFamily: "system-ui", backgroundColor: "#FFF3E6", backgroundImage: "linear-gradient(180deg, rgba(255,243,230,0.82) 0%, rgba(255,243,230,0.9) 100%), url('/logo-afrofood.png')", backgroundRepeat: "no-repeat", backgroundPosition: "center, center", backgroundSize: "cover, min(64vw, 420px)" }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap", background: "white", border: "1px solid #F1D7C8", borderRadius: 12, padding: 12, boxShadow: "0 12px 30px rgba(242,140,40,0.18)" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>{ui.title}</h1>
            <div style={{ marginTop: 4, opacity: 0.8 }}>{ui.subtitle}</div>
            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {role ? <span className="af-role-badge">Role: {getStaffRoleLabel(role, lang)}</span> : null}
              {eventName ? <span className="af-role-badge">{ui.assignedEvent}: {eventName}</span> : null}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {(["de", "fr", "en"] as Lang[]).map((L) => (
              <button key={L} type="button" onClick={() => { setLang(L); saveLang(L); }} className={`af-lang-btn ${lang === L ? "is-active" : ""}`}>{L.toUpperCase()}</button>
            ))}
            <button type="button" onClick={() => goBackOr(fromCaisse ? "/staff/cuisine?from=caisse" : "/staff/cuisine")} className="af-link-btn" style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #111", background: "white", color: "#111", fontWeight: 800 }}>{ui.back}</button>
            <a href="/" className="af-link-btn" style={{ textDecoration: "none", padding: "8px 12px", borderRadius: 10, border: "1px solid #111", color: "#111", fontWeight: 800 }}>{ui.home}</a>
            {!fromCaisse ? <button type="button" className="af-btn" onClick={() => { clearSession(); window.location.href = "/team/login"; }} style={{ padding: "8px 12px", borderRadius: 10, border: "none", background: "#111", color: "white", fontWeight: 800 }}>{ui.logout}</button> : null}
          </div>
        </div>

        {error ? <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: "#fee2e2", color: "#991b1b", fontWeight: 700 }}>{error}</div> : null}

        <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
          {items.map((item) => {
            const availability = item.availability || { status: "available" as const, remainingQty: null, resumeAt: null };
            const isBlocked = availability.status === "blocked";
            const isZeroLimited = availability.status === "limited" && Number(availability.remainingQty ?? 0) <= 0;
            return (
              <div
                key={item.id}
                style={{
                  background: isBlocked ? "#fff1f2" : isZeroLimited ? "#fff7ed" : "white",
                  border: isBlocked ? "2px solid #e11d48" : isZeroLimited ? "2px solid #f97316" : "1px solid #F1D7C8",
                  borderRadius: 12,
                  padding: 12,
                  boxShadow: isBlocked ? "0 10px 24px rgba(225,29,72,0.12)" : isZeroLimited ? "0 10px 24px rgba(249,115,22,0.12)" : "none",
                }}
              >
                <div style={{ fontWeight: 900, fontSize: 20 }}>{item.name[lang]}</div>
                <div style={{ opacity: 0.6, fontSize: 12, marginTop: 2 }}>{item.id}</div>
                {isBlocked ? (
                  <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 10, background: "#ffe4e6", color: "#be123c", fontWeight: 900 }}>
                    {lang === "fr" ? "Produit actuellement bloque" : lang === "de" ? "Produkt aktuell gesperrt" : "Product currently blocked"}
                  </div>
                ) : null}
                {isZeroLimited ? (
                  <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 10, background: "#fee2e2", color: "#b91c1c", fontWeight: 900 }}>
                    {lang === "fr" ? "0 portion restante" : lang === "de" ? "0 Portionen ubrig" : "0 portions left"}
                  </div>
                ) : null}
                <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                  <select
                    value={availability.status || "available"}
                    onChange={(e) => {
                      const status = e.target.value as "available" | "limited" | "blocked";
                      patchAvailability(item.id, {
                        status,
                        remainingQty: status === "limited" ? (availability.remainingQty ?? 1) : null,
                        resumeAt: status === "available" ? null : (availability.resumeAt ?? null),
                      });
                    }}
                    style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd", maxWidth: 320 }}
                  >
                    <option value="available">{ui.available}</option>
                    <option value="limited">{ui.limited}</option>
                    <option value="blocked">{ui.blocked}</option>
                  </select>

                  {availability.status === "limited" ? (
                    <div style={{ display: "grid", gap: 6 }}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <span style={{ fontSize: 12, fontWeight: 800, opacity: 0.75 }}>{ui.quickPortions}</span>
                        {[0, 2, 5, 10].map((presetQty) => (
                          <button
                            key={`${item.id}-qty-${presetQty}`}
                            type="button"
                            onClick={() => patchAvailability(item.id, { status: "limited", remainingQty: presetQty })}
                            style={{
                              padding: "6px 10px",
                              borderRadius: 999,
                              border: presetQty === 0 ? "1px solid #dc2626" : "1px solid #F1D7C8",
                              background: presetQty === 0 ? "#fff1f2" : "#fffaf6",
                              color: presetQty === 0 ? "#b91c1c" : "#111",
                              fontWeight: 800,
                              cursor: "pointer",
                            }}
                          >
                            {presetQty}
                          </button>
                        ))}
                      </div>
                      <input
                        type="number"
                        min={0}
                        value={availability.remainingQty ?? 0}
                        onChange={(e) => {
                          const remainingQty = Math.max(0, Number(e.target.value || 0));
                          patchAvailability(item.id, { status: "limited", remainingQty });
                        }}
                        placeholder={ui.portions}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: isZeroLimited ? "2px solid #dc2626" : "1px solid #ddd",
                          maxWidth: 220,
                          color: isZeroLimited ? "#b91c1c" : "#111",
                          fontWeight: isZeroLimited ? 900 : 500,
                          background: isZeroLimited ? "#fff1f2" : "white",
                        }}
                      />
                      {isZeroLimited ? (
                        <div style={{ color: "#b91c1c", fontWeight: 800, fontSize: 13 }}>
                          {lang === "fr" ? "Le menu est bloque jusqu'a nouvelle disponibilite." : lang === "de" ? "Das Menu ist blockiert, bis neue Verfugbarkeit gesetzt wird." : "The menu is blocked until new availability is set."}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {(availability.status === "limited" || availability.status === "blocked") ? (
                    <div style={{ display: "grid", gap: 8 }}>
                      <input
                        type="datetime-local"
                        value={toLocalDateTimeValue(availability.resumeAt)}
                        onChange={(e) => {
                          const resumeAt = e.target.value ? new Date(e.target.value).toISOString() : null;
                          patchAvailability(item.id, { status: availability.status, resumeAt });
                        }}
                        style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd", maxWidth: 280 }}
                      />
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <span style={{ fontSize: 12, fontWeight: 800, opacity: 0.75 }}>{ui.quickTimes}</span>
                        {[
                          { label: "+15 min", value: addMinutesIso(15) },
                          { label: "+30 min", value: addMinutesIso(30) },
                          { label: "+1 h", value: addMinutesIso(60) },
                          { label: lang === "fr" ? "Demain" : lang === "de" ? "Morgen" : "Tomorrow", value: tomorrowMorningIso() },
                        ].map((preset) => (
                          <button
                            key={`${item.id}-${preset.label}`}
                            type="button"
                            onClick={() => patchAvailability(item.id, { status: availability.status, resumeAt: preset.value })}
                            style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid #F1D7C8", background: "#fffaf6", color: "#111", fontWeight: 800, cursor: "pointer" }}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <button type="button" className="af-btn" onClick={() => saveAvailability(item)} disabled={savingId === item.id} style={{ width: "fit-content", padding: "10px 14px", borderRadius: 10, border: "none", background: "#111", color: "white", fontWeight: 800 }}>
                    {savingId === item.id ? ui.saving : ui.save}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}

export default function AvailabilityPage() {
  return (
    <Suspense fallback={null}>
      <AvailabilityPageContent />
    </Suspense>
  );
}
