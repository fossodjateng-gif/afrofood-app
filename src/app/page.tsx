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
      }}
    >
      {/* Background Logo */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "url('/logo-afrofood.png')",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
          backgroundSize: "70%",
          opacity: 0.08,
          pointerEvents: "none",
        }}
      />

      {/* Content */}
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
          Commande digitale (DE • FR • EN)
        </p>

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
            background:
              "linear-gradient(135deg, #ff7a00, #ff3c00)",
            boxShadow: "0 14px 35px rgba(242,140,40,0.3)",
            transition: "all 0.25s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-4px)";
            e.currentTarget.style.boxShadow =
              "0 20px 45px rgba(242,140,40,0.4)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow =
              "0 14px 35px rgba(242,140,40,0.3)";
          }}
        >
          🍽️ Zum Menü
        </a>
      </div>
    </main>
  );
}