"use client";

import React from "react";

export default function Home() {
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
        <h1
          style={{
            fontSize: 36,
            fontWeight: 900,
            marginBottom: 10,
            color: "#111",
          }}
        >
          AfroFood Festival 2026
        </h1>

        <p
          style={{
            fontSize: 16,
            color: "#444",
            marginBottom: 30,
          }}
        >
          Commande digitale (DE - FR - EN)
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
            Menu
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
            Staff
          </a>
        </div>
      </div>
    </main>
  );
}
