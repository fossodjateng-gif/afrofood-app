"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSavedLang, saveLang, type Lang } from "@/lib/translations";
import { getSession, getStaffRoleLabel, staffFetch, type StaffRole } from "@/lib/staff-auth";
import Link from "next/link";
import { AdminReportingLinks } from "@/components/AdminReportingLinks";

const STATS_PERIOD_KEY = "af_stats_period";
const STATS_EVENT_KEY = "af_stats_event";

type FinancialAmounts = { cashCents: number; cardCents: number; totalCents: number };

type StatsResponse = {
  ok: boolean;
  generatedAt: string;
  filters: {
    period: "today" | "week" | "month" | "all";
    eventId: string;
  };
  financials: {
    gross: FinancialAmounts;
    refunded: FinancialAmounts;
    net: FinancialAmounts;
  };
  summary: {
    revenueCents: number;
    transactions: number;
    canceledTransactions: number;
    avgBasketCents: number;
  };
  kpis: {
    today: { revenueCents: number; transactions: number; avgBasketCents: number };
    week: { revenueCents: number; transactions: number; avgBasketCents: number };
    month: { revenueCents: number; transactions: number; avgBasketCents: number };
  };
  topProducts: Array<{ name: string; qty: number }>;
  salesByHour: Array<{ hour: number; transactions: number; revenueCents: number }>;
  paymentMethods: Array<{
    method: string;
    transactions: number;
    revenueCents: number;
    sharePct: number;
  }>;
  salesByEvent: Array<{
    eventName: string;
    transactions: number;
    revenueCents: number;
  }>;
  availableEvents: Array<{ id: string; name: string }>;
};

type EventSummarySection = {
  id: string;
  title: Record<Lang, string>;
  items: Array<{
    id: string;
    name: Record<Lang, string>;
    price: number;
    visible: boolean;
  }>;
};

type EventSummary = {
  eventId: string;
  eventName: string;
  sections: EventSummarySection[];
  paymentConfig: {
    cashEnabled: boolean;
    cardEnabled: boolean;
    cashlessEnabled: boolean;
  };
};

const UI_TEXT: Record<
  Lang,
  {
    title: string;
    subtitle: string;
    back: string;
    refresh: string;
    period: string;
    event: string;
    allEvents: string;
    loading: string;
    failed: string;
    today: string;
    week: string;
    month: string;
    revenue: string;
    refunds: string;
    netRevenue: string;
    cash: string;
    card: string;
    total: string;
    transactions: string;
    avgBasket: string;
    topProducts: string;
    product: string;
    sold: string;
    salesHours: string;
    paymentModes: string;
    method: string;
    share: string;
    salesTodayByHour: string;
    salesByEvent: string;
    eventOverview: string;
    eventOverviewSub: string;
    visibleProducts: string;
    allowedPayments: string;
    assignedCashiers: string;
    assignedKitchen: string;
    noAssignedCashiers: string;
    noAssignedKitchen: string;
    menuCount: string;
    activeBadge: string;
    eventName: string;
    filteredSummary: string;
    canceledOrders: string;
    updatedAt: string;
  }
