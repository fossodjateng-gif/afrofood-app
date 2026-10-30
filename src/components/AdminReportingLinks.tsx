import type { Lang } from "@/lib/translations";

export function AdminReportingLinks({ lang, eventId }: { lang: Lang; eventId?: string }) {
  const query = eventId ? `?eventId=${encodeURIComponent(eventId)}` : "";
  return <nav aria-label={lang === "fr" ? "Pilotage Admin" : lang === "de" ? "Admin-Auswertung" : "Admin reporting"}
    style={{ display: "flex", gap: 12, margin: "20px 0", flexWrap: "wrap" }}>
    <a className="af-link-btn" href={`/stats${query}`}>{lang === "fr" ? "Statistiques" : lang === "de" ? "Statistiken" : "Statistics"}</a>
    <a className="af-link-btn" href={`/staff/admin/history${query}`}>{lang === "fr" ? "Historique des ventes" : lang === "de" ? "Verkaufshistorie" : "Sales history"}</a>
  </nav>;
}
