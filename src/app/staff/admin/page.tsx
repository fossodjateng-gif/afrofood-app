"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StaffPageFrame } from "@/components/StaffPageFrame";
import {
  clearSession,
  getSession,
  getStaffRoleLabel,
} from "@/lib/staff-auth";
import { getSavedLang, saveLang, type Lang } from "@/lib/translations";

const UI_TEXT: Record<
  Lang,
  {
    title: string;
    loggedAs: string;
    home: string;
    logout: string;
    administration: string;
    cashierSpace: string;
    users: string;
    events: string;
    cashier: string;
    stats: string;
  }
> = {
  fr: {
    title: "Administration",
    loggedAs: "Connecte en tant que",
    home: "Accueil",
    logout: "Se deconnecter",
    administration: "Administration",
    cashierSpace: "Espace Caisse",
    users: "Utilisateurs",
    events: "Evenements",
    cashier: "Caisse",
    stats: "Statistiques",
  },
  de: {
    title: "Administration",
    loggedAs: "Angemeldet als",
    home: "Start",
    logout: "Abmelden",
    administration: "Administration",
    cashierSpace: "Kassenbereich",
    users: "Benutzer",
    events: "Events",
    cashier: "Kasse",
    stats: "Statistiken",
  },
  en: {
    title: "Administration",
    loggedAs: "Logged in as",
    home: "Home",
    logout: "Logout",
    administration: "Administration",
    cashierSpace: "Cashier Space",
    users: "Users",
    events: "Events",
    cashier: "Cashier",
    stats: "Stats",
  },
};

export default function StaffAdminPage() {
  const session = getSession();
  const username = session?.username || "";
  const [lang, setLang] = useState<Lang>(() => getSavedLang());

  useEffect(() => {
    const s = getSession();
    if (!s) {
      window.location.href = "/team/login";
      return;
    }
    if (s.role !== "admin") {
      window.location.href = "/staff";
      return;
    }
  }, []);

  const t = UI_TEXT[lang];

  const sections = [
    {
      title: t.administration,
      cards: [
        { href: "/staff/admin/events", label: t.events },
        { href: "/stats", label: t.stats },
      ],
    },

  ];

  return (
    <StaffPageFrame title={t.title} lang={lang} sticky
      context={{ name: username, role: session ? getStaffRoleLabel(session.role, lang) : "", globalAdministration: true }}
      onLangChange={language => { setLang(language); saveLang(language); }}
      home={<Link href="/" className="af-link-btn">{t.home}</Link>}
      actions={<button className="af-btn af-primary" type="button" onClick={async () => {
        await clearSession();
        window.location.href = "/team/login";
      }}>{t.logout}</button>}
    >
        <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
          {sections.map((section) => (
            <div key={section.title} style={{ background: "white", border: "1px solid #F1D7C8", borderRadius: 12, padding: 12 }}>
              <div style={{ fontWeight: 900, fontSize: 22, color: "#111", textTransform: "uppercase", letterSpacing: 0.4 }}>{section.title}</div>
              <div style={{ marginTop: 10, display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" }}>
                {section.cards.map((c) => (
                  <a
                    key={c.href}
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
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
    </StaffPageFrame>
  );
}
