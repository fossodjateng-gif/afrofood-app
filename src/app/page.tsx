"use client";

import React from "react";
import { getSavedLang, saveLang, translations, type Lang } from "@/lib/translations";

export default function Home() {
  const [lang, setLang] = React.useState<Lang>("de");
  const t = translations[lang];

  React.useEffect(() => {
    setLang(getSavedLang());
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: 24,
        position: "relative",
        overflow: "hidden",
        backgroundColor: "#FFF3E6",
        color: "#111",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(180deg, rgba(255,243,230,0.82) 0%, rgba(255,243,230,0.9) 100%), url('/logo-afrofood.png')",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
          backgroundSize: "cover, min(64vw, 420px)",
          pointerEvents: "none",
        }}
      />

      <div style={{ position: "relative", zIndex: 2, maxWidth: 600 }}>
        <div style={{ marginBottom: 14, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
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
                border: "1px solid #111",
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

        <h1
          style={{
            fontSize: 36,
            fontWeight: 900,
            marginBottom: 10,
            color: "#111",
          }}
        >
          {t.home_title}
        </h1>

        <p
          style={{
            fontSize: 16,
            color: "#444",
            marginBottom: 30,
          }}
        >
          {t.subtitle}
        </p>

        <div
          style={{
            marginTop: 14,
            display: "flex",
            gap: 12,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <a
            href="/menu"
            style={{
              display: "inline-block",
              padding: "14px 28px",
              borderRadius: 999,
              textDecoration: "none",
              fontWeight: 900,
              fontSize: 16,
              color: "white",
              background: "linear-gradient(135deg, #ff7a00, #ff3c00)",
              boxShadow: "0 14px 35px rgba(242,140,40,0.3)",
            }}
          >
            {t.menu}
          </a>
          <a
            href="/staff"
            style={{
              display: "inline-block",
              padding: "14px 28px",
              borderRadius: 999,
              textDecoration: "none",
              fontWeight: 900,
              fontSize: 16,
              color: "#0f172a",
              background: "white",
              border: "1px solid #cbd5e1",
            }}
          >
            {t.home_staff}
          </a>
        </div>
      </div>
    </main>
  );
}
