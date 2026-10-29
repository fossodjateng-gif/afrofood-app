"use client";
import Link from "next/link";
import cuisine from "@/components/cuisine.module.css";
import { StaffPageFrame } from "@/components/StaffPageFrame";
import { StaffNavigationCard } from "@/components/StaffNavigationCard";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSession, clearSession, getStaffRoleLabel } from "@/lib/staff-auth";
import { getSavedLang, saveLang, type Lang } from "@/lib/translations";
import { loadAdminKitchenEvent } from "@/lib/admin-kitchen-client";
import { useTemporaryCashierWorkspace } from "@/components/TemporaryCashierWorkspace";

const UI_TEXT: Record<
  Lang,
  {
	    title: string;
	    loggedAs: string;
	    home: string;
	    back: string;
	    logout: string;
	    section: string;
	    kitchen: string;
    kitchenHint: string;
    readyHint: string;
    availabilityHint: string;
	    readyOrders: string;
	    availability: string;
	    assignedEvent: string;
	  }
> = {
  fr: {
    title: "Espace Cuisine",
    loggedAs: "Connecte en tant que",
    home: "Accueil",
    back: "Retour",
    logout: "Se déconnecter",
	    section: "Cuisine",
	    kitchen: "Commandes à préparer",
    kitchenHint: "Voir les commandes et suivre la préparation.",
    readyHint: "Voir les commandes prêtes à retirer.",
    availabilityHint: "Indiquer les produits disponibles et les quantités.",
	    readyOrders: "Commandes prêtes",
	    availability: "Disponibilité produits",
	    assignedEvent: "Evenement assigne",
	  },
  de: {
    title: "Küchenbereich",
    loggedAs: "Angemeldet als",
    home: "Start",
    back: "Zurück",
    logout: "Abmelden",
	    section: "Küche",
	    kitchen: "Bestellungen zubereiten",
    kitchenHint: "Bestellungen und Zubereitung verfolgen.",
    readyHint: "Abholbereite Bestellungen anzeigen.",
    availabilityHint: "Produktverfügbarkeit und Mengen verwalten.",
	    readyOrders: "Fertige Bestellungen",
	    availability: "Produktverfugbarkeit",
	    assignedEvent: "Zugewiesenes Event",
	  },
  en: {
    title: "Kitchen Space",
    loggedAs: "Logged in as",
    home: "Home",
    back: "Back",
    logout: "Logout",
	    section: "Kitchen",
	    kitchen: "Orders to prepare",
    kitchenHint: "View orders and follow preparation.",
    readyHint: "View orders ready for pickup.",
    availabilityHint: "Update product availability and quantities.",
	    readyOrders: "Ready Orders",
	    availability: "Product availability",
	    assignedEvent: "Assigned event",
	  },
	};

function StaffCuisinePageContent() {
  const temporaryWorkspace = useTemporaryCashierWorkspace();
  const searchParams = useSearchParams();
  const displaySession = getSession();
  const username = displaySession?.username || "";
  const [lang, setLang] = useState<Lang>(() => getSavedLang());
  const role = displaySession?.role || null;
  const [eventName, setEventName] = useState("");
  const [validatedAdminEvent, setValidatedAdminEvent] = useState("");
  const [contextError, setContextError] = useState("");
  const fromCaisse = String(searchParams.get("from") || "").toLowerCase() === "caisse";
  const adminEventId = role === "admin" && !fromCaisse ? searchParams.get("adminEventId") || "" : "";
  const workspaceHref = adminEventId ? `/staff/admin/events?eventId=${encodeURIComponent(adminEventId)}` : "";
  const navigationQuery = fromCaisse ? "?from=caisse" : adminEventId ? `?adminEventId=${encodeURIComponent(adminEventId)}` : "";

  useEffect(() => {
    let alive = true;
    const s = getSession();
    if (!s) {
      window.location.href = "/team/login";
      return;
    }
    if (s.role !== "kitchen" && s.role !== "admin" && s.role !== "cashier") {
      window.location.href = "/staff";
      return;
    }
    if (s.role === "admin" && !fromCaisse) {
      void loadAdminKitchenEvent(adminEventId).then(event => {
        if (!alive) return;
        setEventName(event.name); setValidatedAdminEvent(event.id); setContextError("");
      }).catch(error => { if (alive) setContextError(error instanceof Error ? error.message : "admin_kitchen_context_unavailable"); });
      return () => { alive = false; };
    }
    void fetch("/api/menu-config", { cache: "no-store" })
	      .then((res) => res.json())
	      .then((data) => {
	        const assignedId = String(s.cashierEventId || "").trim();
	        const events = Array.isArray(data?.storeConfig?.events) ? data.storeConfig.events : [];
	        const match = events.find((event: { id?: string }) => String(event?.id || "").trim() === assignedId);
	        setEventName(String(match?.name || "").trim());
	      })
	      .catch(() => {});
	  }, [adminEventId, fromCaisse]);
  const t = UI_TEXT[lang];

	  const cards = [
	    { href: `/kitchen${navigationQuery}`, label: t.kitchen, hint: t.kitchenHint, icon: "♨" },
	    { href: `/screen${navigationQuery}`, label: t.readyOrders, hint: t.readyHint, icon: "✓" },
	    { href: `/staff/cuisine/availability${navigationQuery}`, label: t.availability, hint: t.availabilityHint, icon: "☷" },
	  ];

  return (
    <div className={cuisine.workspace}>
    <StaffPageFrame title={t.title} lang={lang}
      context={{ name: username, role: role ? getStaffRoleLabel(role, lang) : "",
        eventName: eventName || adminEventId || displaySession?.cashierEventId,
        globalAdministration: role === "admin" && !adminEventId && !displaySession?.cashierEventId }}
      back={temporaryWorkspace ? <a href="/staff/caisse" className="af-link-btn">{t.back} · {lang === "fr" ? "Espace Caisse" : lang === "de" ? "Kassenbereich" : "Cashier space"}</a> : <Link href={fromCaisse ? "/caisse" : workspaceHref || (role === "admin" ? "/staff/admin" : "/staff")} className="af-link-btn">{t.back} · {fromCaisse ? "Caisse" : workspaceHref ? (lang === "fr" ? "Événement Admin" : lang === "de" ? "Eventverwaltung" : "Event admin") : role === "admin" ? "Admin" : (lang === "fr" ? "Espace équipe" : lang === "de" ? "Teambereich" : "Team space")}</Link>}
      onLangChange={language => { setLang(language); saveLang(language); }}
      home={<Link href="/" className="af-link-btn">{t.home}</Link>}
      actions={!fromCaisse ? <button className="af-btn af-primary" type="button" onClick={async () => {
        await clearSession();
        window.location.href = "/team/login";
      }}>{t.logout}</button> : null}
    >
      {contextError ? <p role="alert">{contextError}</p> : null}
      <nav className={cuisine.cards} aria-label={t.section}>
        {cards.map(card => <StaffNavigationCard key={card.href} href={card.href} icon={card.icon}
          title={card.label} description={card.hint} navigation="client" disabled={role === "admin" && !fromCaisse && (!adminEventId || validatedAdminEvent !== adminEventId || !!contextError)} />)}
      </nav>
    </StaffPageFrame>
    </div>
  );
}

export default function StaffCuisinePage() {
  return (
    <Suspense fallback={null}>
      <StaffCuisinePageContent />
    </Suspense>
  );
}
