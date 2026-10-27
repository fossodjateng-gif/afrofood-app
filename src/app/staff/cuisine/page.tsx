"use client";
import Link from "next/link";
import { StaffPageFrame } from "@/components/StaffPageFrame";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSession, clearSession, getStaffRoleLabel } from "@/lib/staff-auth";
import { getSavedLang, saveLang, type Lang } from "@/lib/translations";
import { goBackOr } from "@/lib/client-nav";

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
    logout: "Se deconnecter",
	    section: "Cuisine",
	    kitchen: "Cuisine",
	    readyOrders: "Commande prete",
	    availability: "Disponibilite produits",
	    assignedEvent: "Evenement assigne",
	  },
  de: {
    title: "Kuchenbereich",
    loggedAs: "Angemeldet als",
    home: "Start",
    back: "Zuruck",
    logout: "Abmelden",
	    section: "Kuche",
	    kitchen: "Kuche",
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
	    kitchen: "Kitchen",
	    readyOrders: "Ready Orders",
	    availability: "Product availability",
	    assignedEvent: "Assigned event",
	  },
	};

function StaffCuisinePageContent() {
  const searchParams = useSearchParams();
  const displaySession = getSession();
  const username = displaySession?.username || "";
  const [lang, setLang] = useState<Lang>(() => getSavedLang());
  const role = displaySession?.role || null;
  const [eventName, setEventName] = useState("");
  const fromCaisse = String(searchParams.get("from") || "").toLowerCase() === "caisse";

  useEffect(() => {
    const s = getSession();
    if (!s) {
      window.location.href = "/team/login";
      return;
    }
    if (s.role !== "kitchen" && s.role !== "admin" && s.role !== "cashier") {
      window.location.href = "/staff";
      return;
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
	  }, []);
  const t = UI_TEXT[lang];

	  const cards = [
	    { href: fromCaisse ? "/kitchen?from=caisse" : "/kitchen", label: t.kitchen },
	    { href: fromCaisse ? "/screen?from=caisse" : "/screen", label: t.readyOrders },
	    { href: fromCaisse ? "/staff/cuisine/availability?from=caisse" : "/staff/cuisine/availability", label: t.availability },
	  ];

  return (
    <StaffPageFrame title={t.title} lang={lang} sticky
      context={{ name: username, role: role ? getStaffRoleLabel(role, lang) : "",
        eventName: eventName || displaySession?.cashierEventId,
        workstationName: displaySession?.workstationName,
        globalAdministration: role === "admin" && !displaySession?.cashierEventId }}
      back={fromCaisse ? <a href="/caisse" className="af-link-btn">{t.back}</a> : role === "admin" ? <Link href="/staff/admin" className="af-link-btn">{t.back}</Link> : <button type="button" onClick={() => goBackOr("/staff")} className="af-link-btn">{t.back}</button>}
      onLangChange={language => { setLang(language); saveLang(language); }}
      home={<Link href="/" className="af-link-btn">{t.home}</Link>}
      actions={!fromCaisse ? <button className="af-btn af-primary" type="button" onClick={async () => {
        await clearSession();
        window.location.href = "/team/login";
      }}>{t.logout}</button> : null}
    >
        <div style={{ marginTop: 12, background: "white", border: "1px solid #F1D7C8", borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>{t.section}</div>
          <div style={{ marginTop: 10, display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" }}>
            {cards.map((c) => (
              <Link
                key={c.href + c.label}
                href={c.href}
                className="af-link-btn"
                style={{
                  textDecoration: "none",
                  color: "#111",
                  background: "#fffaf6",
                  border: "1px solid #F1D7C8",
                  borderRadius: 12,
                  padding: 14,
                  fontWeight: 900,
                }}
              >
                {c.label}
              </Link>
            ))}
          </div>
        </div>
    </StaffPageFrame>
  );
}

export default function StaffCuisinePage() {
  return (
    <Suspense fallback={null}>
      <StaffCuisinePageContent />
    </Suspense>
  );
}
