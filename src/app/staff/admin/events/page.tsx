"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { openCashierLease } from "@/lib/cashier-lease-client";
import { openTemporaryCashierContext, quitTemporaryCashier } from "@/lib/temporary-cashier-client";
import type { WorkstationConfig } from "@/lib/workstations";
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
  const [workstations, setWorkstations] = useState<Record<string, WorkstationConfig>>({});
  const [choice, setChoice] = useState({ eventId: "", id: "" });
  const [opening, setOpening] = useState(false);
  const [openingError, setOpeningError] = useState("");
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
      if (!controller.signal.aborted) { setEvents(data.events); setWorkstations(data.workstations || {}); }
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, []);
  const event = events?.find(event => event.id === eventId);
  const registers = (workstations[eventId]?.cashier || []).filter(station => station.active && station.type === "cashier");
  const selected = choice.eventId === eventId ? registers.find(station => station.id === choice.id) : undefined;
  const temporaryText = {
    fr: { title: "Ouvrir temporairement une caisse", station: "Poste de caisse", choose: "Choisir une caisse", open: "Ouvrir la caisse", busy: "Ouverture…", occupied: "Cette caisse est occupée. Choisissez un autre poste ou réessayez plus tard.", error: "Impossible d’ouvrir cette caisse. Vérifiez votre session Admin et réessayez.", none: "Aucun poste de caisse actif pour cet événement.", hint: "Vous restez Admin. Votre affectation permanente ne change pas. Parcours espèces uniquement pour le moment." },
    de: { title: "Kasse vorübergehend öffnen", station: "Kassenarbeitsplatz", choose: "Kasse auswählen", open: "Kasse öffnen", busy: "Wird geöffnet…", occupied: "Diese Kasse ist belegt. Wählen Sie einen anderen Arbeitsplatz oder versuchen Sie es später erneut.", error: "Kasse konnte nicht geöffnet werden. Bitte Admin-Sitzung prüfen und erneut versuchen.", none: "Kein aktiver Kassenarbeitsplatz für dieses Event.", hint: "Sie bleiben Admin. Ihre feste Zuweisung bleibt unverändert. Vorerst nur Barzahlung." },
    en: { title: "Open a register temporarily", station: "Cashier workstation", choose: "Choose a register", open: "Open register", busy: "Opening…", occupied: "This register is occupied. Choose another workstation or try again later.", error: "Unable to open this register. Check your Admin session and retry.", none: "No active cashier workstation for this event.", hint: "You remain Admin. Your permanent assignment is unchanged. Cash payments only for now." },
  }[lang];
  async function openRegister() {
    if (!event || !selected || opening) return;
    setOpening(true); setOpeningError("");
    let lease: Awaited<ReturnType<typeof openCashierLease>> | undefined;
    let opened = false;
    try {
      lease = await openCashierLease(event.id, selected.id);
      await openTemporaryCashierContext(event.id, selected.id, lease.instanceId);
      opened = true;
      lease.handoff();
      await lease.detach();
      window.location.assign("/caisse");
    } catch (reason) {
      if (opened) await quitTemporaryCashier(async () => { await lease?.detach(); }).catch(() => undefined);
      else await lease?.detach();
      setOpeningError(reason instanceof Error && /cashier_locked|instance_conflict/.test(reason.message) ? temporaryText.occupied : temporaryText.error);
      setOpening(false);
    }
  }
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
      <section className="af-panel"><h2>{temporaryText.title}</h2><p>{temporaryText.hint}</p>
        {registers.length ? <form onSubmit={e => { e.preventDefault(); void openRegister(); }}>
          <label>{temporaryText.station}<select required disabled={opening} value={selected?.id || ""} onChange={e => setChoice({ eventId, id: e.target.value })}>
            <option value="">{temporaryText.choose}</option>{registers.map(station => <option key={station.id} value={station.id}>{station.name}</option>)}
          </select></label>
          <button type="submit" className="af-btn af-primary" disabled={opening || !selected}>{opening ? temporaryText.busy : temporaryText.open}</button>
        </form> : <p>{temporaryText.none}</p>}
        {openingError ? <p role="alert">{openingError}</p> : null}
      </section>
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
