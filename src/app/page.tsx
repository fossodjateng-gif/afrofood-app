"use client";

import React from "react";
import { clearCart } from "@/lib/cart";
import { getSavedLang, saveLang, translations, type Lang } from "@/lib/translations";

const EVENT_ID_KEY = "af_event_id";
const EVENT_NAME_KEY = "af_event_name";
const LAST_ORDER_KEY = "af_last_order_id";

type EventOption = {
  id: string;
  name: string;
};

export default function Home() {
  const [lang, setLang] = React.useState<Lang>("de");
  const [events, setEvents] = React.useState<EventOption[]>([]);
  const [selectedEventId, setSelectedEventId] = React.useState("");
  const [loadingEvents, setLoadingEvents] = React.useState(true);
  const t = translations[lang];

  React.useEffect(() => {
    setLang(getSavedLang());
    const savedId = localStorage.getItem(EVENT_ID_KEY) || "";
    if (savedId.trim()) {
      setSelectedEventId(savedId.trim());
    }
  }, []);

  React.useEffect(() => {
    let alive = true;

    async function loadEvents() {
      try {
        const res = await fetch("/api/menu-config", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!alive) return;

        const nextEvents = Array.isArray(data?.storeConfig?.events)
          ? (data.storeConfig.events as Array<{ id?: string; name?: string }>)
              .map((event) => ({
                id: String(event?.id || "").trim(),
                name: String(event?.name || "").trim(),
              }))
              .filter((event) => event.id && event.name)
          : [];

        setEvents(nextEvents);

        if (!selectedEventId && nextEvents.length > 0) {
          const activeId = String(data?.storeConfig?.activeEventId || "").trim();
          setSelectedEventId(activeId || nextEvents[0].id);
        }
      } finally {
        if (alive) setLoadingEvents(false);
      }
    }

    void loadEvents();
    return () => {
      alive = false;
    };
  }, [selectedEventId]);

  function continueToMenu() {
    const chosen = events.find((event) => event.id === selectedEventId);
    if (!chosen) return;

    const previousEventId = localStorage.getItem(EVENT_ID_KEY) || "";
    if (previousEventId && previousEventId !== chosen.id) {
      clearCart();
      localStorage.removeItem(LAST_ORDER_KEY);
    }

    localStorage.setItem(EVENT_ID_KEY, chosen.id);
    localStorage.setItem(EVENT_NAME_KEY, chosen.name);
    window.location.href = "/menu";
  }

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

      <div style={{ position: "relative", zIndex: 2, maxWidth: 640, width: "100%" }}>
        <div style={{ marginBottom: 14, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
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
            marginBottom: 24,
          }}
        >
          {t.subtitle}
        </p>

        {events.length > 0 ? (
          <div
            style={{
              margin: "0 auto 24px",
              maxWidth: 480,
              textAlign: "left",
              background: "rgba(255,255,255,0.94)",
              border: "1px solid #F1D7C8",
              borderRadius: 24,
              padding: 18,
              boxShadow: "0 18px 38px rgba(0,0,0,0.16)",
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 20, color: "#111" }}>
              {lang === "fr" ? "Choisissez votre evenement" : lang === "de" ? "Event auswahlen" : "Choose your event"}
            </div>
            <div style={{ marginTop: 8, color: "#5f5f5f", fontSize: 14 }}>
              {lang === "fr"
                ? "Le menu et les prix s'afficheront ensuite pour cet evenement."
                : lang === "de"
                ? "Danach werden Menu und Preise fur dieses Event geladen."
                : "The menu and prices will then load for this event."}
            </div>
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              style={{
                width: "100%",
                marginTop: 14,
                padding: "14px 16px",
                borderRadius: 16,
                border: "1px solid #F1D7C8",
                background: "white",
                fontSize: 16,
                color: "#111",
              }}
              disabled={loadingEvents}
            >
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={continueToMenu}
              disabled={!selectedEventId || loadingEvents}
              style={{
                marginTop: 14,
                width: "100%",
                padding: "14px 18px",
                borderRadius: 999,
                border: "none",
                fontWeight: 900,
                fontSize: 16,
                color: "white",
                background: "linear-gradient(135deg, #ff7a00, #ff3c00)",
                boxShadow: "0 14px 35px rgba(242,140,40,0.3)",
                cursor: !selectedEventId || loadingEvents ? "not-allowed" : "pointer",
                opacity: !selectedEventId || loadingEvents ? 0.7 : 1,
              }}
            >
              {lang === "fr" ? "Continuer vers le menu" : lang === "de" ? "Weiter zum Menu" : "Continue to menu"}
            </button>
          </div>
        ) : null}

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
            href={events.length > 0 ? "#" : "/menu"}
            onClick={(e) => {
              if (events.length > 0) e.preventDefault();
            }}
            className="af-link-btn"
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
              opacity: events.length > 0 ? 0.5 : 1,
            }}
          >
            {t.menu}
          </a>
          <a
            href="/team/login"
            className="af-link-btn"
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
