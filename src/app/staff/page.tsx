"use client";

import { useState } from "react";
import { getSavedLang, saveLang, type Lang } from "@/lib/translations";

const STAFF_PASSWORD = "0603";
const UI_TEXT: Record<
  Lang,
  {
    secureTitle: string;
    enterPassword: string;
    passwordPlaceholder: string;
    wrongPassword: string;
    enter: string;
    staff: string;
    workspace: string;
    cashier: string;
    kitchen: string;
    readyOrders: string;
  }
> = {
  de: {
    secureTitle: "Geschutzter Teamzugang",
    enterPassword: "Passwort eingeben",
    passwordPlaceholder: "Passwort",
    wrongPassword: "Falsches Passwort",
    enter: "Einloggen",
    staff: "Team",
    workspace: "Arbeitsbereich auswahlen",
    cashier: "Kasse",
    kitchen: "Kuche",
    readyOrders: "Fertige Bestellungen",
  },
  fr: {
    secureTitle: "Staff securise",
    enterPassword: "Entrer le mot de passe",
    passwordPlaceholder: "Mot de passe",
    wrongPassword: "Mot de passe incorrect",
    enter: "Entrer",
    staff: "Staff",
    workspace: "Choisir un espace de travail",
    cashier: "Caisse",
    kitchen: "Cuisine",
    readyOrders: "Commandes pretes",
  },
  en: {
    secureTitle: "Secured staff access",
    enterPassword: "Enter password",
    passwordPlaceholder: "Password",
    wrongPassword: "Incorrect password",
    enter: "Enter",
    staff: "Staff",
    workspace: "Choose a workspace",
    cashier: "Cashier",
    kitchen: "Kitchen",
    readyOrders: "Ready orders",
  },
};

export default function StaffPage() {
  const [lang, setLang] = useState<Lang>(() => getSavedLang());
  const [password, setPassword] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const t = UI_TEXT[lang];

  if (!isUnlocked) {
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
          color: "#111",
          display: "grid",
          placeItems: "center",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 360,
            background: "rgba(17,24,39,0.85)",
            border: "1px solid #334155",
            borderRadius: 14,
            padding: 16,
            color: "white",
          }}
        >
          <div style={{ display: "flex", gap: 8 }}>
            {(["de", "fr", "en"] as Lang[]).map((L) => (
              <button
                key={L}
                type="button"
                onClick={() => {
                  setLang(L);
                  saveLang(L);
                }}
                style={{
                  padding: "6px 10px",
                  borderRadius: 10,
                  border: "1px solid #475569",
                  background: lang === L ? "#111" : "white",
                  color: lang === L ? "white" : "#111",
                  cursor: "pointer",
                  fontWeight: 800,
                }}
              >
                {L.toUpperCase()}
              </button>
            ))}
          </div>
          <h1 style={{ margin: "10px 0 0 0", fontSize: 24, fontWeight: 900 }}>{t.secureTitle}</h1>
          <p style={{ marginTop: 8, opacity: 0.8 }}>{t.enterPassword}</p>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
            inputMode="numeric"
            placeholder={t.passwordPlaceholder}
            style={{
              marginTop: 10,
              width: "100%",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #475569",
              background: "#0f172a",
              color: "white",
            }}
          />
          {authError ? <div style={{ marginTop: 8, color: "#fca5a5", fontWeight: 700 }}>{authError}</div> : null}
          <button
            type="button"
            onClick={() => {
              if (password === STAFF_PASSWORD) {
                setAuthError(null);
                setIsUnlocked(true);
              } else {
                setAuthError(t.wrongPassword);
              }
            }}
            style={{
              marginTop: 10,
              width: "100%",
              padding: "10px 14px",
              borderRadius: 10,
              border: "none",
              background: "linear-gradient(135deg,#ff7a00,#ff3c00)",
              color: "white",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            {t.enter}
          </button>
        </div>
      </main>
    );
  }

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
        color: "#111",
        display: "grid",
        placeItems: "center",
      }}
    >
      <div style={{ textAlign: "center", width: "100%", maxWidth: 640 }}>
        <h1 style={{ margin: 0, fontSize: 34, fontWeight: 900 }}>{t.staff}</h1>
        <p style={{ marginTop: 8, opacity: 0.8 }}>{t.workspace}</p>

        <div style={{ marginTop: 18, display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <a
            href="/caisse"
            style={{
              padding: "14px 24px",
              borderRadius: 12,
              color: "white",
              textDecoration: "none",
              fontWeight: 900,
              background: "linear-gradient(135deg,#ff7a00,#ff3c00)",
              boxShadow: "0 12px 26px rgba(255,122,0,0.25)",
            }}
          >
            {t.cashier}
          </a>
          <a
            href="/kitchen"
            style={{
              padding: "14px 24px",
              borderRadius: 12,
              color: "white",
              textDecoration: "none",
              fontWeight: 900,
              background: "linear-gradient(135deg,#2563eb,#1d4ed8)",
              boxShadow: "0 12px 26px rgba(37,99,235,0.25)",
            }}
          >
            {t.kitchen}
          </a>
          <a
            href="/screen"
            style={{
              padding: "14px 24px",
              borderRadius: 12,
              color: "white",
              textDecoration: "none",
              fontWeight: 900,
              background: "linear-gradient(135deg,#16a34a,#15803d)",
              boxShadow: "0 12px 26px rgba(22,163,74,0.25)",
            }}
          >
            {t.readyOrders}
          </a>
        </div>
      </div>
    </main>
  );
}
