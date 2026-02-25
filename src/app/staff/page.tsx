"use client";

import { useState } from "react";

const STAFF_PASSWORD = "0603";

export default function StaffPage() {
  const [password, setPassword] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

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
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Staff securise</h1>
          <p style={{ marginTop: 8, opacity: 0.8 }}>Entrer le mot de passe</p>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
            inputMode="numeric"
            placeholder="Mot de passe"
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
                setAuthError("Mot de passe incorrect");
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
            Entrer
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
        <h1 style={{ margin: 0, fontSize: 34, fontWeight: 900 }}>Staff</h1>
        <p style={{ marginTop: 8, opacity: 0.8 }}>Choisir un espace de travail</p>

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
            Caisse
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
            Cuisine
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
            Commandes pretes
          </a>
        </div>
      </div>
    </main>
  );
}
