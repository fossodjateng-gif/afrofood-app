"use client";

import React from "react";
import { captureCartEventSnapshot, changeCartEvent } from "@/lib/cart";
import { getSavedLang, saveLang, translations, type Lang } from "@/lib/translations";

const EVENT_ID_KEY = "af_event_id";

type EventOption = {
  id: string;
  name: string;
  preorderEnabled?: boolean;
};

export default function Home() {
  const [lang, setLang] = React.useState<Lang>("de");
  const [events, setEvents] = React.useState<EventOption[]>([]);
  const [selectedEventId, setSelectedEventId] = React.useState("");
  const [loadingEvents, setLoadingEvents] = React.useState(true);
  const [changingEvent, setChangingEvent] = React.useState(false);
  const [eventError, setEventError] = React.useState<"conflict" | "unavailable" | "error" | null>(null);
  const eventSnapshot = React.useRef<Awaited<ReturnType<typeof captureCartEventSnapshot>> | null>(null);
  const changingEventRef = React.useRef(false);
  const t = translations[lang];

  React.useEffect(() => {
    setLang(getSavedLang());
  }, []);

  React.useEffect(() => {
    let alive = true;

    async function loadEvents() {
      try {
        const snapshot = await captureCartEventSnapshot();
        if (!alive) return;
        eventSnapshot.current = snapshot;
        const res = await fetch("/api/menu-config", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!alive) return;

        const nextEvents = Array.isArray(data?.storeConfig?.events)
          ? (data.storeConfig.events as Array<{ id?: string; name?: string; preorderEnabled?: boolean }>)
              .map((event) => ({
                id: String(event?.id || "").trim(),
                name: String(event?.name || "").trim(),
                preorderEnabled: event?.preorderEnabled === true,
              }))
              .filter((event) => event.id && event.name)
          : [];
        const publicEvents = nextEvents.some((event) => event.preorderEnabled)
          ? nextEvents.filter((event) => event.preorderEnabled)
          : nextEvents;

        setEvents(publicEvents);

        if (publicEvents.length > 0) {
          const savedId = (localStorage.getItem(EVENT_ID_KEY) || "").trim();
          const activeId = String(data?.storeConfig?.activeEventId || "").trim();
          const savedPublicId = publicEvents.find((event) => event.id === savedId)?.id || "";
          const activePublicId = publicEvents.find((event) => event.id === activeId)?.id || "";
          setSelectedEventId(savedPublicId || activePublicId || publicEvents[0].id);
        } else {
          setSelectedEventId("");
        }
      } finally {
        if (alive) setLoadingEvents(false);
      }
    }

    void loadEvents();
    return () => {
      alive = false;
    };
  }, []);

  async function continueToMenu() {
    const chosen = events.find((event) => event.id === selectedEventId);
    if (!chosen || !eventSnapshot.current || changingEventRef.current) return;
    changingEventRef.current = true;
    setChangingEvent(true);
    setEventError(null);
    try {
      const result = await changeCartEvent(eventSnapshot.current, chosen);
      if (result !== "changed") {
        setEventError(result);
        eventSnapshot.current = await captureCartEventSnapshot();
        // Require a fresh selection after the conflict; do not silently retry.
        setSelectedEventId("");
        return;
      }
      window.location.href = "/menu";
    } catch {
      setEventError("error");
    } finally {
      changingEventRef.current = false;
      setChangingEvent(false);
    }
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
                ? "Seuls les evenements ouverts a la precommande s'affichent ici. Le menu et les prix seront ensuite charges pour cet evenement."
                : lang === "de"
                ? "Hier werden nur Events mit geoffneter Vorbestellung angezeigt. Danach werden Menu und Preise fur dieses Event geladen."
                : "Only events open for preorder are shown here. The menu and prices will then load for this event."}
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
              disabled={loadingEvents || changingEvent}
            >
              <option value="" disabled>{lang === "fr" ? "Choisissez votre événement" : lang === "de" ? "Event auswählen" : "Choose your event"}</option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={continueToMenu}
              disabled={!selectedEventId || loadingEvents || changingEvent}
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
            {eventError ? <p role="alert" style={{ color: "#9f1239", marginTop: 12 }}>
              {eventError === "conflict"
                ? lang === "fr" ? "Le panier, le reçu ou l’événement a changé dans un autre onglet. Rien n’a été effacé. Vérifiez le panier puis sélectionnez à nouveau votre événement."
                  : lang === "de" ? "Warenkorb, Beleg oder Event wurden in einem anderen Tab geändert. Nichts wurde gelöscht. Bitte Warenkorb prüfen und Event erneut auswählen."
                  : "The cart, receipt or event changed in another tab. Nothing was cleared. Review the cart and select your event again."
                : lang === "fr" ? "Le changement d’événement n’a pas pu être effectué en toute sécurité. Vérifiez le panier avant de réessayer."
                  : lang === "de" ? "Das Event konnte nicht sicher gewechselt werden. Bitte Warenkorb vor einem erneuten Versuch prüfen."
                  : "The event could not be changed safely. Review the cart before trying again."}
            </p> : null}
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