> = {
  de: {
    title: "Verkaufsstatistik",
    subtitle: "Live-Ubersicht fur Kasse und Events",
    back: "Zuruck",
    refresh: "Aktualisieren",
    period: "Zeitraum",
    event: "Event",
    allEvents: "Alle Events",
    loading: "Laden...",
    failed: "Laden fehlgeschlagen",
    today: "Heute",
    week: "Diese Woche",
    month: "Dieser Monat",
    revenue: "Umsatz vor Erstattungen",
    refunds: "Bestätigte Erstattungen",
    netRevenue: "Umsatz nach Erstattungen",
    cash: "Bar",
    card: "Karte",
    total: "Gesamt",
    transactions: "Transaktionen",
    avgBasket: "Durchschnitt",
    topProducts: "Top Produkte",
    product: "Produkt",
    sold: "Verkauft",
    salesHours: "Verkaufsstunden",
    paymentModes: "Zahlungsarten",
    method: "Methode",
    share: "Anteil",
    salesTodayByHour: "Heutige Verkaufe pro Stunde",
    salesByEvent: "Verkaufe pro Event",
    eventOverview: "Event-Ubersicht",
    eventOverviewSub: "Sichtbare Produkte, erlaubte Zahlungen und zugewiesene Teams pro Event.",
    visibleProducts: "Sichtbare Produkte",
    allowedPayments: "Erlaubte Zahlungen",
    assignedCashiers: "Zugewiesene Kassen",
    assignedKitchen: "Zugewiesene Kuche",
    noAssignedCashiers: "Keine Kasse zugewiesen",
    noAssignedKitchen: "Keine Kuche zugewiesen",
    menuCount: "Gerichte im Menu",
    activeBadge: "Aktiv",
    eventName: "Event",
    filteredSummary: "Gefilterte Zusammenfassung",
    canceledOrders: "Stornierte Bestellungen",
    updatedAt: "Aktualisiert",
  },
  fr: {
    title: "Statistiques de ventes",
    subtitle: "Vue en direct pour caisse et evenements",
    back: "Retour",
    refresh: "Actualiser",
    period: "Periode",
    event: "Evenement",
    allEvents: "Tous les evenements",
    loading: "Chargement...",
    failed: "Chargement echoue",
    today: "Aujourd'hui",
    week: "Cette semaine",
    month: "Ce mois",
    revenue: "CA brut",
    refunds: "Remboursements confirmés",
    netRevenue: "CA net",
    cash: "Espèces",
    card: "Carte",
    total: "Total",
    transactions: "Nombre de ventes",
    avgBasket: "Panier moyen",
    topProducts: "Produits les plus vendus",
    product: "Produit",
    sold: "Ventes",
    salesHours: "Heures de vente",
    paymentModes: "Modes de paiement",
    method: "Mode",
    share: "Part",
    salesTodayByHour: "Ventes par heure aujourd'hui",
    salesByEvent: "Ventes par evenement",
    eventOverview: "Vue d'ensemble des evenements",
    eventOverviewSub: "Produits visibles, paiements autorises et equipes assignees par evenement.",
    visibleProducts: "Produits visibles",
    allowedPayments: "Paiements autorises",
    assignedCashiers: "Caissiers assignes",
    assignedKitchen: "Cuisine assignee",
    noAssignedCashiers: "Aucune caisse assignee",
    noAssignedKitchen: "Aucune cuisine assignee",
    menuCount: "Produits au menu",
    activeBadge: "Actif",
    eventName: "Evenement",
    filteredSummary: "Resume filtre",
    canceledOrders: "Commandes annulees",
    updatedAt: "Mis a jour",
  },
  en: {
    title: "Sales stats",
    subtitle: "Live overview for cashier and events",
    back: "Back",
    refresh: "Refresh",
    period: "Period",
    event: "Event",
    allEvents: "All events",
    loading: "Loading...",
    failed: "Failed to load",
    today: "Today",
    week: "This week",
    month: "This month",
    revenue: "Gross revenue",
    refunds: "Confirmed refunds",
    netRevenue: "Net revenue",
    cash: "Cash",
    card: "Card",
    total: "Total",
    transactions: "Transactions",
    avgBasket: "Avg basket",
    topProducts: "Top products",
    product: "Product",
    sold: "Sold",
    salesHours: "Sales hours",
    paymentModes: "Payment methods",
    method: "Method",
    share: "Share",
    salesTodayByHour: "Today's sales by hour",
    salesByEvent: "Sales by event",
    eventOverview: "Event overview",
    eventOverviewSub: "Visible products, allowed payments, and assigned teams for each event.",
    visibleProducts: "Visible products",
    allowedPayments: "Allowed payments",
    assignedCashiers: "Assigned cashiers",
    assignedKitchen: "Assigned kitchen",
    noAssignedCashiers: "No cashier assigned",
    noAssignedKitchen: "No kitchen assigned",
    menuCount: "Menu items",
    activeBadge: "Active",
    eventName: "Event",
    filteredSummary: "Filtered summary",
    canceledOrders: "Canceled orders",
    updatedAt: "Updated",
  },
};

