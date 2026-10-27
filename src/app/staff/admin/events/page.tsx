"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { StaffPageFrame } from "@/components/StaffPageFrame";
import { getSession, getStaffRoleLabel, staffFetch } from "@/lib/staff-auth";
import { getSavedLang, saveLang } from "@/lib/translations";

const TEXT = {
  fr: { events: "Événements", back: "Retour", manage: "Créer / gérer les événements", configuration: "Configuration des événements", management: "Gestion événement", users: "Utilisateurs", stations: "Postes de travail", cashier: "Caisse", products: "Produits / Prix / Visibilité", payments: "Paiements autorisés", add: "Ajouter produit", kitchen: "Cuisine", ready: "Commandes prêtes", availability: "Disponibilité produits", loading: "Chargement…", error: "Impossible de charger les événements. Vérifiez votre session administrateur.", missing: "Événement introuvable.", empty: "Aucun événement. Utilisez la gestion des événements pour en créer un.", limitation: "Les fonctions Cuisine nécessitent une affectation opérationnelle à cet événement. Aucun accès temporaire Admin n’est activé ici.", public: "La configuration existante permet aussi de changer l’événement public actif : cette action reste distincte de l’ouverture de cet espace." },
  de: { events: "Events", back: "Zurück", manage: "Events erstellen / verwalten", configuration: "Event-Konfiguration", management: "Event-Verwaltung", users: "Benutzer", stations: "Arbeitsplätze", cashier: "Kasse", products: "Produkte / Preise / Sichtbarkeit", payments: "Zugelassene Zahlungen", add: "Produkt hinzufügen", kitchen: "Küche", ready: "Fertige Bestellungen", availability: "Produktverfügbarkeit", loading: "Laden…", error: "Events konnten nicht geladen werden. Bitte Admin-Sitzung prüfen.", missing: "Event nicht gefunden.", empty: "Keine Events. Erstellen Sie ein Event über die Event-Verwaltung.", limitation: "Küchenfunktionen erfordern eine operative Zuweisung zu diesem Event. Hier gibt es keinen temporären Admin-Zugang.", public: "In der bestehenden Konfiguration kann auch das öffentliche aktive Event geändert werden. Dies ist eine separate Aktion." },
  en: { events: "Events", back: "Back", manage: "Create / manage events", configuration: "Event configuration", management: "Event management", users: "Users", stations: "Workstations", cashier: "Cashier", products: "Products / Prices / Visibility", payments: "Allowed payments", add: "Add product", kitchen: "Kitchen", ready: "Ready orders", availability: "Product availability", loading: "Loading…", error: "Unable to load events. Check your administrator session.", missing: "Event not found.", empty: "No events. Use event management to create one.", limitation: "Kitchen functions require an operational assignment to this event. Temporary Admin access is not enabled here.", public: "The existing configuration also allows changing the active public event. That remains a separate action from opening this workspace." },
};

function EventsContent() {
  const params = useSearchParams();
  const eventId = params.get("eventId") || "";
  const [lang, setLang] = useState(getSavedLang);
  const [events, setEvents] = useState<Array<{ id: string; name: string }> | null>(null);
  const [error, setError] = useState(false);
  const session = getSession();
  const t = TEXT[lang];
  useEffect(() => {
    const session = getSession();
    if (!session) { window.location.href = "/team/login"; return; }
    if (session.role !== "admin") { window.location.href = "/staff"; return; }
    const controller = new AbortController();
    void staffFetch("/api/staff/workstations", { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Events unavailable");
      const data = await response.json();
      if (!controller.signal.aborted) setEvents(data.events);
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, []);
  const event = events?.find(event => event.id === eventId);
  const query = `adminEventId=${encodeURIComponent(eventId)}`;
  const operational = !!event && session?.cashierEventId === event.id && !!session?.workstationId;
  const sections = event ? [
    { title: t.management, cards: [
      { label: t.users, href: `/staff/admin/users?${query}` },
      { label: t.stations, href: `/staff/admin/users?${query}#workstations` },
      { label: t.configuration, href: `/admin/menu?view=event&${query}` },
    ] },
    { title: t.cashier, cards: [
      { label: t.products, href: `/admin/menu?view=pricing&${query}` },
      { label: t.payments, href: `/admin/menu?view=payment&${query}` },
      { label: t.add, href: `/admin/menu?view=add&${query}` },
    ] },
    { title: t.kitchen, cards: [
      { label: t.kitchen, href: `/kitchen?${query}` },
      { label: t.ready, href: `/screen?${query}` },
      { label: t.availability, href: `/staff/cuisine/availability?${query}` },
    ] },
  ] : [];
  return <StaffPageFrame title={event?.name || t.events} lang={lang} sticky
    context={{ name: session?.username || "", role: session ? getStaffRoleLabel(session.role, lang) : "", eventName: event?.name || eventId, globalAdministration: !eventId }}
    onLangChange={language => { setLang(language); saveLang(language); }}
    back={<Link className="af-link-btn" href={eventId ? "/staff/admin/events" : "/staff/admin"}>{t.back}</Link>}>
    {error ? <p role="alert">{t.error}</p> : events === null ? <p role="status">{t.loading}</p> : eventId && !event ? <p role="alert">{t.missing}</p> : event ? <>
      {sections.map(section => <section className="af-panel" key={section.title}><h2>{section.title}</h2>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" }}>
          {section.cards.map(card => section.title === t.kitchen && !operational
            ? <span className="af-link-btn" aria-disabled="true" key={card.href}>{card.label}</span>
            : <Link className="af-link-btn" key={card.href} href={card.href}>{card.label}</Link>)}
        </div>{section.title === t.kitchen && !operational ? <p>{t.limitation}</p> : null}
        {section.title === t.management ? <p>{t.public}</p> : null}
      </section>)}
    </> : <section className="af-panel"><h2>{t.events}</h2>
      <div style={{ display: "grid", gap: 10 }}>{events.map(event => <Link className="af-link-btn" key={event.id} href={`/staff/admin/events?eventId=${encodeURIComponent(event.id)}`}>{event.name}</Link>)}</div>
      {events.length === 0 ? <p>{t.empty}</p> : null}
      <p><Link className="af-link-btn" href="/admin/menu?view=event&from=admin-events">{t.manage}</Link></p>
    </section>}
  </StaffPageFrame>;
}

export default function AdminEventsPage() {
  return <Suspense fallback={null}><EventsContent /></Suspense>;
}
