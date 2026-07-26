"use client";

import { useState } from "react";
import { getSavedLang, saveLang, type Lang } from "@/lib/translations";
import { login, roleLandingPath } from "@/lib/staff-auth";
import { goBackOr } from "@/lib/client-nav";

const UI_TEXT: Record<
  Lang,
  {
    title: string;
    username: string;
    password: string;
    login: string;
    wrong: string;
    back: string;
  }
> = {
  fr: {
    title: "Connexion utilisateur",
    username: "Nom d'utilisateur",
    password: "Mot de passe",
    login: "Se connecter",
    wrong: "Identifiants invalides",
    back: "Retour",
  },
  de: {
    title: "Benutzeranmeldung",
    username: "Benutzername",
    password: "Passwort",
    login: "Einloggen",
    wrong: "Ungultige Zugangsdaten",
    back: "Zuruck",
  },
  en: {
    title: "User login",
    username: "Username",
    password: "Password",
    login: "Log in",
    wrong: "Invalid credentials",
    back: "Back",
  },
};

export default function TeamLoginPage() {
  const [lang, setLang] = useState<Lang>(getSavedLang());
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const t = UI_TEXT[lang];

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        backgroundColor: "#FFF3E6",
        backgroundImage:
          "linear-gradient(180deg, rgba(255,243,230,0.82) 0%, rgba(255,243,230,0.9) 100%), url('/logo-afrofood.png')",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center, center",
        backgroundSize: "cover, min(64vw, 420px)",
      }}
    >
      <div style={{ width: "100%", maxWidth: 380, background: "rgba(17,24,39,0.88)", borderRadius: 14, padding: 16, color: "white", border: "1px solid #334155" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={() => goBackOr("/")} className="af-link-btn" style={{ padding: "6px 10px", borderRadius: 10, border: "none", background: "white", color: "#111", fontWeight: 800, cursor: "pointer" }}>
            {t.back}
          </button>
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
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 900, marginTop: 12 }}>{t.title}</h1>
        <div style={{ marginTop: 10 }}>
          <label style={{ fontWeight: 700 }}>{t.username}</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{ width: "100%", marginTop: 6, padding: "10px 12px", borderRadius: 10, border: "1px solid #475569", background: "#0f172a", color: "white" }}
          />
        </div>
        <div style={{ marginTop: 10 }}>
          <label style={{ fontWeight: 700 }}>{t.password}</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: "100%", marginTop: 6, padding: "10px 12px", borderRadius: 10, border: "1px solid #475569", background: "#0f172a", color: "white" }}
          />
        </div>
        {error ? <div style={{ marginTop: 8, color: "#fca5a5", fontWeight: 800 }}>{error}</div> : null}
        <button
          className="af-btn"
          type="button"
          onClick={() => {
            const out = login(username, password);
            if (!out.ok) {
              setError(t.wrong);
              return;
            }
            setError(null);
            window.location.href = roleLandingPath(out.session.role);
          }}
          style={{ width: "100%", marginTop: 12, padding: "10px 14px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#ff7a00,#ff3c00)", color: "white", fontWeight: 900, cursor: "pointer" }}
        >
          {t.login}
        </button>
      </div>
    </main>
  );
}
