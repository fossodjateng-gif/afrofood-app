"use client";

import { useEffect, useState } from "react";
import {
  getSession,
  getStaffRoleLabel,
  type StaffRole,
} from "@/lib/staff-auth";
import { getSavedLang, saveLang, type Lang } from "@/lib/translations";
import { goBackOr } from "@/lib/client-nav";

const UI_TEXT: Record<
  Lang,
  {
    title: string;
    subtitle: string;
    back: string;
    settings: string;
    payments: string;
    event: string;
    tap: string;
  }
> = {
  fr: {
    title: "Parametres",
    subtitle: "Acces direct aux reglages globaux sans dupliquer les autres espaces.",
    back: "Retour",
    settings: "Reglages globaux",
    payments: "Paiements",
    event: "Evenement / Marche",
    tap: "Tap to Pay / Admin Menu",
  },
  de: {
    title: "Einstellungen",
    subtitle: "Direkter Zugriff auf globale Einstellungen ohne die anderen Bereiche zu duplizieren.",
    back: "Zuruck",
    settings: "Globale Einstellungen",
    payments: "Zahlungen",
    event: "Event / Markt",
    tap: "Tap to Pay / Admin Menu",
  },
  en: {
    title: "Settings",
    subtitle: "Direct access to global settings without duplicating the other staff spaces.",
    back: "Back",
    settings: "Global settings",
    payments: "Payments",
    event: "Event / Market",
    tap: "Tap to Pay / Admin Menu",
  },
};

export default function StaffAdminSettingsPage() {
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
    setRole(s.role);
  }, []);

  const t = UI_TEXT[lang];

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
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
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
            {role ? <div style={{ marginTop: 4 }}><span className="af-role-badge">Role: {getStaffRoleLabel(role, lang)}</span></div> : null}
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
            <button
              type="button"
              onClick={() => goBackOr("/staff/admin")}
              className="af-link-btn"
              style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #111", background: "white", color: "#111", fontWeight: 800, cursor: "pointer" }}
            >
              {t.back}
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

        <div style={{ marginTop: 12, background: "white", border: "1px solid #F1D7C8", borderRadius: 12, padding: 14 }}>
          <div style={{ fontWeight: 900, fontSize: 22, color: "#111", textTransform: "uppercase", letterSpacing: 0.4 }}>{t.settings}</div>
          <p style={{ marginTop: 8, opacity: 0.8 }}>{t.subtitle}</p>
          <div style={{ marginTop: 10, display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" }}>
            <a
              href="/admin/menu?view=payment"
              className="af-link-btn"
              style={{ textDecoration: "none", color: "#111", background: "#fffaf6", border: "1px solid #F1D7C8", borderRadius: 12, padding: 14, fontWeight: 900 }}
            >
              {t.payments}
            </a>
            <a
              href="/admin/menu?view=event"
              className="af-link-btn"
              style={{ textDecoration: "none", color: "#111", background: "#fffaf6", border: "1px solid #F1D7C8", borderRadius: 12, padding: 14, fontWeight: 900 }}
            >
              {t.event}
            </a>
            <a
              href="/admin/menu?view=tap"
              className="af-link-btn"
              style={{ textDecoration: "none", color: "#111", background: "#fffaf6", border: "1px solid #F1D7C8", borderRadius: 12, padding: 14, fontWeight: 900 }}
            >
              {t.tap}
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
