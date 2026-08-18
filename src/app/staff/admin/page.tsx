"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  clearSession,
  getSession,
  getStaffRoleLabel,
  type StaffRole,
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
    statsSection: string;
    users: string;
    cashier: string;
    kitchenSpace: string;
    stats: string;
    settings: string;
  }
> = {
  fr: {
    title: "Administration",
    loggedAs: "Connecte en tant que",
    home: "Accueil",
    logout: "Se deconnecter",
    administration: "Administration",
    cashierSpace: "Espace Caisse",
    statsSection: "Statistique",
    users: "Utilisateurs",
    cashier: "Caisse",
    kitchenSpace: "Espace cuisine",
    stats: "Statistiques",
    settings: "Parametres",
  },
  de: {
    title: "Administration",
    loggedAs: "Angemeldet als",
    home: "Start",
    logout: "Abmelden",
    administration: "Administration",
    cashierSpace: "Kassenbereich",
    statsSection: "Statistik",
    users: "Benutzer",
    cashier: "Kasse",
    kitchenSpace: "Kuchenbereich",
    stats: "Statistiken",
    settings: "Einstellungen",
  },
  en: {
    title: "Administration",
    loggedAs: "Logged in as",
    home: "Home",
    logout: "Logout",
    administration: "Administration",
    cashierSpace: "Cashier Space",
    statsSection: "Statistics",
    users: "Users",
    cashier: "Cashier",
    kitchenSpace: "Kitchen space",
    stats: "Stats",
    settings: "Settings",
  },
};

export default function StaffAdminPage() {
  const [username, setUsername] = useState("");
  const [lang, setLang] = useState<Lang>("fr");
  const [role, setRole] = useState<StaffRole | null>(null);

  useEffect(() => {
    setLang(getSavedLang());
    const s = getSession();
    if (!s) {
      window.location.href = "/team/login";
      return;
    }
    if (s.role !== "admin") {
      window.location.href = "/staff";
      return;
    }
    setUsername(s.username);
    setRole(s.role);
  }, []);

  const t = UI_TEXT[lang];

  const sections = [
    {
      title: t.administration,
      cards: [
        { href: "/staff/admin/users", label: t.users },
        { href: "/staff/admin/settings", label: t.settings },
      ],
    },
    {
      title: t.cashierSpace,
      cards: [
        { href: "/staff/caisse", label: t.cashier },
        { href: "/staff/cuisine", label: t.kitchenSpace },
      ],
    },
    {
      title: t.statsSection,
      cards: [
        { href: "/stats", label: t.stats },
      ],
    },
  ];

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 24,
        fontFamily: "system-ui",
        backgroundColor: "#FFF3E6",
        backgroundImage:
          "linear-gradient(180deg, rgba(255,243,230,0.82) 0%, rgba(255,243,230,0.9) 100%), url('/logo-afrofood.png')",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center, center",
        backgroundSize: "cover, min(64vw, 420px)",
      }}
    >
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
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
              <img
                src="/logo-afrofood.png"
                alt="AfroFood"
                style={{ width: 30, height: 30, borderRadius: 8, objectFit: "cover", border: "1px solid #F1D7C8" }}
              />
              {t.title}
            </h1>
            <div style={{ opacity: 0.75, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span>{t.loggedAs}: {username || "-"}</span>
              {role ? <span className="af-role-badge">Role: {getStaffRoleLabel(role, lang)}</span> : null}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
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
            <Link
              href="/"
              className="af-link-btn"
              style={{ textDecoration: "none", padding: "8px 12px", borderRadius: 10, border: "1px solid #111", color: "#111", fontWeight: 800 }}
            >
              {t.home}
            </Link>
            <button
              className="af-btn"
              type="button"
              onClick={() => {
                clearSession();
                window.location.href = "/team/login";
              }}
              style={{ padding: "8px 12px", borderRadius: 10, border: "none", background: "#111", color: "white", fontWeight: 800, cursor: "pointer" }}
            >
              {t.logout}
            </button>
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
      </div>
    </main>
  );
}
