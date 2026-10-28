"use client";

import Link from "next/link";
import cuisine from "@/components/cuisine.module.css";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { clearSession, getSession, getStaffRoleLabel, type StaffRole } from "@/lib/staff-auth";
import { getSavedLang, saveLang, type Lang } from "@/lib/translations";
import { StaffPageFrame } from "@/components/StaffPageFrame";
import { ProductPresentation } from "@/components/pos/ProductPresentation";
import productStyles from "@/components/pos/product-presentation.module.css";
import pos from "@/components/pos/pos.module.css";
import styles from "./availability.module.css";
import { loadAdminKitchenEvent } from "@/lib/admin-kitchen-client";

type AdminItem = {
  id: string;
  imagePath?: string;
  name: Record<Lang, string>;
  price: number;
  visible: boolean;
  availability?: {
    revision?: string;
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
  const adminEventId = searchParams.get("adminEventId") || "";
  const fromCaisse = String(searchParams.get("from") || "").toLowerCase() === "caisse";
  const [lang, setLang] = useState<Lang>("fr");
  const [role, setRole] = useState<StaffRole | null>(null);
  const [eventId, setEventId] = useState("");
  const [eventName, setEventName] = useState("");
  const [sections, setSections] = useState<AdminSection[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const savingRef = useRef(false);
  const cuisineHref = fromCaisse ? "/staff/cuisine?from=caisse" : adminEventId ? `/staff/cuisine?adminEventId=${encodeURIComponent(adminEventId)}` : "/staff/cuisine";

  const ui = {
    title: lang === "fr" ? "Disponibilité produits" : lang === "de" ? "Kuchen-Verfugbarkeit" : "Kitchen availability",
    subtitle:
      lang === "fr"
        ? "Bloquer volontairement un produit ou suivre les quantites indicatives, sans limite de vente."
        : lang === "de"
        ? "Produkte manuell sperren oder Mengen unverbindlich verfolgen. Bestand 0 verhindert keinen Verkauf."
        : "Manually block a product or track indicative quantities without limiting sales.",
    back: lang === "fr" ? "Retour" : lang === "de" ? "Zuruck" : "Back",
    home: lang === "fr" ? "Accueil" : lang === "de" ? "Start" : "Home",
    logout: lang === "fr" ? "Se deconnecter" : lang === "de" ? "Abmelden" : "Logout",
    assignedEvent: lang === "fr" ? "Evenement cuisine" : lang === "de" ? "Kuchen-Event" : "Kitchen event",
    available: lang === "fr" ? "Disponible" : lang === "de" ? "Verfugbar" : "Available",
    unavailable: lang === "fr" ? "Indisponible" : lang === "de" ? "Nicht verfügbar" : "Unavailable",
    search: lang === "fr" ? "Rechercher un produit" : lang === "de" ? "Produkt suchen" : "Search products",
    all: lang === "fr" ? "Tous les produits" : lang === "de" ? "Alle Produkte" : "All products",
    categories: lang === "fr" ? "Catégories de produits" : lang === "de" ? "Produktkategorien" : "Product categories",
    empty: lang === "fr" ? "Aucun produit trouvé." : lang === "de" ? "Keine Produkte gefunden." : "No products found.",
    details: lang === "fr" ? "Quantités et reprise" : lang === "de" ? "Mengen und Wiederaufnahme" : "Quantities and resumption",
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
      if (session.role === "admin" && !fromCaisse) {
        setEventId(""); setSections([]);
        try {
          const event = await loadAdminKitchenEvent(adminEventId);
          if (!alive) return;
          setEventId(event.id); setEventName(event.name); setError(null);
        } catch (error) { if (alive) setError(error instanceof Error ? error.message : ui.noEvent); }
        return;
      }

      let nextEventId = String(session.cashierEventId || "").trim();
      if (session.role === "admin" && fromCaisse) {
        nextEventId = localStorage.getItem("af_caisse_event_id") || "";
      }
      try {
        const res = await fetch("/api/menu-config", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        const events = Array.isArray(data?.storeConfig?.events) ? (data.storeConfig.events as EventOption[]) : [];
        if (!nextEventId && session.role !== "admin") throw new Error("workstation_assignment_required");
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
  }, [adminEventId, fromCaisse, ui.noEvent]);

  useEffect(() => {
    if (!eventId) return;
    let alive = true;
    async function loadData() {
      const res = await fetch(`/api/admin/menu-config?${role === "admin" ? "adminEventId" : "eventId"}=${encodeURIComponent(eventId)}`, {
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

  const categories = useMemo(() => sections.filter(section => section.items.some(item => item.visible)), [sections]);
  const normalizeSearch = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase(lang).trim();
  const query = normalizeSearch(search);
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
  const categoryByItem = new Map(sections.flatMap(section => section.items.map(item => [item.id, section] as const)));
  const displayedItems = items.filter(item =>
    (!categoryId || categoryByItem.get(item.id)?.id === categoryId) && normalizeSearch(item.name[lang]).includes(query)
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
                  revision: it.availability?.revision,
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
    if (role === "admin" && !fromCaisse && eventId !== adminEventId) return;
    if (savingRef.current) return;
    savingRef.current = true;
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
          expectedRevision: availability.revision || "null",
          itemId: item.id,
          eventId,
          ...(role === "admin" ? { adminEventId: eventId } : {}),
          status: availability.status || "available",
          remainingQty: availability.remainingQty ?? null,
          resumeAt: availability.resumeAt || null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Save failed");
      }
      setSections((previous) => previous.map((section) => ({ ...section, items: section.items.map((entry) => entry.id === item.id ? { ...entry, availability: { ...item.availability, revision: data.revision } } : entry) })));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      savingRef.current = false;
      setSavingId(null);
    }
  }

  return (
    <div className={cuisine.workspace}>
    <StaffPageFrame title={ui.title} subtitle={ui.subtitle} lang={lang} compactContext
      context={{ name: "", role: role ? getStaffRoleLabel(role, lang) : "", eventName: eventName || eventId }}
      back={<Link href={cuisineHref} className="af-link-btn">{ui.back} · {lang === "fr" ? "Cuisine" : lang === "de" ? "Küche" : "Kitchen"}</Link>}
      onLangChange={language => { setLang(language); saveLang(language); }}
      home={<Link href="/" className="af-link-btn">{ui.home}</Link>}
      actions={!fromCaisse ? <button type="button" className="af-btn af-primary" onClick={async () => { await clearSession(); window.location.href = "/team/login"; }}>{ui.logout}</button> : null}
    >
        {error ? <div role="alert" style={{ marginTop: 12, padding: 12, borderRadius: 12, background: "#fee2e2", color: "#991b1b", fontWeight: 700 }}>{error}</div> : null}

        <section aria-label={ui.title}>
        <div className={styles.search}>
          <label htmlFor="product-search">{ui.search}</label>
          <input id="product-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={ui.search} />
        </div>
        <div className={pos.categoryBar} role="group" aria-label={ui.categories}>
          <button className="af-btn" type="button" aria-pressed={!categoryId} onClick={() => setCategoryId("")}>{ui.all}</button>
          {categories.map(category => <button key={category.id} className="af-btn" type="button" aria-pressed={categoryId === category.id} onClick={() => setCategoryId(category.id)}>{category.title[lang]}</button>)}
        </div>
        <div className={productStyles.grid}>
          {displayedItems.map((item) => {
            const availability = item.availability || { status: "available" as const, remainingQty: null, resumeAt: null };
            const isBlocked = availability.status === "blocked";
            const isZeroLimited = availability.status === "limited" && Number(availability.remainingQty ?? 0) <= 0;
            return (
              <ProductPresentation key={item.id} id={item.id} imagePath={item.imagePath} name={item.name[lang]}
                category={categoryByItem.get(item.id)?.title[lang]}
                tone={isBlocked ? "blocked" : isZeroLimited ? "warning" : "normal"}>
                <p className={`${styles.status} ${isBlocked ? styles.unavailable : styles.available}`}>
                  {isBlocked ? ui.unavailable : ui.available}
                  {availability.status === "limited" ? ` · ${ui.portions} : ${availability.remainingQty ?? 0}` : ""}
                </p>
                <div className={styles.stateButtons} role="group" aria-label={`${item.name[lang]} — ${ui.title}`}>
                  {(["available", "blocked"] as const).map(status => <button key={status} type="button"
                    aria-pressed={status === "blocked" ? isBlocked : !isBlocked}
                    disabled={savingId !== null}
                    onClick={() => void saveAvailability({ ...item, availability: { ...availability, status, remainingQty: null, resumeAt: status === "available" ? null : availability.resumeAt ?? null } })}>
                    {status === "available" ? ui.available : ui.unavailable}
                  </button>)}
                </div>
                {savingId === item.id ? <p role="status">{ui.saving}</p> : null}
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
                <details className={styles.details}>
                <summary>{ui.details}</summary>
                <fieldset disabled={savingId !== null} className={styles.fields}>
                  <select
                    aria-label={`${item.name[lang]} — ${ui.title}`}
                    value={availability.status || "available"}
                    onChange={(e) => {
                      const status = e.target.value as "available" | "limited" | "blocked";
                      patchAvailability(item.id, {
                        status,
                        remainingQty: status === "limited" ? (availability.remainingQty ?? 1) : null,
                        resumeAt: status === "available" ? null : (availability.resumeAt ?? null),
                      });
                    }}
                    style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd", width: "100%", minWidth: 0, maxWidth: "min(320px, 100%)" }}
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
                        aria-label={`${item.name[lang]} — ${ui.portions}`}
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
                          width: "100%", minWidth: 0, maxWidth: "min(220px, 100%)",
                          color: isZeroLimited ? "#b91c1c" : "#111",
                          fontWeight: isZeroLimited ? 900 : 500,
                          background: isZeroLimited ? "#fff1f2" : "white",
                        }}
                      />
                      {isZeroLimited ? (
                        <div style={{ color: "#b91c1c", fontWeight: 800, fontSize: 13 }}>
                          {lang === "fr" ? "Stock 0 : information uniquement, vente toujours autorisee." : lang === "de" ? "Bestand 0 - bitte pruefen. Verkauf weiterhin moeglich." : "Stock 0 - please check. Sales remain allowed."}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {(availability.status === "limited" || availability.status === "blocked") ? (
                    <div style={{ display: "grid", gap: 8 }}>
                      <input
                        aria-label={`${item.name[lang]} — ${ui.resumeAt}`}
                        type="datetime-local"
                        value={toLocalDateTimeValue(availability.resumeAt)}
                        onChange={(e) => {
                          const resumeAt = e.target.value ? new Date(e.target.value).toISOString() : null;
                          patchAvailability(item.id, { status: availability.status, resumeAt });
                        }}
                        style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd", width: "100%", minWidth: 0, maxWidth: "min(280px, 100%)" }}
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
                </fieldset>
                </details>
              </ProductPresentation>
            );
          })}
        </div>
        {displayedItems.length === 0 ? <p className={pos.empty} role="status">{ui.empty}</p> : null}
        </section>
    </StaffPageFrame>
    </div>
  );
}

export default function AvailabilityPage() {
  return (
    <Suspense fallback={null}>
      <AvailabilityPageContent />
    </Suspense>
  );
}