function formatEur(cents: number, lang: Lang) {
  return new Intl.NumberFormat(lang === "de" ? "de-DE" : lang === "fr" ? "fr-FR" : "en-US", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function formatHourLabel(hour: number) {
  const h = Math.max(0, Math.min(23, hour));
  return `${String(h).padStart(2, "0")}h-${String((h + 1) % 24).padStart(2, "0")}h`;
}

function normalizePaymentLabel(method: string) {
  const v = method.toLowerCase();
  if (v === "card") return "Card";
  if (v === "cash") return "Cash";
  if (v === "stripe") return "Stripe";
  return method;
}

export default function StatsPage() {
  type Period = "today" | "week" | "month" | "all";
  const [lang, setLang] = useState<Lang>("de");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [period, setPeriod] = useState<Period>("all");
  const [eventFilter, setEventFilter] = useState("");
  const statsRequest = useRef<AbortController | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [staffRole, setStaffRole] = useState<StaffRole | null>(null);
  const [eventSummaries, setEventSummaries] = useState<EventSummary[]>([]);
  const [storeEvents, setStoreEvents] = useState<Array<{ id: string; name: string }>>([]);
  const [activeEventId, setActiveEventId] = useState("");

  useEffect(() => {
    setLang(getSavedLang());
    const s = getSession();
    if (s) {
      if (s.role === "admin") {
        setStaffRole(s.role);
        setIsUnlocked(true);
      } else {
        window.location.href = "/staff";
        return;
      }
    }
    const savedPeriod = localStorage.getItem(STATS_PERIOD_KEY);
    if (savedPeriod === "today" || savedPeriod === "week" || savedPeriod === "month" || savedPeriod === "all") {
      setPeriod(savedPeriod);
    }
    if (!s) window.location.href = "/team/login";
  }, []);

  useEffect(() => {
    localStorage.setItem(STATS_PERIOD_KEY, period);
  }, [period]);

  useEffect(() => {
    if (eventFilter) localStorage.setItem(STATS_EVENT_KEY, eventFilter);
  }, [eventFilter]);

  const t = UI_TEXT[lang];

  const [users, setUsers] = useState<{ id: string; username: string; role: string; active: boolean; cashier_event_id: string | null }[]>([]);
  useEffect(() => {
    if (getSession()?.role !== "admin") return;
    let alive = true;
    void fetch("/api/staff/users", { cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error("Staff assignments unavailable");
      const data = await response.json();
      if (alive) setUsers(data.users || []);
    }).catch(() => { if (alive) setUsers([]); });
    return () => { alive = false; };
  }, []);
  const staffAssignments = useMemo(() => {
    return storeEvents.map((event) => ({
      eventId: event.id,
      cashiers: users.filter((user) => user.active && user.role === "cashier" && user.cashier_event_id === event.id),
      kitchen: users.filter((user) => user.active && user.role === "kitchen" && user.cashier_event_id === event.id),
    }));
  }, [storeEvents, users]);

  useEffect(() => {
    if (!isUnlocked) return;
    const controller = new AbortController();
    const initial = new URLSearchParams(window.location.search).get("eventId") || localStorage.getItem(STATS_EVENT_KEY) || "";
    void staffFetch("/api/stats?catalog=1", { cache: "no-store", signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok || !data.ok || !Array.isArray(data.events)) throw new Error("stats_failed");
      if (controller.signal.aborted) return;
      setStoreEvents(data.events);
      setEventFilter(data.events.some((event: { id: string }) => event.id === initial) ? initial : data.events[0]?.id || "");
      if (!data.events.length) setLoading(false);
    }).catch(() => { if (!controller.signal.aborted) { setError(UI_TEXT.fr.failed); setLoading(false); } });
    return () => controller.abort();
  }, [isUnlocked]);

  const fetchStats = useCallback(async () => {
    if (!isUnlocked || !eventFilter) return;
    statsRequest.current?.abort();
    const controller = new AbortController();
    statsRequest.current = controller;
    setLoading(true); setError(null); setStats(null);
    try {
      const params = new URLSearchParams({ period, eventId: eventFilter });
      const res = await staffFetch(`/api/stats?${params}`, { cache: "no-store", signal: controller.signal });
      const data = (await res.json()) as StatsResponse;
      if (!res.ok || !data.ok || data.filters.eventId !== eventFilter || data.filters.period !== period) throw new Error("stats_failed");
      if (!controller.signal.aborted) setStats(data);
    } catch { if (!controller.signal.aborted) setError(t.failed); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, [eventFilter, period, t.failed, isUnlocked]);

  useEffect(() => {
    void fetchStats();
    return () => statsRequest.current?.abort();
  }, [fetchStats]);

  useEffect(() => {
    if (!isUnlocked) return;
    let cancelled = false;

    async function loadEventOverview() {
      try {
        const baseRes = await fetch("/api/menu-config", { cache: "no-store" });
        const baseData = await baseRes.json().catch(() => null);
        const events = Array.isArray(baseData?.storeConfig?.events)
          ? (baseData.storeConfig.events as Array<{ id?: string; name?: string }>)
              .map((event) => ({
                id: String(event?.id || "").trim(),
                name: String(event?.name || "").trim(),
              }))
              .filter((event) => event.id && event.name)
          : [];
        if (!cancelled) {
          setStoreEvents(events);
          setActiveEventId(String(baseData?.storeConfig?.activeEventId || "").trim());
        }
        const summaries = await Promise.all(
          events.map(async (event) => {
            const res = await fetch(`/api/admin/menu-config?eventId=${encodeURIComponent(event.id)}`, {
              headers: { "x-staff-role": "admin" },
              cache: "no-store",
            });
            const data = await res.json().catch(() => null);
            if (!res.ok || !data?.ok) {
              throw new Error(data?.error || "overview_failed");
            }
            return {
              eventId: event.id,
              eventName: event.name,
              sections: Array.isArray(data.sections) ? (data.sections as EventSummarySection[]) : [],
              paymentConfig: {
                cashEnabled: data?.paymentConfig?.cashEnabled !== false,
                cardEnabled: data?.paymentConfig?.cardEnabled !== false,
                cashlessEnabled: data?.paymentConfig?.cashlessEnabled !== false,
              },
            } satisfies EventSummary;
          })
        );
        if (!cancelled) {
          setEventSummaries(summaries);
        }
      } catch {
        if (!cancelled) {
          setEventSummaries([]);
        }
      }
    }

    void loadEventOverview();
    return () => {
      cancelled = true;
    };
  }, [isUnlocked]);

  const maxHourTx = useMemo(() => {
    if (!stats?.salesByHour?.length) return 1;
    return Math.max(...stats.salesByHour.map((x) => x.transactions), 1);
  }, [stats]);

  if (!isUnlocked) return <main><Link href="/staff/admin">{t.back}</Link><p>{t.loading}</p><a href="/team/login">{lang === "fr" ? "Connexion Admin" : lang === "de" ? "Admin-Anmeldung" : "Admin sign in"}</a></main>;

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 20,
        fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
        backgroundColor: "#FFF3E6",
        backgroundImage:
          "linear-gradient(180deg, rgba(255,243,230,0.82) 0%, rgba(255,243,230,0.9) 100%), url('/logo-afrofood.png')",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        backgroundSize: "cover, min(64vw, 420px)",
        color: "#111",
      }}
    >
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <AdminReportingLinks lang={lang} eventId={eventFilter || undefined} />
        <p>{lang === "fr" ? "Toutes les caisses de l’événement · Périodes Europe/Berlin · Remboursements confirmés rattachés aux ventes de la période." : lang === "de" ? "Alle Kassen des Events · Zeiträume Europe/Berlin · Bestätigte Erstattungen der Verkäufe im Zeitraum." : "All event registers · Europe/Berlin periods · Confirmed refunds for sales in the selected period."}</p>
	        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
	          <Link href="/staff/admin"
	            className="af-link-btn"
	            style={{
	              padding: "6px 10px",
	              borderRadius: 10,
	              border: "1px solid #d1d5db",
	              background: "white",
	              color: "#111",
	              fontWeight: 800,
	              cursor: "pointer",
	            }}
	          >
	            {t.back}
	          </Link>
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

	        <div
	          style={{
	            display: "flex",
	            justifyContent: "space-between",
	            alignItems: "center",
	            gap: 10,
	            flexWrap: "wrap",
	            background: "white",
	            border: "1px solid #F1D7C8",
	            borderRadius: 12,
	            padding: 12,
	            boxShadow: "0 12px 30px rgba(242,140,40,0.18)",
	            position: "sticky",
	            top: 12,
	            zIndex: 20,
	          }}
	        >
	          <div>
	            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, display: "flex", alignItems: "center", gap: 8 }}>
	              <Image
	                src="/logo-afrofood.png"
	                alt="AfroFood"
	                width={30}
	                height={30}
	                style={{ borderRadius: 8, objectFit: "cover", border: "1px solid #F1D7C8" }}
	              />
	              {t.title}
	            </h1>
	            <div style={{ marginTop: 6, opacity: 0.8 }}>{t.subtitle}</div>
	            {stats?.generatedAt ? (
	              <div style={{ marginTop: 6, opacity: 0.7, fontSize: 13 }}>
	                {t.updatedAt}: {new Date(stats.generatedAt).toLocaleString()}
	              </div>
	            ) : null}
	          </div>
	        </div>

	        <div
	          style={{
	            height: 6,
	            borderRadius: 999,
	            marginTop: 12,
	            background:
	              "repeating-linear-gradient(90deg, #111 0 10px, #F28C28 10px 20px, #111 20px 30px, #fff 30px 40px)",
	            opacity: 0.9,
	          }}
	        />

	        <div
	          style={{
	            marginTop: 12,
	            background: "white",
	            border: "1px solid #F1D7C8",
	            borderRadius: 12,
	            padding: 14,
	            display: "flex",
	            gap: 8,
	            flexWrap: "wrap",
	            alignItems: "end",
	            justifyContent: "space-between",
	          }}
	        >
	          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end", minWidth: 0, maxWidth: "100%" }}>
	            <label style={{ display: "grid", gap: 4, fontSize: 13, minWidth: 0, maxWidth: "100%" }}>
	              <span>{t.period}</span>
	              <select
                value={period}
                onChange={(e) => { statsRequest.current?.abort(); setStats(null); setPeriod(e.target.value as Period); }}
                style={{ borderRadius: 10, padding: "6px 10px", border: "1px solid #9ca3af" }}
              >
                <option value="all">{lang === "fr" ? "Événement entier" : lang === "de" ? "Gesamtes Event" : "Entire event"}</option>
                <option value="today">{t.today}</option>
                <option value="week">{t.week}</option>
                <option value="month">{t.month}</option>
              </select>
            </label>

            <label style={{ display: "grid", gap: 4, fontSize: 13, minWidth: 0, maxWidth: "100%" }}>
              <span>{t.event}</span>
              <select
                value={eventFilter}
                onChange={(e) => { statsRequest.current?.abort(); setStats(null); setEventFilter(e.target.value); }}
                style={{ borderRadius: 10, padding: "6px 10px", border: "1px solid #9ca3af", minWidth: "min(170px, 100%)", maxWidth: "100%" }}
              >
                {!storeEvents.length ? <option value="">{lang === "fr" ? "Aucun événement" : lang === "de" ? "Kein Event" : "No events"}</option> : null}
                {storeEvents.map(event => <option key={event.id} value={event.id}>{event.name}</option>)}
              </select>
	            </label>
	          </div>
	          <button
	            className="af-btn"
	            type="button"
	            onClick={() => void fetchStats()}
	            style={{
	              border: "none",
	              borderRadius: 12,
	              padding: "10px 14px",
	              background: "linear-gradient(135deg,#ff7a00,#ff3c00)",
	              color: "white",
	              fontWeight: 800,
	              cursor: "pointer",
	            }}
	          >
	            {t.refresh}
	          </button>
	        </div>

        {loading ? <p style={{ marginTop: 14 }}>{t.loading}</p> : null}
        {error ? <p style={{ marginTop: 14, color: "#b91c1c", fontWeight: 700 }}>{error}</p> : null}

        {stats ? (
          <>
            <section style={{ marginTop: 14, borderRadius: 12, padding: 14, background: "white", border: "1px solid #e5e7eb" }}>
              <div className="af-stats-table-scroll" role="region" aria-label={t.filteredSummary} tabIndex={0}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <caption style={{ textAlign: "left", fontSize: 18, fontWeight: 900, marginBottom: 10 }}>{t.filteredSummary}</caption>
                  <thead>
                    <tr>
                      <th scope="col" aria-label={t.filteredSummary} />
                      {[t.cash, t.card, t.total].map((label) => (
                        <th key={label} scope="col" style={{ textAlign: "right", padding: "6px 8px" }}>{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {([
                      ["gross", t.revenue],
                      ["refunded", t.refunds],
                      ["net", t.netRevenue],
                    ] as const).map(([key, label]) => (
                      <tr key={key}>
                        <th scope="row" style={{ textAlign: "left", padding: "8px", borderTop: "1px solid #f3f4f6" }}>{label}</th>
                        {(["cashCents", "cardCents", "totalCents"] as const).map((method) => (
                          <td key={method} style={{ textAlign: "right", padding: "8px", borderTop: "1px solid #f3f4f6", fontWeight: key === "net" ? 900 : 400 }}>
                            {formatEur(stats.financials[key][method], lang)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section
              style={{
                marginTop: 14,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 10,
              }}
            >
              <article
                style={{
                  minWidth: 0,
                  borderRadius: 12,
                  padding: 14,
                  background: "#111",
                  color: "white",
                  border: "1px solid #F1D7C8",
                }}
              >
                <div style={{ fontSize: 14, opacity: 0.8, fontWeight: 700 }}>{t.filteredSummary}</div>
                <div style={{ marginTop: 8, fontSize: 22, fontWeight: 900 }}>
                  {t.revenue}: {formatEur(stats.summary.revenueCents, lang)}
                </div>
                <div style={{ marginTop: 6 }}>
                  {t.transactions}: <strong>{stats.summary.transactions}</strong>
                </div>
                <div style={{ marginTop: 4 }}>
                  {t.avgBasket}: <strong>{formatEur(stats.summary.avgBasketCents, lang)}</strong>
                </div>
                <div style={{ marginTop: 4 }}>
                  {t.canceledOrders}: <strong>{stats.summary.canceledTransactions}</strong>
                </div>
              </article>

              {[
                { label: t.today, value: stats.kpis.today },
                { label: t.week, value: stats.kpis.week },
                { label: t.month, value: stats.kpis.month },
              ].map((block) => (
                <article
                  key={block.label}
                  style={{
                    borderRadius: 12,
                    padding: 14,
                    background: "white",
                    border: "1px solid #e5e7eb",
                  }}
                >
                  <div style={{ fontSize: 14, color: "#5f5f5f", fontWeight: 700 }}>{block.label}</div>
                  <div style={{ marginTop: 8, fontSize: 22, fontWeight: 900 }}>
                    {t.revenue}: {formatEur(block.value.revenueCents, lang)}
                  </div>
                  <div style={{ marginTop: 6 }}>
                    {t.transactions}: <strong>{block.value.transactions}</strong>
                  </div>
                  <div style={{ marginTop: 4 }}>
                    {t.avgBasket}: <strong>{formatEur(block.value.avgBasketCents, lang)}</strong>
                  </div>
                </article>
              ))}
            </section>

            <section
              style={{
                marginTop: 14,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: 10,
              }}
            >
              <article
                style={{
                  minWidth: 0,
                  borderRadius: 12,
                  padding: 14,
                  background: "white",
                  border: "1px solid #e5e7eb",
                }}
              >
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>{t.topProducts}</h2>
                <div className="af-stats-table-scroll" role="region" aria-label={t.topProducts} tabIndex={0}>
                <table style={{ width: "100%", marginTop: 10, borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", paddingBottom: 8 }}>{t.product}</th>
                      <th style={{ textAlign: "right", paddingBottom: 8 }}>{t.sold}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.topProducts.map((item) => (
                      <tr key={item.name}>
                        <td style={{ padding: "6px 0", borderTop: "1px solid #f3f4f6" }}>{item.name}</td>
                        <td style={{ padding: "6px 0", borderTop: "1px solid #f3f4f6", textAlign: "right" }}>
                          {item.qty}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </article>

              <article
                style={{
                  minWidth: 0,
                  borderRadius: 12,
                  padding: 14,
                  background: "white",
                  border: "1px solid #e5e7eb",
                }}
              >
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>{t.paymentModes}</h2>
                <div className="af-stats-table-scroll" role="region" aria-label={t.paymentModes} tabIndex={0}>
                <table style={{ width: "100%", marginTop: 10, borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", paddingBottom: 8 }}>{t.method}</th>
                      <th style={{ textAlign: "right", paddingBottom: 8 }}>{t.share}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.paymentMethods.map((row) => (
                      <tr key={row.method}>
                        <td style={{ padding: "6px 0", borderTop: "1px solid #f3f4f6" }}>
                          {normalizePaymentLabel(row.method)}
                        </td>
                        <td style={{ padding: "6px 0", borderTop: "1px solid #f3f4f6", textAlign: "right" }}>
                          {row.sharePct.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </article>
            </section>

            <section
              style={{
                marginTop: 14,
                borderRadius: 12,
                padding: 14,
                background: "white",
                border: "1px solid #e5e7eb",
              }}
            >
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>{t.salesByEvent}</h2>
              <div className="af-stats-table-scroll" role="region" aria-label={t.salesByEvent} tabIndex={0}>
              <table style={{ width: "100%", marginTop: 10, borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", paddingBottom: 8 }}>{t.eventName}</th>
                    <th style={{ textAlign: "right", paddingBottom: 8 }}>{t.revenue}</th>
                    <th style={{ textAlign: "right", paddingBottom: 8 }}>{t.transactions}</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.salesByEvent.map((row) => (
                    <tr key={row.eventName}>
                      <td style={{ padding: "6px 0", borderTop: "1px solid #f3f4f6" }}>{row.eventName}</td>
                      <td style={{ padding: "6px 0", borderTop: "1px solid #f3f4f6", textAlign: "right" }}>
                        {formatEur(row.revenueCents, lang)}
                      </td>
                      <td style={{ padding: "6px 0", borderTop: "1px solid #f3f4f6", textAlign: "right" }}>
                        {row.transactions}
                      </td>
                    </tr>
                  ))}
                  {stats.salesByEvent.length === 0 ? (
                    <tr>
                      <td colSpan={3} style={{ padding: "8px 0", color: "#5f5f5f" }}>
                        0
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
                </div>
            </section>

            <section
              style={{
                marginTop: 14,
                background: "white",
                border: "1px solid #F1D7C8",
                borderRadius: 12,
                padding: 14,
              }}
            >
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>{t.eventOverview}</h2>
              <div style={{ marginTop: 6, opacity: 0.8, fontSize: 13 }}>{t.eventOverviewSub}</div>
              <div style={{ marginTop: 12, display: "grid", gap: 12, minWidth: 0, overflowWrap: "anywhere", gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))" }}>
                {eventSummaries.map((summary) => {
                  const assignment = staffAssignments.find((entry) => entry.eventId === summary.eventId);
                  const visibleItems = summary.sections.flatMap((section) =>
                    section.items
                      .filter((item) => item.visible)
                      .map((item) => ({
                        sectionTitle: section.title[lang],
                        itemName: item.name[lang],
                        price: item.price,
                      }))
                  );
                  const paymentBadges = [
                    summary.paymentConfig.cashEnabled ? "Cash" : null,
                    summary.paymentConfig.cardEnabled ? "Carte" : null,
                    summary.paymentConfig.cashlessEnabled ? "Cashless" : null,
                  ].filter(Boolean);

                  return (
                    <div
                      key={summary.eventId}
                      style={{
                        border: "1px solid #F1D7C8",
                        borderRadius: 14,
                        padding: 14,
                        background: summary.eventId === activeEventId ? "#fff7ed" : "#fffaf6",
                      }}
                    >
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
                        <div>
                          <div style={{ fontWeight: 900, fontSize: 18 }}>{summary.eventName}</div>
                          <div style={{ fontSize: 12, opacity: 0.6 }}>{summary.eventId}</div>
                        </div>
                        {summary.eventId === activeEventId ? (
                          <div style={{ padding: "6px 10px", borderRadius: 999, background: "#111", color: "white", fontWeight: 800, fontSize: 12 }}>
                            {t.activeBadge}
                          </div>
                        ) : null}
                      </div>

                      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                        <div>
                          <div style={{ fontWeight: 800, marginBottom: 6 }}>{t.allowedPayments}</div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {paymentBadges.length > 0 ? (
                              paymentBadges.map((label) => (
                                <span key={`${summary.eventId}-${label}`} style={{ padding: "6px 10px", borderRadius: 999, background: "#dcfce7", color: "#166534", fontWeight: 800, fontSize: 12 }}>
                                  {label}
                                </span>
                              ))
                            ) : (
                              <span style={{ padding: "6px 10px", borderRadius: 999, background: "#fee2e2", color: "#991b1b", fontWeight: 800, fontSize: 12 }}>
                                {lang === "fr" ? "Commandes fermees" : lang === "de" ? "Bestellungen geschlossen" : "Orders closed"}
                              </span>
                            )}
                          </div>
                        </div>

                        <div>
                          <div style={{ fontWeight: 800, marginBottom: 6 }}>{t.assignedCashiers}</div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {assignment && assignment.cashiers.length > 0 ? (
                              assignment.cashiers.map((user) => (
                                <span key={user.id} style={{ padding: "6px 10px", borderRadius: 999, background: "#dbeafe", color: "#1d4ed8", fontWeight: 800, fontSize: 12 }}>
                                  {user.username}
                                </span>
                              ))
                            ) : (
                              <span style={{ opacity: 0.75 }}>{t.noAssignedCashiers}</span>
                            )}
                          </div>
                        </div>

                        <div>
                          <div style={{ fontWeight: 800, marginBottom: 6 }}>{t.assignedKitchen}</div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {assignment && assignment.kitchen.length > 0 ? (
                              assignment.kitchen.map((user) => (
                                <span key={user.id} style={{ padding: "6px 10px", borderRadius: 999, background: "#fef3c7", color: "#92400e", fontWeight: 800, fontSize: 12 }}>
                                  {user.username}
                                </span>
                              ))
                            ) : (
                              <span style={{ opacity: 0.75 }}>{t.noAssignedKitchen}</span>
                            )}
                          </div>
                        </div>

                        <div>
                          <div style={{ fontWeight: 800, marginBottom: 6 }}>
                            {t.visibleProducts} ({t.menuCount}: {visibleItems.length})
                          </div>
                          <div style={{ display: "grid", gap: 6 }}>
                            {visibleItems.map((item, index) => (
                              <div
                                key={`${summary.eventId}-${item.itemName}-${index}`}
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  gap: 10,
                                  padding: "8px 10px",
                                  borderRadius: 10,
                                  background: "rgba(255,255,255,0.9)",
                                  border: "1px solid #F3E2D6",
                                }}
                              >
                                <div>
                                  <div style={{ fontWeight: 700 }}>{item.itemName}</div>
                                  <div style={{ fontSize: 12, opacity: 0.65 }}>{item.sectionTitle}</div>
                                </div>
                                <div style={{ fontWeight: 900, whiteSpace: "nowrap" }}>{item.price.toFixed(2)} EUR</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section
              style={{
                marginTop: 14,
                borderRadius: 12,
                padding: 14,
                background: "white",
                border: "1px solid #e5e7eb",
              }}
            >
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>{t.salesHours}</h2>
              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                {stats.salesByHour.map((row) => (
                  <div key={row.hour} style={{ display: "grid", gridTemplateColumns: "86px 1fr 60px", gap: 8 }}>
                    <div style={{ fontWeight: 700 }}>{formatHourLabel(row.hour)}</div>
                    <div
                      style={{
                        borderRadius: 8,
                        background: "rgba(242,140,40,0.2)",
                        overflow: "hidden",
                        height: 20,
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.max(6, (row.transactions / maxHourTx) * 100)}%`,
                          height: "100%",
                          background: "linear-gradient(135deg,#ff7a00,#ff3c00)",
                        }}
                      />
                    </div>
                    <div style={{ textAlign: "right", fontWeight: 700 }}>{row.transactions}</div>
                  </div>
                ))}
                {stats.salesByHour.length === 0 ? (
                  <div style={{ color: "#5f5f5f" }}>{t.salesHours}: 0</div>
                ) : null}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
